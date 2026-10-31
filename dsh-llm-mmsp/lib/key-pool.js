/**
 * 多密钥池：优先级排序 + 轮询 + 故障冷却。
 *
 * ## 三件事，一套顺序
 *
 * 1. **优先级** —— 配置里 `keys` 数组的顺序就是优先级，靠前优先。
 * 2. **轮询** —— 每次请求按顺序换下一个可用密钥，把负载摊到多个账号上。
 * 3. **故障冷却** —— 某个密钥报 401/403（凭据废了）或 429（限流），
 *    就让它冷却一段时间，期间跳过；冷却结束自动回到候选里。
 *
 * 三者共用**同一个顺序**：都是「`keys` 的顺序，从游标位置开始转一圈」。
 * 所以拖拽调整顺序会同时改变优先级和轮询次序 —— 不需要两套配置。
 *
 * ## 为什么冷却而不是永久剔除
 *
 * 429 是临时的（等一会儿就好），401 可能是因为用户在别处换了密钥而本地
 * 只是暂时过期。永久剔除会让「修好了却再也用不上」，用户还得重启插件。
 * 冷却到期自动复活，符合直觉。
 *
 * ## 纯逻辑，不碰网络
 *
 * 这个模块只做排序、游标推进、冷却记账。真正的「读密钥值」由调用方注入
 * （`resolve`），因此可以完全脱离 DSH 单测。
 *
 * @module dsh-llm-mmsp/key-pool
 */

/** 默认冷却时长：60 秒。 */
export const DEFAULT_COOLDOWN_MS = 60_000;

/**
 * 规范化配置里的 `keys` 数组。
 *
 * 容忍脏数据：非数组 → 空；元素不是对象 / `ref` 不是非空字符串 → 跳过；
 * `enabled` 省略视为启用。**保留顺序**，因为顺序就是优先级。
 *
 * @param {unknown} raw - 配置里的 `keys` 值。
 * @returns {{ref: string, enabled: boolean}[]} 规范化后的密钥描述。
 */
export function normalizeKeys(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const ref = Reflect.get(entry, 'ref');
    if (typeof ref !== 'string') continue;
    const trimmed = ref.trim();
    if (trimmed.length === 0) continue;
    // 同名重复只保留第一次出现的位置（防止拖拽过程中产生重复行）。
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push({ ref: trimmed, enabled: Reflect.get(entry, 'enabled') !== false });
  }
  return out;
}

/**
 * 密钥池。
 *
 * 一个插件实例持有一个，跨请求保留轮询游标与冷却记账。
 */
export class MmspKeyPool {
  /** 轮询游标：下一个请求从这一位开始找可用密钥。 */
  #cursor = 0;

  /** 冷却记账：ref → 冷却到期的时刻（毫秒）。 */
  #cooldownUntil = new Map();

  /** 成功次数：ref → 次数（用于看出轮询是否真的在切）。 */
  #successCount = new Map();

  /** 最近一次成功的 ref（界面显示「当前在用哪条」）。 */
  #lastUsed = undefined;

  /** 最近一次成功的时间戳。 */
  #lastUsedAt = undefined;

