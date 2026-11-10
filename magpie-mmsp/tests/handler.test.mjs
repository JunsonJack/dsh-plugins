// 处理层端到端（本地假上游）：真实 fetch + 真实 SSE 管道，不打外网。
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleChatRequest, mmspEndpoints, parseHeaders, buildUpstreamHeaders } from "../lib/mmsp-fetch.mjs";
import { MmspProvider } from "../index.mjs";

// 测试隔离：别去读开发者真实的 ~/.config/magpie/providers.json（里面有所有账号的 key）
process.env.MAGPIE_CONFIG_DIR = mkdtempSync(join(tmpdir(), "magpie-tests-"));

// 在临时配置目录里写一份弹窗版 providers.json
function writeDialogConfig(headers) {
  const dir = mkdtempSync(join(tmpdir(), "magpie-dialog-"));
  writeFileSync(join(dir, "providers.json"), JSON.stringify({ providers: [{ id: "mmsp", headers }] }), "utf8");
  return dir;
}

// 一个最小 MMSP 上游：/api/v1/stream 回 SSE，/api/v1/models 回列表
function startUpstream({ events = [], status = 200, errorBody = null } = {}) {
  const seen = { bodies: [], headers: [] };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen.headers.push(req.headers);
      if (req.url === "/api/v1/models") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ object: "list", data: [{ id: "deepseek-flash" }, { id: "gemini-embedding-1" }, { id: "gemini-3.8-flash" }] }));
        return;
      }
      seen.bodies.push(JSON.parse(raw || "{}"));
      if (status !== 200) {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(errorBody));
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const line of events) res.write(line);
      res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        root: `http://127.0.0.1:${port}`,
        endpoints: mmspEndpoints(`http://127.0.0.1:${port}`),
        seen,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

const MMSP_STREAM = [
  'data: {"role":"assistant","event_type":"delta","content_items":[{"type":"thinking.delta","thinking":"hmm"}],"usage_metadata":null,"finish_reason":null}\n\n',
  ": keepalive\n\n",
  'data: {"role":"assistant","event_type":"delta","content_items":[{"type":"text.delta","text":"Hel"}],"usage_metadata":null,"finish_reason":null}\n\n',
  'data: {"role":"assistant","event_type":"delta","content_items":[{"type":"text.done","text":"Hello"}],"usage_metadata":null,"finish_reason":null}\n\n',
  'data: {"role":"assistant","event_type":"delta","content_items":[{"type":"tool_call.delta","name":"get_weather","arguments":"{\\"location\\":\\"Par","tool_call_id":"call_t1"}],"usage_metadata":null,"finish_reason":null}\n\n',
  'data: {"role":"assistant","event_type":"delta","content_items":[{"type":"tool_call.delta","name":"","arguments":"is\\"}","tool_call_id":""}],"usage_metadata":null,"finish_reason":null}\n\n',
  'data: {"role":"assistant","event_type":"stop","content_items":[],"usage_metadata":{"cached_tokens":10,"prompt_tokens":20,"thoughts_tokens":5,"response_tokens":7},"finish_reason":"stop"}\n\n',
  "data: [DONE]\n\n",
];

const CHAT_REQUEST = {
  model: "deepseek-flash",
  stream: true,
  reasoning_effort: "high",
  temperature: 0.7, // 必须被丢弃
  messages: [
    { role: "system", content: "You are Ada." },
    { role: "user", content: "weather in Paris?" },
  ],
  tools: [{ type: "function", function: { name: "get_weather", description: "w", parameters: { type: "object" } } }],
  tool_choice: "auto",
};

