// 协议层（请求方向）单元测试：消息/工具/思考/图片映射与位置约束。
import test from "node:test";
import assert from "node:assert/strict";

import {
  openaiToMmsp,
  normalizeToolCallId,
  mapEffort,
  MODELS_REJECTING_NONE,
  ConversionError,
} from "../lib/mmsp-convert.mjs";

const CONFIG_ALLOWED = new Set([
  "max_tokens",
  "system_prompt",
  "tools",
  "tool_choice",
  "thinking_level",
  "thinking_summary",
]);

test("system 消息进 config.system_prompt，user 文本成 text.done", async () => {
  const out = await openaiToMmsp({
    model: "deepseek-flash",
    messages: [
      { role: "system", content: "You are Ada." },
      { role: "user", content: "hi" },
    ],
  });
  assert.equal(out.config.system_prompt, "You are Ada.");
  assert.deepEqual(out.messages, [
    { role: "user", content_items: [{ type: "text.done", text: "hi" }] },
  ]);
});

test("多条 system 以空行拼接；developer 视同 system", async () => {
  const out = await openaiToMmsp({
    model: "deepseek-flash",
    messages: [
      { role: "system", content: "A" },
      { role: "developer", content: [{ type: "text", text: "B" }] },
      { role: "system", content: "C" },
      { role: "user", content: "hi" },
    ],
  });
  assert.equal(out.config.system_prompt, "A\n\nB\n\nC");
});

test("max_tokens 与 max_completion_tokens 都映射；非法值不下发", async () => {
  const a = await openaiToMmsp({ model: "m", messages: [], max_tokens: 123.9 });
  assert.equal(a.config.max_tokens, 123);
  const b = await openaiToMmsp({ model: "m", messages: [], max_completion_tokens: 456 });
  assert.equal(b.config.max_tokens, 456);
  const c = await openaiToMmsp({ model: "m", messages: [], max_tokens: 0 });
  assert.equal(c.config.max_tokens, undefined);
});

test("config 白名单：temperature/top_p/stop/fast_mode/prompt_caching 一律不下发", async () => {
  const out = await openaiToMmsp({
    model: "deepseek-flash",
    messages: [{ role: "user", content: "x" }],
    temperature: 0.7,
    top_p: 0.9,
    stop: ["END"],
    fast_mode: true,
    prompt_caching: true,
    presence_penalty: 1,
    frequency_penalty: 1,
    seed: 1,
    stream_options: { include_usage: true },
    user: "u1",
    parallel_tool_calls: true,
  });
  for (const key of Object.keys(out.config)) {
    assert.ok(CONFIG_ALLOWED.has(key), `config 键 ${key} 不在白名单`);
  }
  assert.equal(out.config.temperature, undefined);
});

test("tools 映射为 ToolSchema；tool_choice 字符串与对象两种形式", async () => {
  const out = await openaiToMmsp({
    model: "deepseek-flash",
    messages: [{ role: "user", content: "x" }],
    tools: [
      { type: "function", function: { name: "get_weather", description: "w", parameters: { type: "object" } } },
      { type: "function", function: { name: "no_desc" } },
      { type: "web_search", web_search: {} }, // 非函数工具：跳过
    ],
    tool_choice: "auto",
  });
  assert.deepEqual(out.config.tools, [
    { name: "get_weather", description: "w", parameters: { type: "object" } },
    { name: "no_desc", description: "", parameters: {} },
  ]);
  assert.equal(out.config.tool_choice, "auto");

  const forced = await openaiToMmsp({
    model: "deepseek-flash",
    messages: [],
    tools: [{ type: "function", function: { name: "f" } }],
    tool_choice: { type: "function", function: { name: "f" } },
  });
  assert.deepEqual(forced.config.tool_choice, ["f"]);
});

test("reasoning_effort 六档直映，minimal 归 low；档位不被压平", async () => {
  assert.equal(mapEffort("low"), "low");
  assert.equal(mapEffort("medium"), "medium");
  assert.equal(mapEffort("high"), "high");
  assert.equal(mapEffort("xhigh"), "xhigh");
  assert.equal(mapEffort("max"), "max");
  assert.equal(mapEffort("minimal"), "low");
  const out = await openaiToMmsp({ model: "deepseek-flash", messages: [], reasoning_effort: "max" });
  assert.equal(out.config.thinking_level, "max");
});

test("不选档位 = 上游默认：不下发 thinking_level，但带 thinking_summary", async () => {
  const out = await openaiToMmsp({ model: "deepseek-flash", messages: [] });
  assert.equal(out.config.thinking_level, undefined);
  assert.equal(out.config.thinking_summary, true);
});

test("none 关思考；gemini-4-argon 的 none 兜到 low（其他模型不受影响）", async () => {
  const deepseek = await openaiToMmsp({ model: "deepseek-flash", messages: [], reasoning_effort: "none" });
  assert.equal(deepseek.config.thinking_level, "none");
  assert.equal(deepseek.config.thinking_summary, undefined); // 关了思考就不带摘要键

  const argon = await openaiToMmsp({ model: "gemini-4-argon", messages: [], reasoning_effort: "none" });
  assert.equal(argon.config.thinking_level, "low");
  assert.deepEqual(MODELS_REJECTING_NONE, ["gemini-4-argon"]);
});

