// MMSP UniEvent SSE → OpenAI chat completions。
// 纯逻辑层：状态机不碰 I/O，测试直接喂事件对象。
//
// - delta 事件带恰好一个 delta 或 done item；stop 事件带 usage_metadata 与
//   finish_reason，且不带 item。done item 跟在同类 delta 之后、携带完整内容，
//   所以要做去重：done 的文本与已发增量一致时不再发，只补差额。
// - deepseek 系即使发起了工具调用 finish_reason 也是 stop → 以"是否出现过
//   tool_call"为准覆写成 tool_calls（与官方 client 行为一致）。
// - usage 换算：input = prompt_tokens + cached_tokens，output = thoughts_tokens + response_tokens。
// - 思考文本同时发 reasoning_content（DeepSeek 惯例）和 reasoning（OpenRouter 惯例），
//   两种 OpenAI 兼容解析器都能读到。
// - SSE keepalive 是注释行（":" 开头），reader 跳过。

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// deepseek 系即使发起了工具调用 finish_reason 也是 stop → 以"是否出现过 tool_call"覆写
export function finishReasonFor(sawToolCall, reason) {
  if (reason === "length") return "length";
  if (reason === "tool_call") return "tool_calls";
  return sawToolCall ? "tool_calls" : "stop";
}

// usage 换算：input = prompt_tokens + cached_tokens，output = thoughts_tokens + response_tokens
export function usageFrom(meta) {
  const prompt = num(meta?.prompt_tokens) + num(meta?.cached_tokens);
  const completion = num(meta?.thoughts_tokens) + num(meta?.response_tokens);
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    prompt_tokens_details: { cached_tokens: num(meta?.cached_tokens) },
    completion_tokens_details: { reasoning_tokens: num(meta?.thoughts_tokens) },
  };
}

function randomId() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 24);
}

export function chunkId() {
  return "chatcmpl-" + randomId();
}

// —— SSE 行解析：body（ReadableStream）→ data 载荷对象 ——

export async function* sseLines(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // 真实 fetch 的块是字节；字符串块（测试替身）直接用
    buffer += typeof value === "string" ? value : decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      yield line;
    }
  }
  const rest = buffer + decoder.decode(); // 字节流时冲刷残留；字符串块时为空串
  if (rest) yield rest.replace(/\r$/, "");
}

export async function* mmspEvents(body) {
  for await (const line of sseLines(body)) {
    if (!line || line.startsWith(":")) continue; // keepalive 注释
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") return;
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue; // 不是 JSON 的行（防御）：跳过
    }
    yield parsed;
  }
}

// —— 流式：MMSP 事件喂进来，吐出 chat.completion.chunk 对象 ——

export class MmspToChatChunks {
  constructor(model, { id = chunkId(), created = Math.floor(Date.now() / 1000) } = {}) {
    this.model = model;
    this.id = id;
    this.created = created;
    this.textBuffer = "";
    this.thinkBuffer = "";
    this.tools = new Map(); // 上游 tool_call_id → { index }
    this.currentToolId = null;
    this.nextToolIndex = 0;
    this.sawToolCall = false;
    this.usage = null;
  }

  base(delta, finish = null) {
    return {
      id: this.id,
      object: "chat.completion.chunk",
      created: this.created,
      model: this.model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    };
  }

  roleChunk() {
    return this.base({ role: "assistant", content: "" });
  }

  // delta/done 文本项通用去重：done 与已发增量一致 → 不发；一致但有差额 → 只补差额
  emitDone(full, buffer) {
    if (full === buffer) return "";
    if (buffer && full.startsWith(buffer)) return full.slice(buffer.length);
    if (!buffer) return full;
    return ""; // 已发过增量但与 done 对不上：宁缺勿重
  }

