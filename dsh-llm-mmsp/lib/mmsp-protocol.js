/**
 * MMSP ↔ harness 协议转换的**纯函数**层。
 *
 * ## 为什么单独成文件
 *
 * 这一层不碰网络、不碰 DSH 服务、不碰 `fetch`——它只做形状变换，因此可以
 * 用纯单元测试覆盖（`tests/protocol.test.js`）。所有"上游到底要什么形状"
 * 的知识都收敛在这里，适配器层只负责把帧喂进来、把块吐出去。
 *
 * ## MMSP 线格式（全部对 go.penguin.ooo 实测确认，2026-10-30）
 *
 * ```
 * 端点   POST {upstream}/api/v1/stream
 * 鉴权   Authorization: Bearer <key>（x-api-key 同时接受）
 * 请求体 {"model": str, "messages": [...], "config": {...}}
 * 响应   SSE，每行 "data: {json}"，以 "data: [DONE]" 结束
 * 事件   delta（带恰好一个 content_item）/ stop（带 usage + finish_reason）
 * ```
 *
 * ## 实测纠正了三处流传的旧说法
 *
 * 有资料写"tool_call_id 必须是 provider 签发的 37 字符长格式，短 id 被拒"。
 * **实测不成立**：
 *
 * | id | deepseek 系 | gemini 系 |
 * |---|---|---|
 * | `call_00_ET_` + 任意后缀 | ✅ | ✅ |
 * | `call_00_ET_`（空前缀后缀） | ✅ | ✅ |
 * | `call_t1` / `t1` / `call_anything_at_all` | ❌ | ✅ |
 * | `toolu_01…` / uuid / 200 个 a | ❌ | ✅ |
 * | 空串 | ❌ | ❌ |
 *
 * ⇒ 真正的规则是 **deepseek 系要求 id 以 `call_00_ET_` 开头**（长度无关），
 * gemini 系不校验。为了对所有模型都安全，本适配器把**所有** tool-call id
 * 统一改写成 `call_00_ET_` + 26 位十六进制摘要（见 {@link normalizeToolCallId}）。
 *
 * 另两处纠正：
 *
 * - **"tool_result 必须在同一条 user 消息里带后续文本，否则 Model request failed"**
 *   —— 实测不成立：`call_00_ET_` 前缀的 id 单独成一条 user 消息，deepseek 与
 *   gemini **都接受**。真正被拒的是「tool_result 不是该 user 消息的**首个**
 *   item」（前面放文本 → 400）。
 * - **"tool_result 单独成一条只有它的 user 消息 → Model request failed"** ——
 *   同上，取决于 id 而不是位置。
 *
 * 本文件因此实现的是**实测**规则，不是旧档案的转述。
 *
 * @module dsh-llm-mmsp/protocol
 */

/** MMSP 请求体里 relay 允许的 config 键白名单（实测逐个试出来的）。 */
export const MMSP_CONFIG_WHITELIST = Object.freeze([
  'max_tokens',
  'system_prompt',
  'tools',
  'tool_choice',
  'thinking_level',
  'thinking_summary',
  'prompt_caching',
  'fast_mode',
]);

/**
 * 已知**不能**下发的 config 键，以及原因。
 *
 * 实测（2026-10-30，对 go.penguin.ooo 逐个试）：
 *
 * - `temperature` → 400 `Model request failed`（deepseek 拒绝该参数）
 * - `stop` / `top_p` → 400（relay 会转成 `trace_id` 再报「不支持该 config 字段」）
 * - `prompt_caching` → 400 `Invalid prompt_caching`（true / false / 对象 / 字符串全拒）
 * - `fast_mode: true` → 400；只有 `false` 可用 —— 故一律不下发
 * - `thinking_summary` → 只接受布尔值（字符串报 "thinking_summary must be boolean"）。
 *   布尔 `true` 被全部 12 个模型接受，且在 Gemini 系上是**唯一**能看到思考文本的
 *   方式（不传就只计费 `thoughts_tokens`、`thinking.delta` 一个字都不来）。
 * - `thinking_level` → **不拒任何值**：六档全部接受，唯一例外是
 *   `gemini-4-argon` + `none` → 400，见 {@link MODELS_REJECTING_NONE}。
 *
 * @type {Readonly<Record<string, string>>}
 */
export const MMSP_CONFIG_REJECTED = Object.freeze({
  temperature: 'the relay rejects temperature for these models',
  stop: 'the relay rejects stop sequences',
  top_p: 'the relay rejects top_p',
  prompt_caching: 'the relay rejects every prompt_caching shape',
  fast_mode: 'the relay rejects fast_mode:true',
});

/** relay 会把任何上游错误压成这个报文，客户端无法区分 429 / 上下文超长 / 配额耗尽。 */
export const MMSP_OPAQUE_ERROR = 'Model request failed';

/** deepseek 系上游要求的 tool-call id 前缀（长度无关）。 */
const TOOL_CALL_ID_PREFIX = 'call_00_ET_';