test("tool_call id 归一化：幂等、带前缀、26 位十六进制", () => {
  const a = normalizeToolCallId("call_t1");
  assert.match(a, /^call_00_ET_[0-9a-f]{26}$/);
  assert.equal(normalizeToolCallId(a), a); // 幂等
  assert.equal(normalizeToolCallId("toolu_01ABC"), normalizeToolCallId("toolu_01ABC"));
  assert.notEqual(normalizeToolCallId("call_t1"), normalizeToolCallId("call_t2"));
});

test("assistant tool_calls → tool_call.done（arguments 解析成对象）", async () => {
  const out = await openaiToMmsp({
    model: "deepseek-flash",
    messages: [
      { role: "user", content: "weather?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_t1", type: "function", function: { name: "get_weather", arguments: '{"location":"Paris"}' } }],
      },
      { role: "tool", tool_call_id: "call_t1", content: "18C" },
    ],
  });
  const assistant = out.messages[1];
  assert.equal(assistant.role, "assistant");
  const call = assistant.content_items[0];
  assert.equal(call.type, "tool_call.done");
  assert.equal(call.name, "get_weather");
  assert.deepEqual(call.arguments, { location: "Paris" });
  assert.match(call.tool_call_id, /^call_00_ET_[0-9a-f]{26}$/);
});

test("tool 消息 → user + tool_result.done；连续 tool 合并且 tool_result 在最前；后续 user 排在其后", async () => {
  const callId = normalizeToolCallId("call_t1");
  const out = await openaiToMmsp({
    model: "deepseek-flash",
    messages: [
      { role: "user", content: "weather?" },
      {
        role: "assistant",
        tool_calls: [{ id: "call_t1", type: "function", function: { name: "get_weather", arguments: "{}" } }],
      },
      { role: "tool", tool_call_id: "call_t1", content: "18C sunny" },
      { role: "tool", tool_call_id: "call_t1", content: "dup" },
      { role: "user", content: "thanks, now Tokyo?" },
    ],
  });
  const resultMsg = out.messages[2];
  assert.equal(resultMsg.role, "user");
  assert.equal(resultMsg.content_items[0].type, "tool_result.done");
  assert.equal(resultMsg.content_items[0].tool_call_id, callId); // 与调用的归一化 id 对得上
  assert.equal(resultMsg.content_items[0].text, "18C sunny");
  assert.equal(resultMsg.content_items[1].text, "dup");
  assert.equal(resultMsg.content_items[2].type, "text.done"); // user 文本在 tool_result 之后
  assert.equal(resultMsg.content_items[2].text, "thanks, now Tokyo?");
});

test("tool_result 的图片进 images 数组（data: URI）", async () => {
  const dataUri = "data:image/png;base64,AAAA";
  const out = await openaiToMmsp({
    model: "deepseek-flash",
    messages: [
      {
        role: "tool",
        tool_call_id: "call_t1",
        content: [
          { type: "text", text: "screenshot" },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
  });
  const item = out.messages[0].content_items[0];
  assert.equal(item.text, "screenshot");
  assert.deepEqual(item.images, [dataUri]);
});

test("用户消息图片：data: URI 原样；远程 URL 经 loadImage 内联，失败报 ConversionError", async () => {
  const dataUri = "data:image/png;base64,AAAA";
  const ok = await openaiToMmsp(
    {
      model: "deepseek-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "look" },
            { type: "image_url", image_url: { url: "https://example.com/cat.png" } },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
    },
    { loadImage: async () => dataUri },
  );
  assert.deepEqual(ok.messages[0].content_items, [
    { type: "text.done", text: "look" },
    { type: "image_url.done", image_url: dataUri },
    { type: "image_url.done", image_url: dataUri },
  ]);

  await assert.rejects(
    openaiToMmsp(
      {
        model: "deepseek-flash",
        messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://example.com/x.png" } }] }],
      },
      {
        loadImage: async () => {
          throw new Error("404");
        },
      },
    ),
    ConversionError,
  );
});

test("悬挂调用：结尾 assistant 的 tool_call 被清掉并补继续提示；清空后消息整体移除", async () => {
  const dangling = await openaiToMmsp({
    model: "deepseek-flash",
    messages: [
      { role: "user", content: "a" },
      { role: "assistant", content: "thinking about it" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_t1", type: "function", function: { name: "f", arguments: "{}" } }],
      },
    ],
  });
  const last = dangling.messages[dangling.messages.length - 1];
  assert.equal(last.role, "user");
  assert.equal(last.content_items[0].text, "Please continue.");
  assert.ok(!dangling.messages.some((m) => m.content_items.some((i) => i.type === "tool_call.done")));

  const emptied = await openaiToMmsp({
    model: "deepseek-flash",
    messages: [
      { role: "user", content: "a" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_t1", type: "function", function: { name: "f", arguments: "{}" } }],
      },
    ],
  });
  assert.deepEqual(emptied.messages[emptied.messages.length - 1].content_items[0].text, "Please continue.");
});

test("缺失模型名报 ConversionError", async () => {
  await assert.rejects(openaiToMmsp({ messages: [] }), ConversionError);
});
