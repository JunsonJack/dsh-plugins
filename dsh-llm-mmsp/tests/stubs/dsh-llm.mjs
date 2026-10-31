/**
 * `@deepseek-ai/dsh-llm` 的最小替身。
 *
 * 只实现适配器真正用到的那几个符号。目的是让**适配器的真实代码**能在
 * 普通 node 进程里跑（DSH 的那些包只在 DSH 安装目录里）。
 *
 * ⚠️ 这是**测试替身**，不是生产实现：DSH 里跑的是真正的 `dsh-llm`。
 *
 * @module dsh-llm-mmsp/stubs/dsh-llm
 */

/** harness 的错误基类。 */
export class HarnessError extends Error {
  /**
   * @param {string} message - 错误消息。
   * @param {string} code - 机器可读码。
   * @param {object} [options] - cause 等。
   */
  constructor(message, code, options) {
    super(message, options);
    this.code = code;
    this.name = new.target.name;
  }
}

/** LLM 专用错误。 */
export class LlmError extends HarnessError {
  /**
   * @param {string} message - 错误消息。
   * @param {string} code - 机器可读码。
   * @param {object} [options] - cause / status 等。
   */
  constructor(message, code, options) {
    super(message, code, options);
    this.name = 'LlmError';
    this.failure = Object.freeze({
      message,
      code,
      ...options?.status === undefined ? {} : { status: options.status },
    });
  }
}

/** 适配器基类（只需提供默认实现）。 */
export class LlmAdapter {
  /** @param {string} provider - 路由名。 */
  providerInfo(provider) {
    return { id: provider, name: provider };
  }
  /** @returns {undefined} 无重试策略覆盖。 */
  providerRetryPolicy() {}
  /** @returns {undefined} 无图片计价。 */
  imageRequestPricing() {}
  /**
   * @param {string} _provider - 路由名。
   * @param {string} _model - 模型 id。
   * @param {{width: number, height: number, bytes: number}} image - 图片。
   * @returns {{width: number, height: number, maxBytes: number}} 目标尺寸。
   */
  imageRequestTarget(_provider, _model, image) {
    return { width: image.width, height: image.height, maxBytes: image.bytes };
  }
  /** @returns {Promise<[]>} 空目录。 */
  listModels() {
    return Promise.resolve([]);
  }
  /**
   * @param {string} provider - 路由名。
   * @param {string} model - 模型 id。
   * @returns {Promise<{provider: string, id: string, name: string}>} 模型元数据。
   */
  resolveModel(provider, model) {
    return Promise.resolve({ provider, id: model, name: model });
  }
}

/** 品牌化字符串。 */
export function ReasoningEffortId(id) {
  return id;
}

/** 归一化 API key。 */
export function normalizeApiKey(raw) {
  const value = String(raw ?? '').trim();
  if (value.length === 0) return { ok: false, reason: 'empty' };
  if (!/^[\x21-\x7E]+$/.test(value)) return { ok: false, reason: 'illegalCharacters' };
  return { ok: true, value };
}

/** 归因头。 */
export function attributionHeaders(identity = { product: 'deepseek-harness', version: '0.0.0-test' }) {
  return { 'user-agent': `${identity.product}/${identity.version}` };
}

/** 内容里是否有图片。 */
export function contentHasImage(content) {
  return Array.isArray(content) && content.some((block) => block?.type === 'image');
}

/** 渲染错误链。 */
export function errorChain(value) {
  if (value instanceof Error) {
    const cause = value.cause instanceof Error ? `: ${errorChain(value.cause)}` : '';
    return `${value.message}${cause}`;
  }
  return String(value);
}

const CONTEXT_PATTERN = /(?:context|input|prompt|request|messages?)[\s_-]*(?:length|window|size)[\s_-]*(?:exceed|exceeded|overflow|limit)/i;
const QUOTA_PATTERN = /(?:insufficient|quota|balance|credit|usage[\s_-]*limit)/i;

/** 是否上下文超限。 */
export function isContextWindowExceededError(detail) {
  return CONTEXT_PATTERN.test(String(detail));
}

/** 是否配额耗尽。 */
export function isQuotaExceededError(detail) {
  return QUOTA_PATTERN.test(String(detail));
}