  /**
   * @param {object} [options] - 选项。
   * @param {() => number} [options.now] - 时间源（测试可注入）。
   * @param {number} [options.cooldownMs] - 冷却时长。
   */
  constructor(options = {}) {
    this.now = options.now ?? (() => Date.now());
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  /**
   * 导出可观测状态。
   *
   * 轮询发生在后台，界面上原本完全看不到——「怎么验证真的在切换」就成了
   * 一个只能靠日志回答的问题。这个方法把内部记账摊开给 UI：
   * 每条密钥用了几次、还剩多久冷却、最近一次用的是谁。
   *
   * @param {{ref: string, enabled: boolean}[]} keys - 规范化后的密钥列表。
   * @returns {object} 状态快照。
   */
  snapshot(keys) {
    const now = this.now();
    const entries = keys.map((entry) => {
      const until = this.#cooldownUntil.get(entry.ref);
      const coolingMs = until === undefined ? 0 : Math.max(0, until - now);
      return {
        ref: entry.ref,
        enabled: entry.enabled,
        coolingMs,
        successes: this.#successCount.get(entry.ref) ?? 0,
      };
    });
    const usable = entries.filter((entry) => entry.enabled && entry.coolingMs === 0);
    return {
      entries,
      /** 下一条会被用到的密钥（轮询游标所在）。 */
      next: usable.length === 0 ? undefined : usable[this.#cursor % usable.length]?.ref,
      lastUsed: this.#lastUsed,
      lastUsedAt: this.#lastUsedAt,
      total: this.#successCount.size === 0
        ? 0
        : [...this.#successCount.values()].reduce((sum, count) => sum + count, 0),
    };
  }

  /**
   * 某个引用当前是否在冷却中。
   *
   * @param {string} ref - 引用名。
   * @returns {boolean} 是否冷却中。
   */
  isCooling(ref) {
    const until = this.#cooldownUntil.get(ref);
    if (until === undefined) return false;
    if (this.now() >= until) {
      // 冷却到期，清掉记账（复活）。
      this.#cooldownUntil.delete(ref);
      return false;
    }
    return true;
  }

  /**
   * 按优先级给出这一轮要尝试的引用顺序。
   *
   * 返回的顺序已经剔除：
   * - 配置里 `enabled: false` 的；
   * - 正在冷却的。
   *
   * `round-robin` 从游标位置开始绕一圈（游标指向的排最前）；
   * `priority` 永远从头开始 —— 只用最靠前的健康密钥，不做负载摊分。
   *
   * @param {{ref: string, enabled: boolean}[]} keys - 规范化后的密钥列表。
   * @param {'round-robin' | 'priority'} [strategy] - 策略。
   * @returns {string[]} 本轮尝试顺序（可能为空）。
   */
  plan(keys, strategy = 'round-robin') {
    const usable = keys
      .filter((entry) => entry.enabled)
      .filter((entry) => !this.isCooling(entry.ref))
      .map((entry) => entry.ref);

    if (usable.length === 0) return [];
    if (strategy === 'priority') return usable;

    const start = this.#cursor % usable.length;
    return [...usable.slice(start), ...usable.slice(0, start)];
  }

  /**
   * 记一次成功：清冷却，并把游标移到**下一个**位置（轮询）。
   *
   * @param {string} ref - 成功的引用。
   * @param {{ref: string, enabled: boolean}[]} keys - 规范化后的密钥列表。
   */
  recordSuccess(ref, keys) {
    this.#cooldownUntil.delete(ref);
    this.#successCount.set(ref, (this.#successCount.get(ref) ?? 0) + 1);
    this.#lastUsed = ref;
    this.#lastUsedAt = this.now();
    const usable = keys.filter((entry) => entry.enabled).map((entry) => entry.ref);
    const index = usable.indexOf(ref);
    this.#cursor = index < 0 ? 0 : (index + 1) % usable.length;
  }

  /**
   * 记一次失败：进入冷却。
   *
   * 只应由**密钥相关**的失败调用（401/403/429）。网络错误不该算密钥的账。
   *
   * @param {string} ref - 失败的引用。
   */
  recordFailure(ref) {
    this.#cooldownUntil.set(ref, this.now() + this.cooldownMs);
  }

  /**
   * 清空全部状态（配置变更时用，避免旧游标/旧冷却影响新配置）。
   */
  reset() {
    this.#cursor = 0;
    this.#cooldownUntil.clear();
    this.#successCount.clear();
    this.#lastUsed = undefined;
    this.#lastUsedAt = undefined;
  }
}

/**
 * 判断一个失败码是否**归咎于密钥**，从而值得换下一个密钥重试。
 *
 * - `AUTH`（401/403）：这个密钥废了 → 换。
 * - `RATE_LIMIT`（429）：这个密钥限流 → 换。
 *
 * 其余一律**不换**：`BAD_REQUEST`（请求本身有问题，换密钥也一样）、
 * `TRANSPORT`（网络断了，怪不到密钥）、`SERVER`（上游 5xx）都直接抛出，
 * 交给 harness 自己的重试策略。
 *
 * @param {string | undefined} code - 失败码。
 * @returns {boolean} 是否值得换密钥重试。
 */
export function isKeyFault(code) {
  return code === 'AUTH' || code === 'RATE_LIMIT';
}
