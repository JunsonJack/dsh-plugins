/**
 * MMSP 的 harness LLM 适配器。
 *
 * ## 这个插件解决什么
 *
 * `go.penguin.ooo` 把 Anthropic / OpenAI / Google 兼容协议锁在 VIP 后面，
 * 普通账号只剩 **MMSP**（Model Message Stream Protocol）。DSH 本身不支持
 * 这个协议，所以本插件直接实现 `LlmAdapter`：DSH 用 harness 的消息/工具/
 * 思考模型发请求，适配器在进程内转成 MMSP，再把事件流转回 `StreamChunk`。
 *
 * 于是工具调用、思考块、token 用量都走 harness 原生那一套，配置面也只有
 * `cordis.patch.yml` 一处。
 *
 * @module dsh-llm-mmsp/adapter
 */
import {
  LlmAdapter,
  LlmError,
  ReasoningEffortId,
  attributionHeaders,
  contentHasImage,
  errorChain,
  isContextWindowExceededError,
  isQuotaExceededError,
  normalizeApiKey,
} from '@deepseek-ai/dsh-llm';
import {
  MmspStreamDecoder,
  MMSP_OPAQUE_ERROR,
  buildMmspRequest,
  parseHeaders,
  thinkingLevelsForModel,
} from './mmsp-protocol.js';
import { isKeyFault } from './key-pool.js';

export { parseHeaders };

/** 插件名，用于错误前缀。 */
const PKG = 'mmsp';

/**
 * 思考等级的中文名（选择器里显示给人看的）。
 *
 * 键必须覆盖 {@link import('./mmsp-protocol.js').MMSP_THINKING_LEVELS} 的每一项
 * ——{@link thinkingLevelsForModel} 只会产出那六个值。
 *
 * @type {Readonly<Record<string, string>>}
 */
const THINKING_LEVEL_LABELS = Object.freeze({
  none: '关闭',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
  max: '最高',
});

/** 默认上游（MMSP 服务端根地址）。 */
export const DEFAULT_BASE_URL = 'https://go.penguin.ooo';

/** 默认的模型目录超时（毫秒）。 */
const DEFAULT_MODELS_TIMEOUT_MS = 8_000;

/** 一次模型目录查询最多读多少个模型。 */
const MAX_LISTED_MODELS = 200;

/**
 * 把上游的一个 HTTP 状态映射成 harness 的失败码。
 *
 * relay 把**所有**上游错误压成 400 `Model request failed`，因此这个映射
 * 只能按状态码尽力而为；能分辨的靠报文里的关键字。
 *
 * @param {number} status - HTTP 状态码。
 * @param {string} body - 响应体（已读成文本）。
 * @returns {string} harness 的失败码。
 */
export function failureCodeFor(status, body) {
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 404) return 'UNKNOWN_MODEL';
  if (status >= 500) return 'SERVER';
  const detail = `${status} ${body}`;
  if (isContextWindowExceededError(detail)) return 'CONTEXT_WINDOW_EXCEEDED';
  if (isQuotaExceededError(detail)) return 'QUOTA';
  if (status === 400) return 'BAD_REQUEST';
  return 'SERVER';
}

/**
 * MMSP 适配器。
 *
 * ## 一次调用发生了什么
 *
 * 1. `stream()` 把 harness 消息序列转成 MMSP 请求体（见 `mmsp-protocol.js`）；
 * 2. `POST {baseURL}/api/v1/stream`，读 SSE 事件流；
 * 3. 每个事件帧喂给 {@link MmspStreamDecoder}，产出 harness `StreamChunk`。
 *
 * ## 图片
 *
 * relay **不去抓远程图片 URL**（实测：带 `https://` 的 `image_url.done` 直接
 * 400）。harness 的图片是本地附件，所以适配器先把字节读出来内联成
 * `data:` URI 再发。
 */
