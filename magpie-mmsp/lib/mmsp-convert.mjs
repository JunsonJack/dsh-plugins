// OpenAI chat completions 请求 → MMSP UniMessage/UniConfig。
// 纯函数层：除 loadImage 注入外不做任何 I/O，供单元测试直接调用。
//
// 线上约束全部来自 dsh-llm-mmsp 对 go.penguin.ooo 的实测（2026-10-30）：
// - config 只接受 max_tokens / system_prompt / tools / tool_choice / thinking_level /
//   thinking_summary；temperature、stop、top_p、prompt_caching、fast_mode: true 一律 400，
//   所以本层按白名单组装，其余字段静默丢弃。
// - deepseek 系要求 tool_call_id 以 call_00_ET_ 开头 → 所有 id 归一化成
//   call_00_ET_ + 26 位十六进制摘要，幂等，对 gemini 系同样安全。
// - tool_result 必须是其 user 消息的第一个 item → 连续 tool 消息合并进一条
//   user 消息，紧随其后的 user 文本接在 tool_result 之后。
// - 对话不能以带 tool_call 的 assistant 消息结尾 → 清掉悬挂调用并补一句继续提示。
// - relay 不抓远程图片 URL → 远程图先抓取内联成 data: URI。
// - usage 换算：input = prompt_tokens + cached_tokens，output = thoughts_tokens + response_tokens。
// - gemini-4-argon 收 thinking_level "none" 稳定 400 → 兜到 "low"（精确匹配模型 id）。

import { createHash } from "node:crypto";

export const PROVIDER_ID = "mmsp";
export const ID_PREFIX = "call_00_ET_";

// 收 "none" 会稳定 400 的模型，一条一个精确 id，不做子串匹配（RFC-0003 §6.1）
export const MODELS_REJECTING_NONE = ["gemini-4-argon"];

// 推理档位映射。variants 键会原样成为 chat completions 的 reasoning_effort，
// 这里再映射到 MMSP 的六档 thinking_level。
const EFFORT_TO_LEVEL = {
  none: "none",
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
};

export function mapEffort(effort) {
  if (typeof effort !== "string") return undefined;
  return EFFORT_TO_LEVEL[effort];
}

export function normalizeToolCallId(id) {
  if (typeof id === "string" && id.startsWith(ID_PREFIX)) return id;
  const seed = typeof id === "string" && id.length > 0 ? id : "empty";
  return ID_PREFIX + createHash("sha256").update(seed).digest("hex").slice(0, 26);
}

export class ConversionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConversionError";
  }
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

// relay 不抓远程图片 URL：data: URI 原样，远程地址抓取后转 data: URI
async function inlineImage(url, loadImage) {
  if (typeof url !== "string" || !url) {
    throw new ConversionError("image part has no url");
  }
  if (url.startsWith("data:")) return url;
  try {
    return await loadImage(url);
  } catch (e) {
    throw new ConversionError(
      `remote image could not be inlined (relay only accepts data: URIs): ${url} — ${e?.message ?? e}`,
    );
  }
}

async function defaultLoadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 5 * 1024 * 1024) throw new Error("image larger than 5 MB");
  return `data:${type};base64,${buf.toString("base64")}`;
}

function parseArguments(raw) {
  if (raw == null) return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function userItems(content, loadImage) {
  const items = [];
  if (typeof content === "string") {
    if (content) items.push({ type: "text.done", text: content });
    return items;
  }
  if (!Array.isArray(content)) return items;
  for (const part of content) {
    if (part?.type === "text" && typeof part.text === "string" && part.text) {
      items.push({ type: "text.done", text: part.text });
    } else if (part?.type === "image_url") {
      const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
      items.push({ type: "image_url.done", image_url: await inlineImage(url, loadImage) });
    }
    // reasoning 等其他 part 与用户消息无关，跳过
  }
  return items;
}

async function toolResultItem(message, loadImage) {
  let text = "";
  const images = [];
  const content = message.content;
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    const texts = [];
    for (const part of content) {
      if (part?.type === "text" && typeof part.text === "string") {
        texts.push(part.text);
      } else if (part?.type === "image_url") {
        const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
        images.push(await inlineImage(url, loadImage));
      }
    }
    text = texts.join("\n");
  }
  const item = { type: "tool_result.done", tool_call_id: normalizeToolCallId(message.tool_call_id), text };
  if (images.length) item.images = images;
  return item;
}