  onItem(item) {
    if (!item || typeof item.type !== "string") return [];
    switch (item.type) {
      case "text.delta": {
        this.textBuffer += item.text;
        return [this.base({ content: item.text })];
      }
      case "text.done": {
        const rest = this.emitDone(item.text, this.textBuffer);
        this.textBuffer = "";
        return rest ? [this.base({ content: rest })] : [];
      }
      case "thinking.delta": {
        this.thinkBuffer += item.thinking;
        return [this.base({ reasoning_content: item.thinking, reasoning: item.thinking })];
      }
      case "thinking.done": {
        const rest = this.emitDone(item.thinking, this.thinkBuffer);
        this.thinkBuffer = "";
        return rest ? [this.base({ reasoning_content: rest, reasoning: rest })] : [];
      }
      case "tool_call.delta": {
        const id = item.tool_call_id || this.currentToolId;
        if (!id) return [];
        if (item.name) {
          const tool = { index: this.nextToolIndex++ };
          this.tools.set(id, tool);
          this.currentToolId = id;
          this.sawToolCall = true;
          return [
            this.base({
              tool_calls: [
                { index: tool.index, id, type: "function", function: { name: item.name, arguments: item.arguments ?? "" } },
              ],
            }),
          ];
        }
        const tool = this.tools.get(id);
        if (!tool) return [];
        return [
          this.base({
            tool_calls: [{ index: tool.index, function: { arguments: item.arguments ?? "" } }],
          }),
        ];
      }
      case "tool_call.done": {
        // 已流过增量的调用直接跳过 done（done 是完整重放）
        if (this.tools.has(item.tool_call_id)) return [];
        const tool = { index: this.nextToolIndex++ };
        this.tools.set(item.tool_call_id, tool);
        this.currentToolId = item.tool_call_id;
        this.sawToolCall = true;
        return [
          this.base({
            tool_calls: [
              {
                index: tool.index,
                id: item.tool_call_id,
                type: "function",
                function: { name: item.name, arguments: JSON.stringify(item.arguments ?? {}) },
              },
            ],
          }),
        ];
      }
      default:
        return []; // image/inline_thinking/embedding 等输出项 chat completions 表达不了
    }
  }

  finishReasonFor(reason) {
    return finishReasonFor(this.sawToolCall, reason);
  }

  onStop(event) {
    this.usage = usageFrom(event.usage_metadata);
    const finish = this.finishReasonFor(event.finish_reason);
    const finishChunk = this.base({}, finish);
    const usageChunk = {
      id: this.id,
      object: "chat.completion.chunk",
      created: this.created,
      model: this.model,
      choices: [],
      usage: this.usage,
    };
    return [finishChunk, usageChunk];
  }

  // 上游流没等来 stop 就断了（IncompleteStream）：能补多少补多少
  synthesizeEnd() {
    const chunks = [this.base({}, this.finishReasonFor(null))];
    if (this.usage) {
      chunks.push({ id: this.id, object: "chat.completion.chunk", created: this.created, model: this.model, choices: [], usage: this.usage });
    }
    return chunks;
  }
}

// —— 非流式：聚合成一条 chat.completion ——

export class MmspToChatMessage {
  constructor(model, { id = chunkId(), created = Math.floor(Date.now() / 1000) } = {}) {
    this.model = model;
    this.id = id;
    this.created = created;
    this.text = "";
    this.thinking = "";
    this.calls = new Map(); // id → { index, name, raw }
    this.order = [];
    this.sawToolCall = false;
    this.usage = null;
    this.sawStop = false;
  }

  onItem(item) {
    if (!item || typeof item.type !== "string") return;
    switch (item.type) {
      case "text.delta":
        this.text += item.text;
        break;
      case "text.done": {
        // done 是完整重放：已攒的增量一致就换成 done（权威），否则信任 done
        if (!this.text || item.text.startsWith(this.text)) this.text = item.text;
        break;
      }
      case "thinking.delta":
        this.thinking += item.thinking;
        break;
      case "thinking.done":
        if (!this.thinking || item.thinking.startsWith(this.thinking)) this.thinking = item.thinking;
        break;
      case "tool_call.delta": {
        const id = item.tool_call_id || this.order[this.order.length - 1];
        if (!id) break;
        let call = this.calls.get(id);
        if (!call || item.name) {
          call = { id, name: item.name || call?.name || "", raw: "" };
          this.calls.set(id, call);
          this.order.push(id);
        }
        call.raw += item.arguments ?? "";
        this.sawToolCall = true;
        break;
      }
      case "tool_call.done": {
        if (this.calls.has(item.tool_call_id)) break;
        this.calls.set(item.tool_call_id, {
          id: item.tool_call_id,
          name: item.name,
          raw: JSON.stringify(item.arguments ?? {}),
        });
        this.order.push(item.tool_call_id);
        this.sawToolCall = true;
        break;
      }
      default:
        break;
    }
  }

  onStop(event) {
    this.sawStop = true;
    this.finishReason = event.finish_reason ?? null;
    this.usage = usageFrom(event.usage_metadata);
  }

  finish() {
    const toolCalls = this.order
      .map((id) => this.calls.get(id))
      .filter((c) => c?.name)
      .map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.raw } }));
    const finish = finishReasonFor(this.sawToolCall, this.sawStop ? this.finishReason : "stop");
    const message = {
      role: "assistant",
      content: this.text.length ? this.text : null,
      ...(this.thinking ? { reasoning_content: this.thinking, reasoning: this.thinking } : {}),
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
    const completion = {
      id: this.id,
      object: "chat.completion",
      created: this.created,
      model: this.model,
      choices: [{ index: 0, message, finish_reason: finish }],
      ...(this.usage ? { usage: this.usage } : {}),
    };
    return completion;
  }
}