test("流式：OpenAI 请求 → MMSP → chat chunks 全链路", async () => {
  const up = await startUpstream({ events: MMSP_STREAM });
  try {
    const response = await handleChatRequest({
      init: { method: "POST", body: JSON.stringify(CHAT_REQUEST) },
      key: "ep_test_key",
      endpoints: up.endpoints,
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);

    const text = await response.text();
    const dataLines = text.split("\n").filter((l) => l.startsWith("data: "));
    assert.equal(dataLines[dataLines.length - 1], "data: [DONE]");

    const chunks = dataLines.slice(0, -1).map((l) => JSON.parse(l.slice(6)));
    assert.equal(chunks[0].choices[0].delta.role, "assistant"); // role 首块

    const contents = chunks.filter((c) => typeof c.choices[0]?.delta?.content === "string" && c.choices[0].delta.content);
    assert.deepEqual(contents.map((c) => c.choices[0].delta.content), ["Hel", "lo"]); // delta "Hel" + done 补差额 "lo"

    const think = chunks.find((c) => c.choices[0]?.delta?.reasoning_content);
    assert.equal(think.choices[0].delta.reasoning_content, "hmm");

    const calls = chunks.flatMap((c) => c.choices[0]?.delta?.tool_calls ?? []);
    assert.equal(calls[0].id, "call_t1"); // 上游 id 原样透传
    assert.equal(calls[0].function.name, "get_weather");
    assert.deepEqual(JSON.parse(calls.map((c) => c.function?.arguments ?? "").join("")), { location: "Paris" });

    const finish = chunks.find((c) => c.choices[0]?.finish_reason);
    assert.equal(finish.choices[0].finish_reason, "tool_calls"); // stop 覆写

    const usage = chunks.find((c) => c.usage);
    assert.equal(usage.usage.prompt_tokens, 30);
    assert.equal(usage.usage.completion_tokens, 12);

    // 上游收到的请求体必须是干净的 MMSP
    const sent = up.seen.bodies[0];
    assert.equal(sent.model, "deepseek-flash");
    assert.equal(up.seen.headers[0].authorization, "Bearer ep_test_key");
    assert.equal(sent.config.thinking_level, "high");
    assert.equal(sent.config.system_prompt, "You are Ada.");
    assert.equal(sent.config.temperature, undefined);
    assert.deepEqual(sent.config.tool_choice, "auto");
    assert.deepEqual(sent.messages[0].content_items, [{ type: "text.done", text: "weather in Paris?" }]);
  } finally {
    await up.close();
  }
});

test("非流式：聚合为一条 chat.completion", async () => {
  const up = await startUpstream({ events: MMSP_STREAM });
  try {
    const response = await handleChatRequest({
      init: { method: "POST", body: JSON.stringify({ ...CHAT_REQUEST, stream: false }) },
      key: "k",
      endpoints: up.endpoints,
    });
    assert.equal(response.status, 200);
    const completion = await response.json();
    assert.equal(completion.object, "chat.completion");
    assert.equal(completion.choices[0].message.content, "Hello");
    assert.equal(completion.choices[0].message.reasoning_content, "hmm");
    assert.equal(completion.choices[0].finish_reason, "tool_calls");
    assert.equal(completion.usage.total_tokens, 42);
  } finally {
    await up.close();
  }
});

test("上游错误按原状态码与厂商原话透传", async () => {
  const up = await startUpstream({ status: 401, errorBody: { error: { type: "ApiKeyRequiredError", message: "bad key" } } });
  try {
    const response = await handleChatRequest({
      init: { method: "POST", body: JSON.stringify(CHAT_REQUEST) },
      key: "k",
      endpoints: up.endpoints,
    });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error.message, "bad key");
    assert.equal(body.error.type, "ApiKeyRequiredError");
  } finally {
    await up.close();
  }
});

test("上游 404（模型不存在）保持 404，让网关按模型被拒处理", async () => {
  const up = await startUpstream({ status: 404, errorBody: { error: { type: "RoutingError", message: "unknown model" } } });
  try {
    const response = await handleChatRequest({
      init: { method: "POST", body: JSON.stringify(CHAT_REQUEST) },
      key: "k",
      endpoints: up.endpoints,
    });
    assert.equal(response.status, 404);
  } finally {
    await up.close();
  }
});

test("非法请求：坏 JSON 400、非 POST 405、缺模型 400", async () => {
  const up = await startUpstream({});
  try {
    const bad = await handleChatRequest({ init: { method: "POST", body: "{oops" }, key: "k", endpoints: up.endpoints });
    assert.equal(bad.status, 400);

    const wrongMethod = await handleChatRequest({ init: { method: "GET" }, key: "k", endpoints: up.endpoints });
    assert.equal(wrongMethod.status, 405);

    const noModel = await handleChatRequest({ init: { method: "POST", body: JSON.stringify({ messages: [] }) }, key: "k", endpoints: up.endpoints });
    assert.equal(noModel.status, 400);
  } finally {
    await up.close();
  }
});

test("流中断（上游没发 stop）也能合成 finish", async () => {
  const truncated = MMSP_STREAM.slice(0, 3); // 只有 thinking + text，没有 stop
  const up = await startUpstream({ events: truncated });
  try {
    const response = await handleChatRequest({
      init: { method: "POST", body: JSON.stringify(CHAT_REQUEST) },
      key: "k",
      endpoints: up.endpoints,
    });
    const text = await response.text();
    const chunks = text
      .split("\n")
      .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
      .map((l) => JSON.parse(l.slice(6)));
    const finish = chunks.filter((c) => c.choices?.[0]?.finish_reason).pop();
    assert.equal(finish.choices[0].finish_reason, "stop");
  } finally {
    await up.close();
  }
});