/** 改写后 id 的摘要长度。 */
const TOOL_CALL_ID_DIGEST_LENGTH = 26;

/**
 * 把任意 tool-call id 归一化成 MMSP 各家都能接受的形状。
 *
 * ## 为什么要改写
 *
 * harness 自己的 tool-call id 是 `toolu_01…`（Anthropic 形状），上游 deepseek
 * 系**拒绝**它（实测 400）。而上游签发的 id（`call_00_ET_…`）又不能直接
 * 回灌给 gemini 系以外的模型。这里统一归一化，两个方向都成立：
 *
 * - 请求方向：harness 的 `toolu_01…` → `call_00_ET_<摘要>`
 * - 响应方向：上游的 `call_00_ET_…` → 原样保留（已符合前缀）
 *
 * ## 必须是幂等的
 *
 * 响应里发出的是**归一化后**的 id；下一轮 harness 会把它原样带回来（assistant
 * 的 tool-call 块与 tool result 消息里是同一个 id），请求方向再归一化一次。
 * 若归一化不幂等，两处会各自算出不同的值，工具结果就对不上对应的调用了。
 *
 * 因此：**已带前缀的 id 原样返回**，只有"其它形状"才做摘要改写——
 * 归一化只发生一次，且此后恒等。
 *
 * @param {string} id - 任意来源的 tool-call id。
 * @returns {string} 以 `call_00_ET_` 开头、后面跟 26 位大写十六进制的 id。
 */
export function normalizeToolCallId(id) {
  const value = typeof id === 'string' ? id : '';
  if (value.startsWith(TOOL_CALL_ID_PREFIX)) return value;
  return TOOL_CALL_ID_PREFIX + digest(value);
}

/**
 * 一段稳定摘要（不含随机数——MMSP 的转换必须是**无状态**的，
 * 见 MMSP-RFC-0009 §3「Conversion MUST be stateless」）。
 *
 * @param {string} value - 被摘要的原文。
 * @returns {string} 26 位大写十六进制。
 */
function digest(value) {
  // 用一个 FNV-1a 变体即可：它只需要稳定 + 分布够散，不需要密码学强度。
  // （真正的随机性在这里是**错误**的——见上方幂等性说明。）
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + code, 0x85ebca6b) >>> 0;
    h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0;
  }
  let out = '';
  let a = h1;
  let b = h2;
  for (let i = 0; i < TOOL_CALL_ID_DIGEST_LENGTH; i += 1) {
    const byte = (a ^ b) & 0xff;
    out += byte.toString(16).padStart(2, '0');
    a = Math.imul(a ^ (a >>> 13), 0x5bd1e995) >>> 0;
    b = (b + a + i) >>> 0;
  }
  return out.slice(0, TOOL_CALL_ID_DIGEST_LENGTH).toUpperCase();
}

/**
 * 取一段内容里的纯文本。
 *
 * @param {unknown} content - harness 的内容块数组或字符串。
 * @returns {string} 拼接后的文本。
 */
export function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (typeof block === 'string') {
      parts.push(block);
    } else if (block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    }
  }
  return parts.join('\n');
}

/**
 * MMSP 的思考档位词表（升序：弱 → 强）。
 *
 * 与 [MMSP 配置文档](https://mmsp.penguin.ooo/zh/docs/configuration/) 的
 * `thinking_level` 枚举一致，也是本插件声明给 harness 的档位表。
 *
 * @type {readonly string[]}
 */