export class MmspAdapter extends LlmAdapter {
  /**
   * @param {object} options - 适配器选项。
   * @param {string} options.baseURL - MMSP 服务端根地址。
   * @param {() => Promise<string | undefined>} [options.resolveApiKey] - 取单个密钥（旧接口，单 key 时用）。
   * @param {() => Promise<{ref: string, value: string}[]>} [options.resolveApiKeyCandidates] - 按优先级给出本轮候选密钥（多 key 轮询）。
   * @param {(ref: string) => void} [options.onKeySuccess] - 某密钥成功。
   * @param {(ref: string, code: string) => void} [options.onKeyFailure] - 某密钥因密钥本身失败（AUTH/RATE_LIMIT）。
   * @param {(ref: import('@deepseek-ai/dsh-llm').ImageAttachmentRef) => Promise<{data: Uint8Array, mediaType: string} | undefined>} [options.readImage] - 读图片附件。
   * @param {(message: string) => void} [options.warn] - 诊断输出。
   * @param {number} [options.modelsTimeoutMs] - 模型目录超时。
   * @param {() => boolean} [options.thinkingSummary] - 是否请求思考摘要（每次请求现读，可热改）。
   * @param {() => string} [options.resolveBaseURL] - 动态获取上游根地址（可热改）。
   * @param {(() => unknown) | unknown} [options.customHeaders] - 自定义请求头（可热改）。
   */
  constructor(options) {
    super();
    this.options = options;
  }

  /**
   * MMSP 服务端根地址。
   * 支持通过 options.resolveBaseURL 动态读取最新配置，改动即时生效。
   *
   * @returns {string} 归一化后的 Base URL。
   */
  get baseURL() {
    const base = this.options.resolveBaseURL?.() ?? this.options.baseURL ?? DEFAULT_BASE_URL;
    return String(base).replace(/\/+$/, '');
  }

  /**
   * 当前生效的自定义请求头。
   * 每次请求时动态计算，支持热更新。
   *
   * @returns {Record<string, string>}
   */
  customHeaders() {
    const raw = typeof this.options.customHeaders === 'function'
      ? this.options.customHeaders()
      : this.options.customHeaders;
    return parseHeaders(raw);
  }

  /**
   * 本轮要依次尝试的密钥。
   *
   * 有 `resolveApiKeyCandidates` 就用它（多 key 轮询/优先级）；否则退回单 key
   * 的旧接口，把结果包成单元素数组。**两种都返回数组**，让上层只有一条路径。
   *
   * @returns {Promise<{ref: string, value: string}[]>} 候选密钥（按尝试顺序）。
   */
  async apiKeyCandidates() {
    if (this.options.resolveApiKeyCandidates !== undefined) {
      const list = await this.options.resolveApiKeyCandidates();
      return Array.isArray(list) ? list : [];
    }
    const value = await this.options.resolveApiKey?.();
    if (typeof value !== 'string' || value.length === 0) return [];
    return [{ ref: '(default)', value }];
  }

  /**
   * 路由的显示元数据。
   *
   * @param {string} provider - 路由名。
   * @returns {{id: string, name: string}} 显示元数据。
   */
  providerInfo(provider) {
    return { id: provider, name: 'MMSP (Penguin)' };
  }

  /**
   * 列出上游广告的模型。
   *
   * 实测 `GET /api/v1/models` 对**任何账号**都返回 200（即使协议权限被锁），
   * 且返回 OpenAI 形状的 `{data:[{id, owned_by}]}`。
   *
   * @param {string} _provider - 路由名（本适配器只有一个）。
   * @returns {Promise<import('@deepseek-ai/dsh-llm').LlmModelInfo[]>} 模型目录。
   */
  async listModels(_provider) {
    const models = await this.fetchModelCatalog();
    return models.map((model) => ({
      provider: _provider,
      id: model.id,
      name: model.name ?? model.id,
      ...model.inputModalities === undefined ? {} : { inputModalities: model.inputModalities },
    }));
  }

