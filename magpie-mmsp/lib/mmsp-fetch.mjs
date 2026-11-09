// 处理网关转来的一个 chat completions 请求：翻译成 MMSP、发给上游、把回答翻回去。
// 返回值是标准 Response；流式逐块传输，非流式聚合成一条 JSON。

import { openaiToMmsp, ConversionError } from "./mmsp-convert.mjs";
import { MmspToChatChunks, MmspToChatMessage, mmspEvents } from "./mmsp-stream.mjs";

// penguin 的 API 前缀带 /api（其余 MMSP 服务器是裸 /v1）
export function mmspEndpoints(root) {
  return { stream: root + "/api/v1/stream", models: root + "/api/v1/models" };
}

/**
 * 将传入的自定义请求头解析为标准的键值对对象
 * 支持 Headers 实例、普通对象、多行 "Key: Value" 字符串（含 # 或 // 注释）、JSON 字符串
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
// 不允许写进请求头的键：原型链上的危险键会污染对象，HTTP 里也没有这两个头
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// RFC 9110 token：头名只能是这些字符。名字不合法时 undici 会抛 ERR_INVALID_HTTP_TOKEN，
// 被包成 502 之后用户根本看不出是自己填错了，所以这里直接丢弃。
const TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/;

// 值里的控制字符（含 CR/LF）会让 undici 抛 ERR_INVALID_CHAR，一律剥掉
// eslint-disable-next-line no-control-regex
const CTL_RE = /[\u0000-\u001f\u007f]/g;

// 由运行时或网关负责的头：转发过去会自相矛盾
const DROP_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "keep-alive",
  "te",
  "upgrade",
  "expect",
]);

// 统一的写入口：键归一化为小写、值转字符串、空键/危险键/非法头名一律丢弃
function setHeader(out, key, value) {
  if (key == null || value == null) return;
  const k = String(key).trim().toLowerCase();
  if (!k || UNSAFE_KEYS.has(k) || !TOKEN_RE.test(k)) return;
  const v = String(value).replace(CTL_RE, " ").trim();
  if (!v) return;
  out[k] = v;
}

export function parseHeaders(raw) {
  if (!raw) return {};
  if (typeof raw === "object") {
    if (Array.isArray(raw)) return {}; // 数组下标不是合法头名
    if (raw instanceof Headers) {
      const out = {};
      for (const [k, v] of raw.entries()) setHeader(out, k, v);
      return out;
    }
    const out = {};
    for (const [k, v] of Object.entries(raw)) setHeader(out, k, v);
    return out;
  }
  if (typeof raw !== "string") return {};

  const trimmed = raw.trim();
  if (!trimmed) return {};

  if (trimmed.startsWith("{")) {
    try {
      return parseHeaders(JSON.parse(trimmed));
    } catch {
      // 不是合法 JSON：继续按多行文本解析
    }
  }

  const out = {};
  for (const line of trimmed.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith("#") || l.startsWith("//")) continue;
    const idx = l.indexOf(":");
    if (idx <= 0) continue;
    // 只按第一个冒号切分，Value 里的冒号（URL、时间戳）原样保留
    setHeader(out, l.slice(0, idx), l.slice(idx + 1));
  }
  return out;
}

/**
 * 组装发往上游的请求头：网关来的头 + 配置的自定义头，最后让协议关键头说话。
 * 两个调用点（chat 与 models）共用，避免各自漏一套清理规则。
 * @param {{ incoming?: unknown, extra?: unknown, key: string }} spec
 * @returns {Record<string, string>}
 */
export function buildUpstreamHeaders({ incoming, extra, key } = {}) {
  const merged = { ...parseHeaders(incoming), ...parseHeaders(extra) };
  for (const name of DROP_HEADERS) delete merged[name];
  // authorization / content-type 归插件所有：弹窗里填同名头不生效，
  // 否则多账号的 key 会被顶掉、线格式会被改坏，且报错极难定位
  return {
    ...merged,
    "content-type": "application/json",
    authorization: `Bearer ${key}`,
  };
}

function sse(obj) {
  return "data: " + JSON.stringify(obj) + "\n\n";
}

// 调试开关：设了 MMSP_DEBUG 就把出站请求头打到 stderr（magpie 日志里能看见）。
// 值永远不打印——只标记「已隐藏」，避免把 key 写进日志。
const DEBUG = () => {
  const v = process.env.MMSP_DEBUG;
  return !!v && v !== "0" && v !== "false";
};

export function debugHeaders(where, headers) {
  if (!DEBUG()) return;
  const shown = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    shown[k] = k === "authorization" ? "<hidden>" : v;
  }
  try {
    console.error(`[mmsp] ${where} → ${JSON.stringify(shown)}`);
  } catch {
    // 日志失败不能影响请求
  }
}