export const MMSP_THINKING_LEVELS = Object.freeze([
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

/**
 * harness 的推理档位 → MMSP 的 `thinking_level`。
 *
 * ## 六档全部原样透传（实测 2026-10-30）
 *
 * 早前本函数把 `xhigh` / `max` 压成 `high`，依据是"relay 只认四档"。**不成立**：
 * 逐个试下来 `none` / `low` / `medium` / `high` / `xhigh` / `max` 全被接受，而且
 * 在 Gemini 系列上强度是真的分层的（argon 的 `high`→205、`max`→221；
 * 3.5-flash 的 `high`→181、`xhigh`→210）。压平等于**丢掉用户选的档位**。
 *
 * ⇒ 这里只做**同义词归一**，不做降级：harness 若用了别的词表（`off`、
 * `disabled`、`minimal`），归一到 MMSP 的词；MMSP 自己的六个值原样返回。
 *
 * ⚠️ 模型相关的例外见 {@link thinkingLevelFor}（argon 拒 `none`）。
 *
 * @param {string | undefined} effort - harness 的 reasoningEffort。
 * @returns {string | undefined} 对应的 thinking_level，或 undefined（不表达）。
 */
export function thinkingLevelOf(effort) {
  if (typeof effort !== 'string' || effort.length === 0) return undefined;
  switch (effort) {
    case 'off':
    case 'none':
    case 'disabled':
      return 'none';
    case 'minimal':
    case 'low':
      return 'low';
    case 'medium':
    case 'high':
    case 'xhigh':
    case 'max':
      return effort;
    default:
      return undefined;
  }
}

/**
 * 明确**没有** `none` 档的模型：把 `none` 降到 `low` 的唯一去处。
 *
 * ## 为什么需要这张表
 *
 * `gemini-4-argon` 收 `thinking_level: "none"` 会**稳定 400**（实测连试 3 次
 * 全是 `Model request failed`），而 `low` 正常（thoughts=0，效果上就是不思考）。
 * 其余模型都不拒 `none`（Gemini 3.x 只是把 `none` 跑成"最少思考"，不是报错）。
 *
 * ## 为什么写成显式名单
 *
 * 与 MMSP-RFC-0003 §6.1「请求参数不模糊匹配」一致：一条模型一行，新模型加行，
 * 绝不放宽成 `/gemini/` 这种子串判断——那会把未来的 Gemini 也误伤。
 *
 * @type {readonly string[]}
 */
const MODELS_REJECTING_NONE = Object.freeze([
  'gemini-4-argon',
]);

/**
 * 一个模型可以声明的思考档位（**升序**，harness 要求弱→强）。
 *
 * 默认就是全六档；{@link MODELS_REJECTING_NONE} 里的模型去掉 `none`。
 *
 * harness 的 `resolveModel` 会校验：`efforts` 不能为空、id 不能重复、
 * `defaultEffort` 必须在集合内（见 `dsh-llm` 的 `INVALID_MODEL_REASONING`）。
 * 本函数只可能返回全六档或全六档减一，都满足。
 *
 * @param {string} model - 模型 id（可带路由前缀）。
 * @returns {readonly string[]} 该模型的档位列表（升序）。
 */
export function thinkingLevelsForModel(model) {
  const bare = bareModelId(model).toLowerCase();
  if (MODELS_REJECTING_NONE.includes(bare)) {
    return MMSP_THINKING_LEVELS.filter((level) => level !== 'none');
  }
  return MMSP_THINKING_LEVELS;
}

/**
 * 按模型把 harness 的档位解析成**这个模型真能收下**的 `thinking_level`。
 *
 * 目前只做一件事：{@link MODELS_REJECTING_NONE} 里的模型把 `none` 降成 `low`。
 * 其余档位、其余模型一律原样透传（降级由 MMSP 服务端按它自己的映射表完成，
 * 那正是 MMSP 存在的意义——见 MMSP-RFC-0003 §6.3）。
 *
 * @param {string} model - 模型 id（可带路由前缀）。
 * @param {string | undefined} effort - harness 的 reasoningEffort。
 * @returns {string | undefined} thinking_level，或 undefined（不表达）。
 */
export function thinkingLevelFor(model, effort) {
  const level = thinkingLevelOf(effort);
  if (level === undefined) return undefined;
  if (level !== 'none') return level;
  const bare = bareModelId(model).toLowerCase();
  return MODELS_REJECTING_NONE.includes(bare) ? 'low' : 'none';
}

/**
 * 取模型 id 的最后一段。
 *
 * harness 里模型可以写成 `<route>/<model>`（例如 `mmsp/deepseek-flash`）。
 * MMSP 的 `model` 字段只认裸 id。
 *
 * @param {string} model - 完整模型 id。
 * @returns {string} 裸模型 id。
 */
export function bareModelId(model) {
  const value = typeof model === 'string' ? model.trim() : '';
  if (value.length === 0) return value;
  const slash = value.lastIndexOf('/');
  return slash === -1 ? value : value.slice(slash + 1);
}

/**
 * MMSP `usage_metadata` → harness `TokenUsage`。
 *
 * 实测 relay 把缓存与思考**分开**计数：
 *
 * ```
 * input  = cached_tokens + prompt_tokens
 * output = thoughts_tokens + response_tokens
 * ```
 *
 * @param {Record<string, unknown> | undefined} usage - relay 的 usage_metadata。
 * @returns {import('@deepseek-ai/dsh-llm').TokenUsage} harness 口径的用量。
 */
export function usageFromMmsp(usage) {
  const cached = countOf(usage?.cached_tokens);
  const prompt = countOf(usage?.prompt_tokens);
  const thoughts = countOf(usage?.thoughts_tokens);
  const response = countOf(usage?.response_tokens);
  const inputTokens = cached + prompt;
  const outputTokens = thoughts + response;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    ...cached > 0 ? { cacheReadTokens: cached } : {},
    ...thoughts > 0 ? { reasoningTokens: thoughts } : {},
  };
}

/**
 * 把一个可能是任意形状的计数读成非负整数。
 *
 * @param {unknown} value - 原始值。
 * @returns {number} 非负整数（读不出就是 0）。
 */
function countOf(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/**
 * 把 harness 的工具定义转成 MMSP 的工具表。
 *
 * @param {readonly {name: string, description?: string, parameters?: unknown}[] | undefined} tools - harness 工具。
 * @returns {Record<string, unknown>[] | undefined} MMSP 工具表；没有工具时 undefined。
 */
export function toolsToMmsp(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  const out = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') continue;
    const name = typeof tool.name === 'string' ? tool.name : '';
    if (name.length === 0) continue;
    const parameters = tool.parameters && typeof tool.parameters === 'object'
      ? tool.parameters
      : { type: 'object', properties: {} };
    out.push({
      name,
      description: typeof tool.description === 'string' ? tool.description : '',
      parameters,
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * 把 harness 的消息序列转成 MMSP 的消息序列。
 *
 * ## 三条形状约束（全部实测）
 *
 * 1. **role 只能是 user / assistant**。system 走 `config.system_prompt`，
 *    developer（工具更新）无对应物 —— 直接丢弃。
 * 2. **tool_result 必须是它那条 user 消息的首个 item**。前面放文本 → 400。
 *    因此连续的工具结果消息会与**紧随其后的用户消息**合并成一条 user 消息。
 * 3. **对话不能以一条带 tool_call 的 assistant 消息结尾** → 400
 *    （relay 要求工具调用被结果回答）。本函数把这种悬挂调用去掉并补一句
 *    继续提示（正常流程下不会出现：harness 总是先附上工具结果再发下一次请求）。
 *
 * @param {object} input - 输入。
 * @param {readonly import('@deepseek-ai/dsh-llm').RequestMessage[]} input.messages - harness 消息。
 * @param {string | undefined} input.system - harness 的系统提示词。
 * @param {Map<string, string> | undefined} input.imageDataUris - 附件 id → data URI。
 * @returns {{messages: Record<string, unknown>[], systemPrompt: string | undefined}} MMSP 消息与系统提示。
 */
export function messagesToMmsp({ messages, system, imageDataUris }) {
  /** @type {Record<string, unknown>[]} */
  const out = [];
  let systemPrompt = typeof system === 'string' && system.length > 0 ? system : undefined;
  const images = imageDataUris ?? new Map();

  /**
   * 把一条 harness 消息转成 MMSP 的 content_items。
   *
   * @param {import('@deepseek-ai/dsh-llm').RequestMessage} message - harness 消息。
   * @returns {Record<string, unknown>[]} MMSP item 列表。
   */
  const itemsOf = (message) => {
    /** @type {Record<string, unknown>[]} */
    const items = [];
    const content = message.content;
    if (typeof content === 'string') {
      if (content.length > 0) items.push({ type: 'text.done', text: content });
      return items;
    }
    if (!Array.isArray(content)) return items;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      switch (block.type) {
        case 'text':
          if (typeof block.text === 'string' && block.text.length > 0) {
            items.push({ type: 'text.done', text: block.text });
          }
          break;
        case 'reasoning':
          // harness 的推理块没有签名；实测 relay 接受不带 fidelity 的 thinking.done。
          if (typeof block.text === 'string' && block.text.length > 0) {
            items.push({ type: 'thinking.done', thinking: block.text });
          }
          break;
        case 'image': {
          const uri = images.get(String(block.attachment?.attachmentId));
          if (uri !== undefined) items.push({ type: 'image_url.done', image_url: uri });
          break;
        }
        case 'tool-call': {
          const args = typeof block.arguments === 'string' ? block.arguments : '{}';
          let parsed = {};
          try {
            const candidate = JSON.parse(args);
            if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) parsed = candidate;
          } catch {
            parsed = {};
          }
          items.push({
            type: 'tool_call.done',
            name: typeof block.name === 'string' ? block.name : '',
            arguments: parsed,
            tool_call_id: normalizeToolCallId(block.id),
          });
          break;
        }
        default:
          // file / tool-addition / tool-removal：harness 在到达适配器之前就把
          // file 投影成文本、developer 消息剥掉，这里不该看到；真看到了也不发。
          break;
      }
    }
    return items;
  };

  /**
   * 工具结果消息 → MMSP 的 tool_result.done。
   *
   * @param {import('@deepseek-ai/dsh-llm').RequestMessage} message - harness 的 tool 消息。
   * @returns {Record<string, unknown>[]} MMSP item 列表。
   */
  const toolItemsOf = (message) => {
    /** @type {Record<string, unknown>[]} */
    const items = [];
    const callId = normalizeToolCallId(message.toolCallId);
    const body = textOf(message.content);
    items.push({ type: 'tool_result.done', tool_call_id: callId, text: body });
    return items;
  };

  let index = 0;
  while (index < messages.length) {
    const message = messages[index];
    const role = message?.role;

    if (role === 'system') {
      // MMSP 没有 system 角色消息；并进系统提示词。
      const extra = textOf(message.content);
      if (extra.length > 0) {
        systemPrompt = systemPrompt === undefined ? extra : `${systemPrompt}\n\n${extra}`;
      }
      index += 1;
      continue;
    }

    if (role === 'developer') {
      // 工具更新没有 MMSP 对应物：丢弃（当前工具表每次请求整份下发）。
      index += 1;
      continue;
    }

    if (role === 'tool') {
      // 连续的 tool 消息合并成一条 user 消息；再把紧随其后的 user 消息的
      // 文本也并进来（tool_result 必须是首个 item，后面跟文本是上游期望的形状）。
      /** @type {Record<string, unknown>[]} */
      const items = [];
      while (index < messages.length && messages[index]?.role === 'tool') {
        items.push(...toolItemsOf(messages[index]));
        index += 1;
      }
      let mergedUserText = false;
      if (index < messages.length && messages[index]?.role === 'user') {
        const userItems = itemsOf(messages[index]);
        if (userItems.length > 0) {
          items.push(...userItems);
          mergedUserText = true;
        }
        index += 1;
      }
      if (!mergedUserText) {
        // 没有后续用户文本时补一句中性提示，让这条 user 消息不是一个"只有
        // tool_result"的孤立消息（实测这样对 deepseek 系也可接受，但补一句
        // 更接近上游期待的"回答工具"形状）。
        items.push({ type: 'text.done', text: 'Continue.' });
      }
      out.push({ role: 'user', content_items: items });
      continue;
    }

    if (role === 'user' || role === 'assistant') {
      const items = itemsOf(message);
      if (items.length === 0) {
        index += 1;
        continue;
      }
      out.push({ role, content_items: items });
      index += 1;
      continue;
    }

    index += 1;
  }

  // 对话不能以带 tool_call 的 assistant 消息结尾（relay 400）。
  const last = out[out.length - 1];
  if (last?.role === 'assistant') {
    const items = last.content_items.filter(
      (item) => !(item.type === 'tool_call.done'),
    );
    if (items.length !== last.content_items.length) {
      if (items.length === 0) {
        out.pop();
      } else {
        last.content_items = items;
      }
      out.push({ role: 'user', content_items: [{ type: 'text.done', text: 'Continue.' }] });
    }
  }

  if (out.length === 0) {
    out.push({ role: 'user', content_items: [{ type: 'text.done', text: 'Continue.' }] });
  }

  return { messages: out, systemPrompt };
}

/**
 * 组装一个完整的 MMSP 请求体。
 *
 * @param {object} input - 输入。
 * @param {string} input.model - harness 的模型 id（可能带路由前缀）。
 * @param {string | undefined} input.system - 系统提示词。
 * @param {readonly import('@deepseek-ai/dsh-llm').RequestMessage[] | undefined} input.messages - 消息。
 * @param {readonly {name: string, description?: string, parameters?: unknown}[] | undefined} input.tools - 工具。
 * @param {number | undefined} input.maxTokens - 输出上限。
 * @param {string | undefined} input.reasoningEffort - 推理档位。
 * @param {boolean | undefined} input.thinkingSummary - 是否请求思考摘要。
 * @param {Map<string, string> | undefined} input.imageDataUris - 附件 id → data URI。
 * @returns {{model: string, messages: Record<string, unknown>[], config: Record<string, unknown>}} MMSP 请求体。
 */
export function buildMmspRequest({
  model,
  system,
  messages,
  tools,
  maxTokens,
  reasoningEffort,
  thinkingSummary,
  imageDataUris,
}) {
  const { messages: mmspMessages, systemPrompt } = messagesToMmsp({
    messages: messages ?? [],
    system,
    imageDataUris,
  });

  /** @type {Record<string, unknown>} */
  const config = {};
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
    config.max_tokens = Math.trunc(maxTokens);
  }
  if (systemPrompt !== undefined && systemPrompt.length > 0) {
    config.system_prompt = systemPrompt;
  }
  const mmspTools = toolsToMmsp(tools);
  if (mmspTools !== undefined) config.tools = mmspTools;
  // 档位按模型解析（argon 拒 none → low），见 thinkingLevelFor。
  const level = thinkingLevelFor(model, reasoningEffort);
  if (level !== undefined) config.thinking_level = level;
  // ⚠️ 只在开了思考时才要摘要：`none` 档请求摘要没有意义（还可能让客户端
  //    走「无 thinking_level 也要摘要」的路径）。
  if (thinkingSummary === true && level !== undefined && level !== 'none') {
    config.thinking_summary = true;
  }

  return {
    model: bareModelId(model),
    messages: mmspMessages,
    config,
  };
}

/**
 * MMSP 事件流 → harness `StreamChunk` 的增量解码器。
 *
 * ## 事件形状（实测）
 *
 * ```
 * delta 事件带**恰好一个** content_item：
 *   text.delta     {text}
 *   thinking.delta {thinking}
 *   text.done      {text}       ← 完整文本（与前面的 delta 重复）
 *   thinking.done  {thinking}   ← 完整思考（与前面的 delta 重复）
 *   tool_call.delta{name, arguments, tool_call_id}
 *   tool_call.done {name, arguments, tool_call_id}
 * stop 事件带 usage_metadata + finish_reason，不带 item
 * ```
 *
 * ## 两处必须处理的重复
 *
 * - `text.done` 与 `thinking.done` 携带的是**整段**文本，而流里已经有逐字的
 *   `*.delta`。直接发出去会让内容翻倍。本解码器只在**没有流过对应 delta** 时
 *   才补发 done 里的整段文本。
 * - `tool_call.done` 携带**完整**参数对象，而 `tool_call.delta` 已经逐片发过
 *   参数。同理：只有当该调用**没有**流过参数片时才补发。
 *
 * ## tool_call 的分片归属
 *
 * relay 只在**第一个**分片上带 `tool_call_id` 与 `name`，后续分片的
 * `tool_call_id` 是空串。所以"空 id 的分片"属于当前打开的那个调用。
 *
 * @module dsh-llm-mmsp/protocol
 */
export class MmspStreamDecoder {
  /** @param {string} model - 模型 id（写进日志用）。 */
  constructor(model) {
    this.model = model;
    this.nextIndex = 0;
    /** @type {number | undefined} */
    this.textIndex = undefined;
    /** @type {number | undefined} */
    this.reasoningIndex = undefined;
    /** @type {Map<string, number>} */
    this.toolIndices = new Map();
    /** @type {number | undefined} */
    this.openToolIndex = undefined;
    /** @type {string | undefined} */
    this.openToolId = undefined;
    this.textStreamed = false;
    this.reasoningStreamed = false;
    /** @type {Set<number>} 已经发过参数片的调用下标。 */
    this.toolStreamed = new Set();
    /** @type {Map<number, string>} 调用下标 → 工具名。 */
    this.toolNames = new Map();
    /** @type {Map<number, string>} 调用下标 → 还没随参数片发出的工具名。 */
    this.pendingToolNames = new Map();
    /** @type {Map<number, string>} 调用下标 → 已累积的参数 JSON。 */
    this.toolArgs = new Map();
    /** @type {Set<number>} 已经闭合（发过 block-end）的调用下标。 */
    this.closedTools = new Set();
    this.textBuffer = '';
    this.reasoningBuffer = '';
    this.sawToolCall = false;
    this.finished = false;
  }

  /**
   * 喂入一个 relay 帧，产出 harness chunk。
   *
   * @param {Record<string, unknown>} frame - 一个 MMSP 事件帧。
   * @returns {import('@deepseek-ai/dsh-llm').StreamChunk[]} 产出的 chunk。
   */
  feed(frame) {
    /** @type {import('@deepseek-ai/dsh-llm').StreamChunk[]} */
    const chunks = [];
    if (this.finished) return chunks;
    const eventType = frame?.event_type;
    const items = Array.isArray(frame?.content_items) ? frame.content_items : [];

    if (eventType === 'stop') {
      this.finished = true;
      // 先闭合还开着的块（协议要求 usage 在 finish 之前、finish 之后无内容）。
      chunks.push(...this.closeOpenBlocks());
      const usage = usageFromMmsp(frame?.usage_metadata);
      chunks.push({ type: 'usage', usage });
      chunks.push({ type: 'finish', reason: this.finishReason(frame?.finish_reason) });
      return chunks;
    }

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      switch (item.type) {
        case 'text.delta': {
          const text = typeof item.text === 'string' ? item.text : '';
          if (text.length === 0) break;
          if (this.textIndex === undefined) {
            this.textIndex = this.nextIndex;
            this.nextIndex += 1;
            chunks.push({ type: 'block-start', index: this.textIndex, blockType: 'text' });
          }
          this.textBuffer += text;
          this.textStreamed = true;
          chunks.push({ type: 'text-delta', index: this.textIndex, text });
          break;
        }
        case 'text.done': {
          const text = typeof item.text === 'string' ? item.text : '';
          if (this.textStreamed) break; // 已经逐字流过，done 是重复
          if (this.textIndex === undefined) {
            this.textIndex = this.nextIndex;
            this.nextIndex += 1;
            chunks.push({ type: 'block-start', index: this.textIndex, blockType: 'text' });
          }
          this.textBuffer = text;
          chunks.push({ type: 'text-delta', index: this.textIndex, text });
          break;
        }
        case 'thinking.delta': {
          const thinking = typeof item.thinking === 'string' ? item.thinking : '';
          if (thinking.length === 0) break;
          if (this.reasoningIndex === undefined) {
            this.reasoningIndex = this.nextIndex;
            this.nextIndex += 1;
            chunks.push({ type: 'block-start', index: this.reasoningIndex, blockType: 'reasoning' });
          }
          this.reasoningBuffer += thinking;
          this.reasoningStreamed = true;
          chunks.push({ type: 'reasoning-delta', index: this.reasoningIndex, text: thinking });
          break;
        }
        case 'thinking.done': {
          const thinking = typeof item.thinking === 'string' ? item.thinking : '';
          if (this.reasoningStreamed) break;
          if (this.reasoningIndex === undefined) {
            this.reasoningIndex = this.nextIndex;
            this.nextIndex += 1;
            chunks.push({ type: 'block-start', index: this.reasoningIndex, blockType: 'reasoning' });
          }
          this.reasoningBuffer = thinking;
          chunks.push({ type: 'reasoning-delta', index: this.reasoningIndex, text: thinking });
          break;
        }
        case 'tool_call.delta': {
          chunks.push(...this.feedToolCall(item, false));
          break;
        }
        case 'tool_call.done': {
          chunks.push(...this.feedToolCall(item, true));
          break;
        }
        default:
          break;
      }
    }
    return chunks;
  }

  /**
   * 处理一个 tool_call 帧。
   *
   * ## 关键：relay 在 `tool_call.done` 上**也带 id**
   *
   * 实测帧序列：
   *
   * ```
   * tool_call.delta {name:'get_weather', arguments:'',  tool_call_id:'call_00_ET_X'}
   * tool_call.delta {name:'',           arguments:'{"', tool_call_id:''}
   * …
   * tool_call.done  {name:'get_weather', arguments:{…}, tool_call_id:'call_00_ET_X'}
   * ```
   *
   * ⇒ `done` 的 id 与首个 delta **相同**。若把 `done` 当成"新调用"就会为
   * 同一个调用开**两个**块。故先查 `toolIndices`：已知的 id 复用其下标。
   *
   * ## `argumentsDelta` 恒为字符串
   *
   * harness 的 `tool-call-delta` 形状要求 `argumentsDelta: string`（必填），
   * 且 `AssistantStreamAccumulator` 会校验它是字符串。只带名字不带参数的
   * 那一帧因此必须写成 `argumentsDelta: ''`。
   *
   * @param {Record<string, any>} item - relay 的 tool_call 项。
   * @param {boolean} complete - 是否是携带完整参数的 `tool_call.done`。
   * @returns {import('@deepseek-ai/dsh-llm').StreamChunk[]} 产出的 chunk。
   */
  feedToolCall(item, complete) {
    /** @type {import('@deepseek-ai/dsh-llm').StreamChunk[]} */
    const chunks = [];
    const rawId = typeof item.tool_call_id === 'string' ? item.tool_call_id : '';
    const name = typeof item.name === 'string' ? item.name : '';

    /** @type {number | undefined} */
    let index = this.openToolIndex;
    /** @type {string | undefined} */
    let id = this.openToolId;

    if (rawId.length > 0) {
      const normalized = normalizeToolCallId(rawId);
      const known = this.toolIndices.get(normalized);
      if (known !== undefined) {
        // 已知的调用（done 帧重复带 id）：复用下标，不新开块。
        index = known;
        id = normalized;
      } else {
        id = normalized;
        index = this.nextIndex;
        this.nextIndex += 1;
        this.toolIndices.set(id, index);
        this.sawToolCall = true;
        chunks.push({ type: 'block-start', index, blockType: 'tool-call' });
      }
      if (name.length > 0 && this.toolNameOf(index) !== name) {
        this.toolNames.set(index, name);
        // 名字随**下一个**参数分片一起发出，让 UI 尽早看到工具名，
        // 而不必单独发一个 argumentsDelta 为空的帧。
        this.pendingToolNames.set(index, name);
      }
      this.openToolIndex = index;
      this.openToolId = id;
    } else if (index === undefined) {
      // 没有 id 的分片且当前没有打开的调用：合成一个 id，避免丢掉内容。
      this.sawToolCall = true;
      index = this.nextIndex;
      this.nextIndex += 1;
      id = normalizeToolCallId(`${this.model}:${index}`);
      this.toolIndices.set(id, index);
      chunks.push({ type: 'block-start', index, blockType: 'tool-call' });
      this.openToolIndex = index;
      this.openToolId = id;
    }

    if (index === undefined || id === undefined) return chunks;

    if (complete) {
      const args = item.arguments;
      const serialized = typeof args === 'string' ? args : JSON.stringify(args ?? {});
      if (!this.toolStreamed.has(index)) {
        // 没有流过参数片：补发完整参数。
        this.toolArgs.set(index, serialized);
        chunks.push({
          type: 'tool-call-delta',
          index,
          id,
          ...this.takeToolName(index),
          argumentsDelta: serialized,
        });
      } else {
        // 已经逐片流过：不再重复（否则参数会翻倍）。
        this.toolArgs.set(index, serialized);
      }
      chunks.push({
        type: 'block-end',
        index,
        block: {
          type: 'tool-call',
          id,
          name: this.toolNameOf(index),
          arguments: this.toolArgs.get(index) ?? serialized,
        },
      });
      this.closedTools.add(index);
      this.toolStreamed.delete(index);
      this.openToolIndex = undefined;
      this.openToolId = undefined;
      return chunks;
    }

    const delta = item.arguments;
    if (typeof delta === 'string' && delta.length > 0) {
      this.toolStreamed.add(index);
      this.toolArgs.set(index, (this.toolArgs.get(index) ?? '') + delta);
      chunks.push({
        type: 'tool-call-delta',
        index,
        id,
        ...this.takeToolName(index),
        argumentsDelta: delta,
      });
    }
    return chunks;
  }

  /**
   * 取走一个待发的工具名（只取一次）。
   *
   * @param {number} index - 调用下标。
   * @returns {{name?: string}} 带名字的片段，或空对象。
   */
  takeToolName(index) {
    const pending = this.pendingToolNames.get(index);
    if (pending === undefined) return {};
    this.pendingToolNames.delete(index);
    return { name: pending };
  }

  /**
   * 记住一个调用的名字（`tool_call.done` 可能不带 name）。
   *
   * @param {number} index - 调用下标。
   * @returns {string} 已知名字或空串。
   */
  toolNameOf(index) {
    return this.toolNames.get(index) ?? '';
  }

  /**
   * 结束一个流（上游没发 stop 事件时的兜底）。
   *
   * @returns {import('@deepseek-ai/dsh-llm').StreamChunk[]} 收尾 chunk。
   */
  finalize() {
    /** @type {import('@deepseek-ai/dsh-llm').StreamChunk[]} */
    const chunks = [];
    if (this.finished) return chunks;
    this.finished = true;
    chunks.push(...this.closeOpenBlocks());
    chunks.push({ type: 'usage', usage: usageFromMmsp(undefined) });
    chunks.push({ type: 'finish', reason: this.finishReason(undefined) });
    return chunks;
  }

  /**
   * 闭合所有还开着的块。
   *
   * 协议要求 `usage` 之前块都已闭合（`dsh-llm` 的「Protocol ordering」：
   * usage 在 finish 前、finish 后没有内容）。文本/思考块在这里闭合；
   * 工具调用通常在 `tool_call.done` 时已闭合。
   *
   * @returns {import('@deepseek-ai/dsh-llm').StreamChunk[]} 收尾 chunk。
   */
  closeOpenBlocks() {
    /** @type {import('@deepseek-ai/dsh-llm').StreamChunk[]} */
    const chunks = [];
    if (this.reasoningIndex !== undefined) {
      chunks.push({
        type: 'block-end',
        index: this.reasoningIndex,
        block: { type: 'reasoning', text: this.reasoningBuffer },
      });
    }
    if (this.textIndex !== undefined) {
      chunks.push({
        type: 'block-end',
        index: this.textIndex,
        block: { type: 'text', text: this.textBuffer },
      });
    }
    for (const [id, index] of this.toolIndices) {
      if (this.closedTools.has(index)) continue;
      chunks.push({
        type: 'block-end',
        index,
        block: {
          type: 'tool-call',
          id,
          name: this.toolNameOf(index),
          arguments: this.toolArgs.get(index) ?? '{}',
        },
      });
      this.closedTools.add(index);
    }
    return chunks;
  }

  /**
   * 决定结束原因。
   *
   * MMSP 在 deepseek 上**即使发起了工具调用**，`finish_reason` 也是 `"stop"`
   * （实测）。因此以"是否出现过 tool_call"为准覆写成 `tool-calls`——这与官方
   * `anthropic_official` client 的做法一致。
   *
   * @param {unknown} finishReason - relay 的 finish_reason。
   * @returns {import('@deepseek-ai/dsh-llm').FinishReason} harness 的结束原因。
   */
  finishReason(finishReason) {
    if (this.sawToolCall) return { kind: 'tool-calls' };
    switch (finishReason) {
      case 'length':
        return { kind: 'max-tokens' };
      case 'tool_call':
        return { kind: 'tool-calls' };
      default:
        return { kind: 'stop' };
    }
  }
}

/**
 * 解析用户输入的自定义请求头配置。
 *
 * 支持两种输入格式：
 * 1. 键值对象，例如 `{ "X-Custom": "val" }`；
 * 2. 多行文本（每行一条 `Key: Value`，支持 `#` 或 `//` 注释），或者 JSON 文本。
 *
 * @param {unknown} raw - 原始配置值。
 * @returns {Record<string, string>} 归一化的合法请求头字典。
 */
export function parseHeaders(raw) {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const out = {};
    for (const [key, val] of Object.entries(raw)) {
      if (typeof key === 'string' && key.trim().length > 0 && val !== undefined && val !== null) {
        out[key.trim()] = String(val).trim();
      }
    }
    return out;
  }
  if (typeof raw !== 'string') return {};
  const text = raw.trim();
  if (text.length === 0) return {};

  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parseHeaders(parsed);
      }
    } catch {
      // 非 JSON 则降级按行解析
    }
  }

  const out = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex <= 0) continue;
    const key = trimmed.slice(0, colonIndex).trim();
    const val = trimmed.slice(colonIndex + 1).trim();
    if (key.length > 0) {
      out[key] = val;
    }
  }
  return out;
}