test("parseHeaders: 解析多行文本、注释行、JSON 以及 Headers 实例", () => {
  assert.deepEqual(parseHeaders(null), {});
  assert.deepEqual(parseHeaders(""), {});
  assert.deepEqual(parseHeaders("   "), {});

  const multiline = `
    # 这是注释
    // 这是另一种注释
    X-Custom-Auth: token_123
    CF-Access-Client-Id: client_abc
    X-Url-Test: https://api.example.com/v1:8080/callback
  `;
  assert.deepEqual(parseHeaders(multiline), {
    "x-custom-auth": "token_123",
    "cf-access-client-id": "client_abc",
    "x-url-test": "https://api.example.com/v1:8080/callback",
  });

  const jsonStr = JSON.stringify({
    "X-From-Json": "value-1",
    "X-Multi": "123",
  });
  assert.deepEqual(parseHeaders(jsonStr), {
    "x-from-json": "value-1",
    "x-multi": "123",
  });

  const obj = { "X-Plain": "val", "X-Num": 42 };
  assert.deepEqual(parseHeaders(obj), {
    "x-plain": "val",
    "x-num": "42",
  });

  const h = new Headers();
  h.set("X-Header-Inst", "inst_val");
  assert.deepEqual(parseHeaders(h), {
    "x-header-inst": "inst_val",
  });
});

test("parseHeaders: 拒绝数组下标与原型污染键", () => {
  // 数组下标不是合法头名
  assert.deepEqual(parseHeaders(["a", "b"]), {});

  // JSON 里的 __proto__ / constructor 不能写进目标对象
  const polluted = parseHeaders('{"__proto__":{"polluted":true},"constructor":"x","X-Ok":"1"}');
  assert.deepEqual(polluted, { "x-ok": "1" });
  assert.equal({}.polluted, undefined);

  // 多行文本里的同类键同样被丢弃
  assert.deepEqual(parseHeaders("__proto__: boom\nPrototype: no\nX-Keep: yes"), { "x-keep": "yes" });
});

test("handleChatRequest: 正确透传 init.headers 与 extraHeaders 到上游", async () => {  const up = await startUpstream({ events: MMSP_STREAM });
  try {
    const response = await handleChatRequest({
      init: {
        method: "POST",
        body: JSON.stringify(CHAT_REQUEST),
        headers: {
          "X-Gateway-Header": "gw-value",
          Host: "dummy.host", // 必须被剔除
        },
      },
      key: "ep_custom_key",
      endpoints: up.endpoints,
      extraHeaders: "CF-Access-Token: cf_secret_token\nX-Org-Id: org_99",
    });
    assert.equal(response.status, 200);

    const sentHeaders = up.seen.headers[0];
    assert.equal(sentHeaders["authorization"], "Bearer ep_custom_key");
    assert.equal(sentHeaders["x-gateway-header"], "gw-value");
    assert.equal(sentHeaders["cf-access-token"], "cf_secret_token");
    assert.equal(sentHeaders["x-org-id"], "org_99");
    assert.notEqual(sentHeaders["host"], "dummy.host");
  } finally {
    await up.close();
  }
});

test("MmspProvider: 从 cfg.data.provider 动态读取 baseURL 与 headers", async () => {
  const up = await startUpstream({});
  try {
    // 真实形态是 { data: { provider: … } }，扁平写法的用例曾经掩盖了读错路径的 bug
    const currentConfig = {
      data: {
        provider: {
          mmsp: {
            api: up.root + "/api/v1",
            headers: "X-Provider-Header: provider_header_value",
          },
        },
      },
    };

    const plugin = await MmspProvider({
      client: {
        config: {
          get: async () => currentConfig,
        },
      },
    });

    const authHelper = async () => ({ type: "api", key: "ep_provider_key" });
    const loaderResult = await plugin.auth.loader(authHelper);

    assert.equal(loaderResult.baseURL, up.root + "/api/v1");
    assert.deepEqual(loaderResult.headers, {
      "x-provider-header": "provider_header_value",
    });

    // 测试 models() 动态请求带上自定义请求头
    const modelsResult = await plugin.provider.models({}, { auth: { type: "api", key: "ep_provider_key" } });
    assert.ok(modelsResult["deepseek-flash"]);

    const modelsHeaders = up.seen.headers[0];
    assert.equal(modelsHeaders["authorization"], "Bearer ep_provider_key");
    assert.equal(modelsHeaders["x-provider-header"], "provider_header_value");
  } finally {
    await up.close();
  }
});

