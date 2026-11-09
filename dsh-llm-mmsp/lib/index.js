/**
 * MMSP 协议转换插件 —— DSH 原生的 MMSP 模型路由。
 *
 * ## 一句话
 *
 * 让 DSH 直接用 MMSP 协议调用 `go.penguin.ooo`（普通账号唯一可用的协议）。
 *
 * ## 配置
 *
 * 插件的全部可调项在 `cordis.patch.yml` 的本条目 `config` 里：
 *
 * ```yaml
 * - id: mmsp
 *   name: dsh-llm-mmsp
 *   config:
 *     baseURL: https://go.penguin.ooo
 *     apiKeyEnv: MMSP_API_KEY
 * ```
 *
 * - `provider` —— 注册的路由名，默认 `mmsp`；
 * - `baseURL` —— MMSP 服务端根地址；
 * - `apiKeyEnv` —— 密钥的**引用名**（值走 DSH 凭据库，不进配置文件）。
 *
 * 三个字段都标了 `volatile()`：改它们**不需要重启**，下一次请求就用新值。
 *
 * ## 为什么用 `ctx.get('credentials')` 而不是 `inject`
 *
 * 凭据服务缺失时插件仍应挂载（只是没有可用路由），否则整个 profile 起不来。
 * 与 `dsh-providers-hub` 的做法一致。
 *
 * @module dsh-llm-mmsp
 */
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import z from '@deepseek-ai/schemastery';
import { DEFAULT_BASE_URL, MmspAdapter } from './mmsp-adapter.js';
import { MmspKeyPool, normalizeKeys } from './key-pool.js';

/** 插件在 loader 里的名字（也用于凭据记录的 scope）。 */
export const name = 'llm-mmsp';

/** 注入的服务。`credentials` 是可选的（见模块头说明）。 */
export const inject = ['llm'];

/** 默认的路由名。 */
const DEFAULT_PROVIDER = 'mmsp';

/**
 * 条目 Config schema。
 *
 * ## 为什么必须有
 *
 * DSH 的「设置 → 模型 → 提供商」页只渲染**有 Config schema** 的条目
 * （`ctx.settings.describe()` 对每个注册项调用 `schema.toJSON()`；没有 schema
 * 的条目直接被跳过）。所以少了这一段，本插件在设置页里**整行消失**——
 * 用户既看不到它、也改不了它的上游与密钥引用。
 *
 * ⚠️ 必须是 **schemastery** schema（不是裸函数）：`describe()` 会调
 * `schema.toJSON()`，传裸函数会让**所有**依赖 settings 的界面崩溃。
 *
 * ## 字段
 *
 * - `provider` —— 注册的路由名（默认 `mmsp`）；
 * - `baseURL` —— MMSP 服务端根地址；
 * - `apiKeyEnv` —— 密钥的**引用**名（值走 DSH 凭据库，不进配置文件）。
 *
 * 三个字段都标了 `volatile()`：改它们只需重新注册路由，不必重启 profile。
 */
export const Config = z.object({
  provider: z.string().default(DEFAULT_PROVIDER).volatile(),
  baseURL: z.string().default(DEFAULT_BASE_URL).volatile(),
  // ⚠️ 这个 schemastery 版本**没有** `.optional()`、也没有 `z.null()`：
  //    - `z.string().optional()` → `TypeError: z.string(...).optional is not a function`
  //    - `z.union([z.string(), z.null()])` → `TypeError: z.null is not a function`
  //    两者都会让整个条目**不激活**（DSH 报 "1 entry did not activate"）。
  //    这个版本表达「可为 null」的唯一写法是 `z.union([..., z.const(null)])`。
  apiKeyEnv: z.union([z.string(), z.const(null)]).default(null).volatile(),
  // ── 多密钥池 ───────────────────────────────────────────────────────────
  //
  // 数组顺序 = 优先级（靠前优先）。`ref` 是凭据库里的引用名，密钥值不进配置。
  // `enabled: false` 的条目保留在表里但不参与轮询，方便临时停用某个账号。
  //
  // 留空数组时退回单密钥模式（用上面的 `apiKeyEnv`），保证老配置照常工作。
  //
  // 注意：条目里的 `ref` 用 `z.string()`（必填）而不是「可为 null」——
  // 一个没有 ref 的密钥行没有任何意义，让它在 schema 层就被拒绝，
  // 比留一个空壳行到运行时再报错清楚。
  keys: z.array(z.object({
    ref: z.string(),
    enabled: z.boolean().default(true),
  })).default([]).volatile(),
  // 轮询策略：
  //   round-robin —— 每次请求换下一个可用密钥（负载摊到多个账号）
  //   priority    —— 永远用最靠前的可用密钥（只有它坏了才降级）
  keyStrategy: z.union([z.const('round-robin'), z.const('priority')])
    .default('round-robin')
    .volatile(),
  // 是否向 MMSP 请求思考摘要（`config.thinking_summary: true`）。
  //
  // ## 为什么默认开
  //
  // Gemini 系列**不传**这个键时，`thinking.delta` 一个字都不来，只有
  // `thoughts_tokens` 在计费 —— 用户付了思考的钱却看不到思考（实测：
  // 3.8-flash 默认 thoughts=59 / 思考文本 0 字符；开摘要后 197 字符）。
  // 而开摘要在实测里**不增加** thoughts_tokens（噪声内），只是把已计费的
  // 思考暴露出来。所以默认 `true` 是纯收益。
  //
  // deepseek 系本来就把原始思考流出来（无视该键），开与不开都一样。
  // relay 只接受**布尔值**：`"auto"` 这种字符串会 400（旧结论仍成立）。
  thinkingSummary: z.boolean().default(true).volatile(),
  // ── 自定义请求头 ──────────────────────────────────────────────────────────
  // 支持多行 Key: Value 或 JSON 文本，在发起模型目录与流式请求时合并注入。
  headers: z.union([z.string(), z.const(null)]).default(null).volatile(),
});