function jsonResponse(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function badRequest(message) {
  return jsonResponse(400, { error: { message, type: "invalid_request_error" } });
}

async function errorFromUpstream(upstream) {
  const text = await upstream.text();
  let wire = null;
  try {
    wire = JSON.parse(text);
  } catch {
    // 非 JSON 错误体：截一段原文给 agent 看
  }
  const message = String(wire?.error?.message ?? wire?.error?.type ?? text.slice(0, 500) ?? "") ||
    `MMSP upstream answered HTTP ${upstream.status}`;
  return jsonResponse(upstream.status, {
    error: {
      message,
      type: String(wire?.error?.type ?? (upstream.status === 401 ? "authentication_error" : "api_error")),
    },
  });
}

async function* chatChunkLines(upstreamBody, model) {
  const state = new MmspToChatChunks(model);
  yield sse(state.roleChunk());
  for await (const event of mmspEvents(upstreamBody)) {
    if (event && typeof event === "object" && event.error) {
      // 流已经开始后的错误：一个 error 事件后跟 [DONE]
      yield sse({ error: event.error });
      return;
    }
    if (event?.event_type === "stop") {
      for (const chunk of state.onStop(event)) yield sse(chunk);
      return;
    }
    if (event?.event_type === "delta") {
      for (const item of Array.isArray(event.content_items) ? event.content_items : []) {
        for (const chunk of state.onItem(item)) yield sse(chunk);
      }
    }
  }
  for (const chunk of state.synthesizeEnd()) yield sse(chunk);
}

function streamResponse(upstreamBody, model) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const line of chatChunkLines(upstreamBody, model)) {
          controller.enqueue(encoder.encode(line));
        }
      } catch (e) {
        try {
          controller.enqueue(encoder.encode(sse({ error: { type: "api_error", message: String(e?.message ?? e) } })));
        } catch {
          // 下游已经不在了
        }
      }
      try {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch {
        // 同上
      }
      controller.close();
    },
  });
  // 流式正文改写过：不带 content-length / content-encoding
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
  });
}

async function nonStreamResponse(upstreamBody, model) {
  const agg = new MmspToChatMessage(model);
  for await (const event of mmspEvents(upstreamBody)) {
    if (event && typeof event === "object" && event.error) {
      return jsonResponse(502, {
        error: { message: String(event.error.message ?? "MMSP upstream error"), type: String(event.error.type ?? "api_error") },
      });
    }
    if (event?.event_type === "stop") {
      agg.onStop(event);
      break;
    }
    if (event?.event_type === "delta") {
      for (const item of Array.isArray(event.content_items) ? event.content_items : []) {
        agg.onItem(item);
      }
    }
  }
  return jsonResponse(200, agg.finish());
}

// loader 每个请求调用一次。input 是网关拼好的完整 URL（chat completions 地址，
// 只是摆设——真正的 MMSP 地址在 endpoints 里），init.body 是网关转换好的
// OpenAI 请求 JSON。
export async function handleChatRequest({ init, key, endpoints, extraHeaders = null, fetchImpl = globalThis.fetch }) {
  const method = (init?.method ?? "POST").toUpperCase();
  if (method !== "POST") {
    return jsonResponse(405, { error: { message: `MMSP converter only accepts POST (got ${method})`, type: "invalid_request_error" } });
  }

  let body;
  const raw = init?.body;
  try {
    const text = typeof raw === "string" ? raw : raw == null ? "" : new TextDecoder().decode(raw);
    body = JSON.parse(text);
  } catch {
    return badRequest("request body is not valid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("request body is empty");
  if (typeof body.model !== "string" || !body.model) return badRequest("missing model");

  let request;
  try {
    request = await openaiToMmsp(body);
  } catch (e) {
    if (e instanceof ConversionError) return badRequest(e.message);
    throw e;
  }

  // 整理上游请求头：合并传入的 init.headers 与配置的自定义 extraHeaders
  const upstreamHeaders = buildUpstreamHeaders({ incoming: init?.headers, extra: extraHeaders, key });
  debugHeaders("chat " + endpoints.stream, upstreamHeaders);

  let upstream;
  try {
    upstream = await fetchImpl(endpoints.stream, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(request),
      signal: init?.signal,
    });
  } catch (e) {
    return jsonResponse(502, { error: { message: `MMSP upstream unreachable: ${e?.message ?? e}`, type: "api_error" } });
  }

  if (!upstream.ok) return await errorFromUpstream(upstream);
  if (body.stream === true) return streamResponse(upstream.body, body.model);
  return await nonStreamResponse(upstream.body, body.model);
}