test("请求头三层来源：弹窗 > 配置级 > options > 环境变量", async () => {
  const up = await startUpstream({});
  const previousDir = process.env.MAGPIE_CONFIG_DIR;
  const previousHeaders = process.env.MMSP_HEADERS;
  try {
    process.env.MMSP_HEADERS = "X-Layer: env\nX-Only-Env: e";
    process.env.MAGPIE_CONFIG_DIR = writeDialogConfig({ "x-layer": "dialog", "x-only-dialog": "d" });

    const plugin = await MmspProvider({
      client: {
        config: {
          get: async () => ({
            data: { provider: { mmsp: { headers: "X-Layer: config\nX-Only-Config: c" } } },
          }),
        },
      },
      options: { headers: "X-Layer: options\nX-Only-Options: o" },
    });

    const headers = (await plugin.auth.loader(async () => ({ type: "api", key: "ep_k" }))).headers;
    assert.equal(headers["x-layer"], "dialog");
    assert.equal(headers["x-only-dialog"], "d");
    assert.equal(headers["x-only-config"], "c");
    assert.equal(headers["x-only-options"], "o");
    assert.equal(headers["x-only-env"], "e");
  } finally {
    process.env.MAGPIE_CONFIG_DIR = previousDir;
    if (previousHeaders === undefined) delete process.env.MMSP_HEADERS;
    else process.env.MMSP_HEADERS = previousHeaders;
    await up.close();
  }
});

test("buildUpstreamHeaders: 丢非法头名/控制字符/逐跳头，协议关键头归插件", () => {
  const headers = buildUpstreamHeaders({
    incoming: { "X-Gateway": "g" },
    extra: {
      "bad name": "x", // 名字含空格：undici 抛 ERR_INVALID_HTTP_TOKEN
      "x中文": "y", // 非 ASCII 头名：同上
      "x-ctl": "a\r\nInjected: 1", // 控制字符：undici 抛 ERR_INVALID_CHAR
      Connection: "keep-alive",
      "Transfer-Encoding": "chunked",
      "Content-Length": "999",
      Host: "evil.host",
      Authorization: "Bearer wrong",
      "Content-Type": "text/plain",
      "x-keep": "ok",
    },
    key: "ep_real_key",
  });

  assert.equal(headers["x-gateway"], "g");
  assert.equal(headers["x-keep"], "ok");
  // 非法头名直接丢弃，不会让整个请求 502
  assert.ok(!("bad name" in headers));
  assert.ok(!("x中文" in headers));
  // 值里的 CR/LF 被剥成空格，注入的第二行不会变成新头
  assert.equal(headers["x-ctl"], "a  Injected: 1");
  // 逐跳头与运行时计算的头一律不转发
  for (const name of ["host", "connection", "transfer-encoding", "content-length"]) {
    assert.equal(headers[name], undefined);
  }
  // 协议关键头由插件接管：弹窗里写了也压不过去
  assert.equal(headers["authorization"], "Bearer ep_real_key");
  assert.equal(headers["content-type"], "application/json");
});

test("MMSP_DEBUG：开了打出站请求头且隐去密钥，关了静默", async () => {
  const up = await startUpstream({ events: MMSP_STREAM });
  const body = JSON.stringify({ model: "deepseek-flash", messages: [{ role: "user", content: "hi" }] });
  const collect = async () => {
    const lines = [];
    const orig = console.error;
    console.error = (...a) => lines.push(a.join(" "));
    try {
      const r = await handleChatRequest({
        init: { method: "POST", headers: { "content-type": "application/json" }, body },
        key: "ep_secret_key",
        endpoints: mmspEndpoints(up.url),
        extraHeaders: "X-App-URL: https://penguin.ooo/",
      });
      await r.text?.();
    } finally {
      console.error = orig;
    }
    return lines;
  };

  const prev = process.env.MMSP_DEBUG;
  try {
    process.env.MMSP_DEBUG = "1";
    const on = await collect();
    assert.equal(on.length, 1, "开开关应该打一行");
    assert.match(on[0], /^\[mmsp\] chat .*\/api\/v1\/stream → /);
    assert.match(on[0], /"x-app-url":"https:\/\/penguin\.ooo\/"/);
    assert.match(on[0], /"authorization":"<hidden>"/);
    // 密钥永远不出现在日志里
    assert.ok(!on.join("\n").includes("ep_secret_key"));

    delete process.env.MMSP_DEBUG;
    assert.deepEqual(await collect(), [], "关着不该有任何输出");

    process.env.MMSP_DEBUG = "0";
    assert.deepEqual(await collect(), [], "MMSP_DEBUG=0 也算关");
  } finally {
    if (prev === undefined) delete process.env.MMSP_DEBUG;
    else process.env.MMSP_DEBUG = prev;
    await up.close();
  }
});