/**
 * 读一次密钥。
 *
 * 解析顺序：**DSH 凭据库**（用户可以在 Web 设置里写入）→ **进程环境变量**。
 * 两者都没有时返回 undefined，适配器会报 `MISSING_CREDENTIAL`。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - 插件上下文。
 * @param {string | undefined} apiKeyEnv - 环境变量名。
 * @returns {Promise<string | undefined>} 密钥。
 */
async function readApiKey(ctx, apiKeyEnv) {
  if (apiKeyEnv === undefined || apiKeyEnv.length === 0) return undefined;
  const credentials = ctx.get('credentials');
  if (credentials !== undefined) {
    try {
      const resolved = await credentials.resolve(credentialRef(apiKeyEnv));
      if (resolved !== undefined && resolved.value.length > 0) return resolved.value;
    } catch (error) {
      ctx.logger.warn(`llm-mmsp: 凭据 ${apiKeyEnv} 解析失败：${String(error)}`);
    }
  }
  const fromEnv = ctx.get('launchEnvironment')?.get?.(apiKeyEnv)?.value;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  return undefined;
}

/**
 * 图片附件桥接：把持久化附件读成原始字节供适配器内联。
 *
 * 用 `ctx.get` 而非 `inject` —— 附件服务缺失时 provider 仍可加载，只是
 * 收到图片时报 `UNSUPPORTED_CONTENT`。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - 插件上下文。
 * @returns {(ref: unknown) => Promise<{data: Uint8Array, mediaType: string} | undefined>} 读取函数。
 */
function makeReadImage(ctx) {
  return async (attachment) => {
    const attachments = ctx.get('attachments');
    if (attachments?.readImage === undefined) return undefined;
    try {
      const stored = await attachments.readImage(attachment);
      return { data: stored.data, mediaType: stored.ref.mediaType };
    } catch (error) {
      ctx.logger.warn(`llm-mmsp: 图片附件读取失败：${String(error)}`);
      return undefined;
    }
  };
}

/**
 * 读一个配置字段的实际值。
 *
 * ## 为什么需要这个函数
 *
 * 标了 `volatile()` 的字段在 `config` 里**不是一个裸值**，而是一个
 * `Volatile<T>` **引用**（`cosmokit` 的 `{ get(): T }`）——引用让配置变更
 * 能在**不重启插件**的前提下生效：插件持有引用，每次读时调 `.get()` 拿到
 * 当前快照。
 *
 * ⚠️ 直接 `config.baseURL` 拿到的是那个**引用对象**（不是字符串），
 * 于是 `typeof config.baseURL === 'string'` 为 false，字段被当成"没配"，
 * 路由会退回默认值；而 `apiKeyEnv` 同理变成 undefined → 密钥解析不到 →
 * `MISSING_CREDENTIAL` → `listModels()` 抛错 → **整组模型从目录里消失**。
 *
 * 这正是本插件一度「注册了路由却一个模型都列不出来」的原因。
 *
 * @param {unknown} field - 配置字段（可能是引用，也可能是普通值）。
 * @returns {unknown} 字段的当前值；不是引用时原样返回。
 */