  /**
   * 解析一个模型的能力元数据。
   *
   * ⚠️ **不编造窗口大小**：relay 的 `/api/v1/models` 只给 id 与 owned_by，
   * 没有 context_window。编一个会让 harness 的自动压缩在错误的阈值触发。
   * 因此不声明 `context`，让 harness 用它自己的默认值。
   *
   * ## 思考档位：六档全声明，但不给「模型会拒的那一档」
   *
   * MMSP 的 `thinking_level` 是 `none` / `low` / `medium` / `high` / `xhigh` /
   * `max` 六档（实测全部被 relay 接受），所以这里把六档**原样**声明出去——
   * 用户选 `max` 就该真的发 `max`，而不是被我们压成 `high`。
   *
   * 唯一例外是 `none`：`gemini-4-argon` 收 `none` 会稳定 400（实测），它只有
   * `low` 及以上。对这种模型**不声明** `none`，选择器里就不会出现「关闭」。
   * （即便真的被要求 `none`，{@link thinkingLevelFor} 也会兜到 `low`。）
   *
   * `defaultEffort` **刻意不声明**：不写就是「保持上游默认」，而各模型的默认
   * 差别很大（argon 默认不思考，deepseek-flash 默认 15 个思考 token）。写死一个
   * 会改变用户既有的成本曲线，属于越权。
   *
   * @param {string} provider - 路由名。
   * @param {string} model - 模型 id。
   * @param {AbortSignal} [_signal] - 取消信号。
   * @returns {Promise<import('@deepseek-ai/dsh-llm').LlmResolvedModelInfo>} 模型元数据。
   */
  async resolveModel(provider, model, _signal) {
    const levels = thinkingLevelsForModel(model);
    return {
      provider,
      id: model,
      name: model,
      reasoning: {
        efforts: levels.map((level) => ({
          id: ReasoningEffortId(level),
          name: THINKING_LEVEL_LABELS[level],
        })),
      },
    };
  }