async function assistantItems(message) {
  const items = [];
  const content = message.content;
  if (typeof content === "string" && content) {
    items.push({ type: "text.done", text: content });
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === "text" && typeof part.text === "string" && part.text) {
        items.push({ type: "text.done", text: part.text });
      } else if (part?.type === "reasoning" && typeof part.reasoning === "string" && part.reasoning) {
        items.push({ type: "thinking.done", thinking: part.reasoning });
      }
    }
  }
  for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    const fn = call?.function;
    if (!fn?.name) continue;
    items.push({
      type: "tool_call.done",
      name: fn.name,
      arguments: parseArguments(fn.arguments),
      tool_call_id: normalizeToolCallId(call.id),
    });
  }
  return items;
}

// 把整份 chat completions 请求翻译成 {"model", "messages", "config"}
export async function openaiToMmsp(body, { loadImage = defaultLoadImage } = {}) {
  const model = body.model;
  if (typeof model !== "string" || !model) throw new ConversionError("missing model");

  const config = {};
  const systemParts = [];
  const messages = [];
  // tool_result 必须是 user 消息第一个 item：连续 tool 消息攒进同一条 user
  // 消息，其后的 user 文本也并进来排在 tool_result 之后
  let userBuffer = null;
  const flushUser = () => {
    if (userBuffer?.content_items.length) messages.push(userBuffer);
    userBuffer = null;
  };

  // 思考档位：reasoning_effort → thinking_level；不选档位 = 上游默认（不编造）
  let level = mapEffort(body.reasoning_effort);
  if (level === "none" && MODELS_REJECTING_NONE.includes(model)) level = "low";
  if (level) config.thinking_level = level;
  // 开摘要不增加思考计费，只是把已计费的思考暴露出来（Gemini 系不传就一个字都看不到）
  if (level !== "none") config.thinking_summary = true;

  const maxTokens = Number.isFinite(body.max_tokens)
    ? body.max_tokens
    : Number.isFinite(body.max_completion_tokens)
      ? body.max_completion_tokens
      : undefined;
  if (maxTokens > 0) config.max_tokens = Math.floor(maxTokens);

  const tools = Array.isArray(body.tools)
    ? body.tools
        .filter((t) => t?.type === "function" && t.function?.name)
        .map((t) => ({
          name: t.function.name,
          description: t.function.description ?? "",
          parameters: t.function.parameters ?? {},
        }))
    : undefined;
  if (tools?.length) {
    config.tools = tools;
    const choice = body.tool_choice;
    if (choice === "auto" || choice === "none" || choice === "required") {
      config.tool_choice = choice;
    } else if (choice?.type === "function" && typeof choice.function?.name === "string") {
      config.tool_choice = [choice.function.name];
    }
  }

  for (const message of Array.isArray(body.messages) ? body.messages : []) {
    if (message.role === "system" || message.role === "developer") {
      const text = textOf(message.content);
      if (text) systemParts.push(text);
      continue;
    }
    if (message.role === "user") {
      const items = await userItems(message.content, loadImage);
      if (!items.length) continue;
      if (userBuffer) userBuffer.content_items.push(...items);
      else userBuffer = { role: "user", content_items: items };
      continue;
    }
    if (message.role === "tool") {
      if (!userBuffer) userBuffer = { role: "user", content_items: [] };
      userBuffer.content_items.push(await toolResultItem(message, loadImage));
      continue;
    }
    if (message.role === "assistant") {
      flushUser();
      const items = await assistantItems(message);
      if (items.length) messages.push({ role: "assistant", content_items: items });
      continue;
    }
  }
  flushUser();

  if (systemParts.length) config.system_prompt = systemParts.join("\n\n");

  // 悬挂调用：对话不能以带 tool_call 的 assistant 消息结尾（上游 400）
  const last = messages[messages.length - 1];
  if (last?.role === "assistant" && last.content_items.some((i) => i.type === "tool_call.done")) {
    last.content_items = last.content_items.filter((i) => i.type !== "tool_call.done");
    if (!last.content_items.length) messages.pop();
    messages.push({ role: "user", content_items: [{ type: "text.done", text: "Please continue." }] });
  }

  // config 白名单之外的键一律不下发
  const allowed = ["max_tokens", "system_prompt", "tools", "tool_choice", "thinking_level", "thinking_summary"];
  for (const key of Object.keys(config)) {
    if (!allowed.includes(key)) delete config[key];
  }

  return { model, messages, config };
}