function valueOf(field) {
  if (field !== null && typeof field === 'object' && typeof field.get === 'function') {
    return field.get();
  }
  return field;
}

/**
 * 插件入口。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - 插件上下文。
 * @param {object} config - 条目配置（volatile 字段是引用，见 {@link valueOf}）。
 */
export function apply(ctx, config) {
  const provider = (() => {
    const value = valueOf(config.provider);
    return typeof value === 'string' && value.length > 0 ? value : DEFAULT_PROVIDER;
  })();
  const baseURL = (() => {
    const value = valueOf(config.baseURL);
    return typeof value === 'string' && value.length > 0 ? value : DEFAULT_BASE_URL;
  })();
  const apiKeyEnv = (() => {
    const value = valueOf(config.apiKeyEnv);
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  })();

  /**
   * 当前生效的密钥引用名（每次读都取 volatile 引用的当前快照）。
   *
   * @returns {string | undefined} 密钥引用名。
   */
  const currentApiKeyEnv = () => {
    const value = valueOf(config.apiKeyEnv);
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };

  /**
   * 当前配置的密钥列表（已规范化、保持顺序）。
   *
   * 空数组 = 退回单密钥模式（用 `apiKeyEnv`），老配置照常工作。
   *
   * @returns {{ref: string, enabled: boolean}[]} 密钥描述。
   */
  const currentKeys = () => normalizeKeys(valueOf(config.keys));

  /** 轮询策略（每次读当前值）。 */
  const currentStrategy = () => {
    const value = valueOf(config.keyStrategy);
    return value === 'priority' ? 'priority' : 'round-robin';
  };

  /** 上游根地址（每次读当前值，可热改）。 */
  const currentBaseURL = () => {
    const value = valueOf(config.baseURL);
    return typeof value === 'string' && value.length > 0 ? value : DEFAULT_BASE_URL;
  };

  /** 自定义请求头（每次读当前值，可热改）。 */
  const currentHeaders = () => valueOf(config.headers);

  /** 是否请求思考摘要（每次读当前值，可热改）。 */
  const currentThinkingSummary = () => valueOf(config.thinkingSummary) !== false;

  /** 密钥池：持有轮询游标与冷却记账，跨请求存活。 */
  const pool = new MmspKeyPool();

  /**
   * 按优先级给出本轮候选密钥（**已解析出值**）。
   *
   * 解析顺序与单密钥模式一致：DSH 凭据库 → 进程环境变量。解析不到的引用
   * 直接跳过——配置里有行但凭据没填，不该让整个请求失败。
   *
   * @returns {Promise<{ref: string, value: string}[]>} 候选（按尝试顺序）。
   */
  const resolveCandidates = async () => {
    const keys = currentKeys();

    // 没有配置密钥表 → 单密钥模式。
    if (keys.length === 0) {
      const ref = currentApiKeyEnv();
      if (ref === undefined) return [];
      const value = await readApiKey(ctx, ref);
      return value === undefined ? [] : [{ ref, value }];
    }

    const plan = pool.plan(keys, currentStrategy());
    if (plan.length === 0) {
      // 全部在冷却中：退一步，忽略冷却再来一轮，免得用户在冷却期完全不能用。
      ctx.logger.warn('llm-mmsp: 所有密钥都在冷却中，本轮忽略冷却');
      const fallback = keys.filter((entry) => entry.enabled).map((entry) => entry.ref);
      const resolved = [];
      for (const ref of fallback) {
        const value = await readApiKey(ctx, ref);
        if (value !== undefined) resolved.push({ ref, value });
      }
      return resolved;
    }

    const resolved = [];
    for (const ref of plan) {
      const value = await readApiKey(ctx, ref);
      if (value !== undefined) resolved.push({ ref, value });
    }
    return resolved;
  };

  const adapter = new MmspAdapter({
    baseURL,
    resolveBaseURL: currentBaseURL,
    customHeaders: currentHeaders,
    // ⚠️ 每次请求都**重新读**配置：volatile 字段是引用，改了设置页里的
    //    上游地址、密钥表或策略，下一次请求就该用新值——不必重启插件。
    resolveApiKeyCandidates: resolveCandidates,
    onKeySuccess: (ref) => {
      const keys = currentKeys();
      if (keys.length > 0) pool.recordSuccess(ref, keys);
    },
    onKeyFailure: (ref, code) => {
      pool.recordFailure(ref);
      ctx.logger.warn(`llm-mmsp: 密钥 ${ref} 进入冷却（${code}）`);
    },
    readImage: makeReadImage(ctx),
    thinkingSummary: currentThinkingSummary,
    warn: (message) => ctx.logger.warn(`llm-mmsp: ${message}`),
  });

  /**
   * 幂等注册。
   *
   * 插件 fiber 在配置/补丁应用时序上会重启：新 fiber 的同步 apply 与旧 fiber
   * 的异步 dispose 交错执行，可能出现「同名路由已注册」。那种情况保留现有
   * 路由即可（同一份代码，语义等价），**不是**吞错误——其它失败照常抛出。
   */
  try {
    ctx.llm.registerAdapter([provider], adapter);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already declared|already registered|is already (?:a|an) adapter/.test(message)) throw error;
    ctx.logger.warn(
      `llm-mmsp: 路由 "${provider}" 已注册（插件 fiber 重启竞态），保留现有路由并跳过本次注册`,
    );
  }

  // 把这条路由声明为**可配置 provider**，让「设置 → 模型 → 提供商」里能编辑它。
  //
  // `settingsPath: []` 表示「这一行自己就是设置地址」——设置页的 `configured`
  // 判据是 `namespace 存在 && (settingsPath.length === 0 || …)`，所以空路径
  // 恒为「已配置」，这一行会常驻在页面上（而不是变成一张待设置的卡片）。
  try {
    const settingsNs = ctx.fiber?.entry?.options?.id ?? 'mmsp';
    ctx.llm.registerConfigurableProviders([
      {
        provider,
        displayName: 'MMSP (Penguin)',
        settingsNs,
        settingsPath: [],
        declared: true,
        defaultBaseURL: baseURL,
        ...apiKeyEnv === undefined ? {} : { nativeAuth: { env: [apiKeyEnv], oauth: false } },
      },
    ]);
  } catch (error) {
    // 目录声明失败**不阻断**路由注册：路由本身已经可用了。
    ctx.logger.warn(`llm-mmsp: 可配置 provider 声明失败（路由仍可用）：${String(error)}`);
  }

  ctx.logger.info(
    `llm-mmsp: 已注册路由 "${provider}" → ${baseURL}`
    + (apiKeyEnv === undefined ? '（未配置密钥引用）' : `（密钥引用 ${apiKeyEnv}）`),
  );

  // ── 密钥写入通道 ────────────────────────────────────────────────────────
  //
  // 设置页要能**直接改密钥值**，而浏览器侧没有写凭据的 cordis 服务。这里给
  // Host 侧注册一个 loopback 路由，前端 `fetch` 它，由 Host 调
  // `ctx.credentials.set()`——那是凭据服务的正式写入 API（`CredentialRef`
  // 那一半：写进 provider-managed 存储，优先于环境变量）。
  //
  // 方法沿用本机已验证可用的 `dsh-skills-manager` 同一写法
  // （`ctx.webServer.register({ kind: 'prefix', path, handler })`）。
  //
  // ⚠️ 只接受 loopback 来源：这个路由能写凭据，不能暴露给局域网。
  registerKeyRoute(ctx, {
    currentRef: () => currentApiKeyEnv(),
    // 密钥池的使用状态（每条用了几次 / 冷却剩多久 / 下一条是谁）。
    // 轮询发生在后台，不给界面一个读数就只能靠翻日志。
    usage: () => pool.snapshot(currentKeys()),
    strategy: () => currentStrategy(),
  });
}