  /**
   * 拉取并缓存上游模型目录。
   *
   * @param {AbortSignal} [signal] - 取消信号。
   * @returns {Promise<{id: string, name?: string, inputModalities?: string[]}[]>} 目录条目。
   */
  async fetchModelCatalog(signal) {
    // 目录请求也走候选：第一个密钥坏了不该让整组模型消失。
    const candidates = await this.apiKeyCandidates();
    if (candidates.length === 0) {
      throw new LlmError(
        'mmsp: 没有可用的 API 密钥。请在设置里添加密钥，或导出对应的环境变量。',
        'MISSING_CREDENTIAL',
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.modelsTimeoutMs ?? DEFAULT_MODELS_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    let lastError;
    try {
      for (const candidate of candidates) {
        const checked = normalizeApiKey(candidate.value);
        if (!checked.ok) continue;
        const custom = this.customHeaders();
        const response = await fetch(`${this.baseURL}/api/v1/models`, {
          method: 'GET',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            ...attributionHeaders(),
            accept: 'application/json',
            authorization: `Bearer ${checked.value}`,
            'x-api-key': checked.value,
            ...custom,
          },
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          const code = failureCodeFor(response.status, `${response.status} ${text}`);
          const error = new LlmError(
            `mmsp: 模型目录请求失败（HTTP ${response.status}）：${text.slice(0, 200)}`,
            code,
            { status: response.status },
          );
          if (isKeyFault(code)) {
            this.options.onKeyFailure?.(candidate.ref, code);
            lastError = error;
            continue;
          }
          throw error;
        }
        const body = await response.json();
        const data = Array.isArray(body?.data) ? body.data : [];
        const out = [];
        for (const entry of data) {
          if (!entry || typeof entry !== 'object') continue;
          const id = typeof entry.id === 'string' ? entry.id : '';
          if (id.length === 0) continue;
          out.push({
            id,
            ...typeof entry.name === 'string' && entry.name.length > 0 ? { name: entry.name } : {},
          });
          if (out.length >= MAX_LISTED_MODELS) break;
        }
        this.options.onKeySuccess?.(candidate.ref);
        return out;
      }
      throw lastError ?? new LlmError('mmsp: 所有密钥都无法读取模型目录。', 'MISSING_CREDENTIAL');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /**
   * 把 harness 消息里的图片附件内联成 data URI。
   *
   * ⚠️ relay 不抓远程 URL，所以必须内联。读不到字节时**抛错**而不是静默丢图
   * ——静默丢图会让用户以为模型看到了图。
   *
   * @param {readonly import('@deepseek-ai/dsh-llm').RequestMessage[]} messages - 消息。
   * @returns {Promise<Map<string, string>>} 附件 id → data URI。
   */
  async inlineImages(messages) {
    /** @type {Map<string, string>} */
    const uris = new Map();
    const readImage = this.options.readImage;
    if (readImage === undefined) {
      for (const message of messages) {
        if (Array.isArray(message.content) && contentHasImage(message.content)) {
          throw new LlmError(
            'mmsp: 收到图片但未注入附件读取通道（readImage）。请确认 profile 已装载 @deepseek-ai/dsh-attachment-local。',
            'UNSUPPORTED_CONTENT',
          );
        }
      }
      return uris;
    }
    for (const message of messages) {
      if (!Array.isArray(message.content)) continue;
      for (const block of message.content) {
        if (!block || block.type !== 'image') continue;
        const id = String(block.attachment?.attachmentId);
        if (uris.has(id)) continue;
        const stored = await readImage(block.attachment);
        if (stored === undefined) {
          throw new LlmError('mmsp: 图片附件读取失败，无法把图片内联进请求。', 'UNSUPPORTED_CONTENT');
        }
        const bytes = stored.data instanceof Uint8Array ? stored.data : new Uint8Array(stored.data);
        uris.set(id, `data:${stored.mediaType};base64,${Buffer.from(bytes).toString('base64')}`);
      }
    }
    return uris;
  }

  /**
   * 发起一次模型调用并把 MMSP 事件流翻译成 harness chunk。
   *
   * ## 多密钥：逐个尝试，只在**密钥本身**出错时换下一个
   *
   * `AUTH`（401/403）与 `RATE_LIMIT`（429）才换下一个密钥；`BAD_REQUEST` /
   * `TRANSPORT` / `SERVER` 直接抛出——请求本身有问题或网络断了，换密钥也一样，
   * 交给 harness 自己的重试策略更合适（换密钥还会白烧一次配额）。
   *
   * ⚠️ 一旦开始 yield chunk 就**不能再换密钥**：流已经吐给上层了，中途换来源
   * 会让同一条回复混进两个账号的内容。所以「换密钥」只发生在**首帧之前**。
   *
   * @param {import('@deepseek-ai/dsh-llm').GenerateOptions} options - harness 请求。
   * @returns {AsyncIterable<import('@deepseek-ai/dsh-llm').StreamChunk>} chunk 流。
   */
  async *stream(options) {
    const candidates = await this.apiKeyCandidates();
    if (candidates.length === 0) {
      throw new LlmError(
        'mmsp: 没有可用的 API 密钥。请在设置里添加密钥，或导出对应的环境变量。',
        'MISSING_CREDENTIAL',
      );
    }

    const imageDataUris = await this.inlineImages(options.messages ?? []);
    const payload = buildMmspRequest({
      model: options.model,
      system: options.system,
      messages: options.messages,
      tools: options.tools,
      maxTokens: options.maxTokens,
      reasoningEffort: options.reasoningEffort,
      // 每次请求现读：设置页里翻这个开关，下一次请求就生效。
      thinkingSummary: this.options.thinkingSummary?.(),
      imageDataUris,
    });

    let lastError;
    for (const candidate of candidates) {
      const checked = normalizeApiKey(candidate.value);
      if (!checked.ok) {
        // 密钥格式不对也算这个密钥的问题，换下一个。
        lastError = new LlmError(
          checked.reason === 'empty'
            ? `mmsp: 密钥 ${candidate.ref} 是空的。`
            : `mmsp: 密钥 ${candidate.ref} 含有 HTTP 头无法承载的字符。`,
          'INVALID_CREDENTIAL',
        );
        this.options.onKeyFailure?.(candidate.ref, 'INVALID_CREDENTIAL');
        continue;
      }

      const custom = this.customHeaders();
      let response;
      try {
        response = await fetch(`${this.baseURL}/api/v1/stream`, {
          method: 'POST',
          redirect: 'error',
          ...options.signal === undefined ? {} : { signal: options.signal },
          headers: {
            ...attributionHeaders(),
            'content-type': 'application/json',
            accept: 'text/event-stream',
            authorization: `Bearer ${checked.value}`,
            'x-api-key': checked.value,
            ...custom,
          },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        if (options.signal?.aborted === true) throw error;
        // 网络层失败：怪不到密钥，直接抛。
        throw new LlmError(`mmsp: 请求上游失败：${errorChain(error)}`, 'TRANSPORT', { cause: error });
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const code = failureCodeFor(response.status, `${response.status} ${text}`);
        const error = new LlmError(
          `mmsp: 上游返回 HTTP ${response.status}：${text.slice(0, 300)}`,
          code,
          { status: response.status },
        );
        if (isKeyFault(code)) {
          // 这个密钥的账：记失败、换下一个。
          this.options.onKeyFailure?.(candidate.ref, code);
          this.options.warn?.(`llm-mmsp: 密钥 ${candidate.ref} 失败（${code}），换下一个`);
          lastError = error;
          continue;
        }
        throw error;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/event-stream')) {
        // 网关返回 200 + HTML 拦截页时，解析不出任何帧 → 会被误判成空响应。
        const peek = await response.text().catch(() => '');
        throw new LlmError(
          `mmsp: 上游未返回事件流（content-type: ${contentType || '(空)'}）：${peek.slice(0, 200)}`,
          'SERVER',
          { status: response.status },
        );
      }

      // 到这里才开始产出：之后不再换密钥。
      this.options.onKeySuccess?.(candidate.ref);

      const decoder = new MmspStreamDecoder(options.model);
      try {
        for await (const frame of readMmspFrames(response)) {
          for (const chunk of decoder.feed(frame)) yield chunk;
        }
      } catch (error) {
        if (error instanceof LlmError) throw error;
        throw new LlmError(`mmsp: 请求上游失败：${errorChain(error)}`, 'TRANSPORT', { cause: error });
      }
      // 上游没发 stop 事件时的兜底收尾。
      for (const chunk of decoder.finalize()) yield chunk;
      return;
    }

    // 所有候选都因密钥问题失败。
    throw lastError ?? new LlmError(
      'mmsp: 所有密钥都不可用（可能在冷却中，或凭据已失效）。',
      'MISSING_CREDENTIAL',
    );
  }
}

/**
 * 从一个 SSE 响应体里逐帧读出 MMSP 事件。
 *
 * relay 的帧格式是每行 `data: {json}`，以 `data: [DONE]` 结束。
 *
 * @param {Response} response - 上游响应。
 * @returns {AsyncIterable<Record<string, unknown>>} 事件帧。
 */
export async function* readMmspFrames(response) {
  const reader = response.body?.getReader();
  if (reader === undefined) return;
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (line.length === 0) continue;
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload.length === 0 || payload === '[DONE]') continue;
        let frame;
        try {
          frame = JSON.parse(payload);
        } catch {
          continue; // 坏帧直接跳过，不让一个坏行打死整条流。
        }
        if (frame && typeof frame === 'object') {
          // 一帧里带一个 error 字段 = 上游报错（relay 的惯用形状）。
          if (frame.error !== undefined && frame.error !== null) {
            const error = frame.error;
            const message = typeof error === 'object' && error !== null
              ? (error.message ?? JSON.stringify(error))
              : String(error);
            throw new LlmError(`mmsp: 上游返回错误：${message}`, 'BAD_REQUEST');
          }
          yield frame;
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

/**
 * 上游把一切错误压成 400 `Model request failed`，这句话本身没有诊断价值。
 * 供日志与 UI 使用的可读摘要。
 *
 * @param {unknown} error - 捕获到的错误。
 * @returns {string} 摘要。
 */
export function describeFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes(MMSP_OPAQUE_ERROR)) {
    return '上游把错误压成了 "Model request failed"，无法区分限流 / 上下文超长 / 配额耗尽。';
  }
  return message;
}