/** 密钥写入路由的路径前缀。 */
const KEY_ROUTE_PATH = '/api/dsh-llm-mmsp/key';

/** 请求体上限：密钥是小字符串，64 KiB 足够。 */
const KEY_BODY_MAX = 64 * 1024;

/**
 * 判断请求是否来自本机。
 *
 * DSH 的 Web 服务默认绑 loopback，但既然这个路由能改凭据，仍然显式校验一次
 * ——把「配置失误暴露到局域网」挡在插件自己这一层。
 *
 * @param {import('node:http').IncomingMessage} req - 请求。
 * @returns {boolean} 是否本机来源。
 */
function isLoopback(req) {
  const address = req.socket?.remoteAddress;
  if (typeof address !== 'string') return false;
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1';
}

/**
 * 读请求体（带上限）。
 *
 * @param {import('node:http').IncomingMessage} req - 请求。
 * @returns {Promise<string>} UTF-8 文本。
 */
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > KEY_BODY_MAX) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * 写 JSON 响应。
 *
 * @param {import('node:http').ServerResponse} res - 响应。
 * @param {number} status - HTTP 状态码。
 * @param {object} payload - JSON 载荷。
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

/**
 * 注册密钥写入路由。
 *
 * - `GET  {KEY_ROUTE_PATH}/status?ref=A&ref=B`  → 批量问配没配（同一个 ref 可重复）
 * - `GET  {KEY_ROUTE_PATH}/usage`               → 密钥池使用状态（次数 / 冷却 / 下一条）
 * - `POST {KEY_ROUTE_PATH}/set`   体 `{ "ref": "...", "value": "..." }` → 写密钥
 * - `POST {KEY_ROUTE_PATH}/unset` 体 `{ "ref": "..." }`             → 删密钥
 *
 * 批量版是给多密钥列表用的：一次请求问完所有行，避免 N 个密钥发 N 次请求。
 *
 * `webServer` 是可选依赖：没有它（headless 部署）时静默跳过，插件其余功能
 * 不受影响。
 *
 * @param {object} ctx - 插件上下文。
 * @param {object} faces - 读插件内部状态的几个入口。
 * @param {() => string | undefined} faces.currentRef - 当前配置的密钥引用名。
 * @param {() => object} faces.usage - 密钥池使用状态。
 * @param {() => string} faces.strategy - 当前轮询策略。
 */
function registerKeyRoute(ctx, faces) {
  const webServer = ctx.get('webServer');
  if (webServer?.register === undefined) {
    ctx.logger.info('llm-mmsp: 无 webServer，跳过密钥写入路由（可用配置文件改密钥引用）');
    return;
  }

  const credentials = () => ctx.get('credentials');

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: KEY_ROUTE_PATH,
    handler: async (req, res) => {
      if (!isLoopback(req)) {
        sendJson(res, 403, { ok: false, error: '只接受本机请求' });
        return;
      }

      const url = new URL(req.url ?? '/', 'http://localhost');
      const action = url.pathname.slice(KEY_ROUTE_PATH.length).replace(/^\/+/, '');

      try {
        // `usage` 不需要凭据服务，先处理。
        if (req.method === 'GET' && action === 'usage') {
          sendJson(res, 200, {
            ok: true,
            value: { ...faces.usage(), strategy: faces.strategy() },
          });
          return;
        }

        const store = credentials();
        if (store === undefined) {
          sendJson(res, 503, { ok: false, error: '凭据服务不可用' });
          return;
        }

        if (req.method === 'GET' && action === 'status') {
          // 支持 `?ref=A&ref=B`（批量）与 `?ref=A`（单个）。
          const asked = url.searchParams.getAll('ref').filter((ref) => ref.length > 0);
          const refs = asked.length > 0
            ? asked
            : [faces.currentRef()].filter((ref) => typeof ref === 'string' && ref.length > 0);

          if (refs.length === 0) {
            sendJson(res, 200, { ok: true, value: { entries: [] } });
            return;
          }

          const entries = await Promise.all(refs.map(async (ref) => {
            try {
              const info = await store.describe(ref);
              return { ref, configured: info.configured === true, writable: info.writable !== false };
            } catch {
              // 单个 ref 查不到不该让整批失败。
              return { ref, configured: false, writable: false, error: true };
            }
          }));
          sendJson(res, 200, { ok: true, value: { entries } });
          return;
        }

        if (req.method === 'POST' && action === 'set') {
          const body = JSON.parse(await readBody(req));
          const ref = body.ref ?? faces.currentRef();
          if (typeof ref !== 'string' || ref.length === 0) {
            sendJson(res, 400, { ok: false, error: '缺少 ref' });
            return;
          }
          if (typeof body.value !== 'string' || body.value.trim().length === 0) {
            sendJson(res, 400, { ok: false, error: '密钥不能为空' });
            return;
          }
          await store.set(ref, body.value.trim());
          ctx.logger.info(`llm-mmsp: 已更新密钥 ${ref}`);
          sendJson(res, 200, { ok: true, value: { ref, configured: true } });
          return;
        }

        if (req.method === 'POST' && action === 'unset') {
          const body = JSON.parse(await readBody(req));
          const ref = body.ref ?? faces.currentRef();
          if (typeof ref !== 'string' || ref.length === 0) {
            sendJson(res, 400, { ok: false, error: '缺少 ref' });
            return;
          }
          await store.unset(ref);
          ctx.logger.info(`llm-mmsp: 已清除密钥 ${ref}`);
          sendJson(res, 200, { ok: true, value: { ref, configured: false } });
          return;
        }

        sendJson(res, 404, { ok: false, error: `未知操作: ${action || '(空)'}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.logger.warn(`llm-mmsp: 密钥路由失败：${message}`);
        sendJson(res, 400, { ok: false, error: message });
      }
    },
  }), 'llm-mmsp: key write route');
}
