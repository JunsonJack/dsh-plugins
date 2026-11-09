// 协议层（响应方向）单元测试：MMSP 事件 → chat completions chunk/消息。
import test from "node:test";
import assert from "node:assert/strict";

import {
  MmspToChatChunks,
  MmspToChatMessage,
  mmspEvents,
  finishReasonFor,
} from "../lib/mmsp-stream.mjs";

const delta = (item) => ({ role: "assistant", event_type: "delta", content_items: [item], usage_metadata: null, finish_reason: null });
const stop = (finish_reason, usage_metadata) => ({ role: "assistant", event_type: "stop", content_items: [], usage_metadata, finish_reason });

function drain(state, events) {
  const chunks = [];
  for (const event of events) {
    if (event.event_type === "stop") chunks.push(...state.onStop(event));
    else for (const item of event.content_items) chunks.push(...state.onItem(item));
  }
  return chunks;
}

test("文本增量进 delta.content；done 与增量一致时去重，只补差额", () => {
  const state = new MmspToChatChunks("deepseek-flash");
  const chunks = drain(state, [
    delta({ type: "text.delta", text: "Hel" }),
    delta({ type: "text.delta", text: "lo" }),
    delta({ type: "text.done", text: "Hello" }), // 与已发增量完全一致 → 不再发
  ]);
  assert.deepEqual(chunks.map((c) => c.choices[0].delta.content), ["Hel", "lo"]);

  const state2 = new MmspToChatChunks("deepseek-flash");
  const chunks2 = drain(state2, [
    delta({ type: "text.delta", text: "Hel" }),
    delta({ type: "text.done", text: "Hello world" }), // 多了差额 → 只补 "lo world"
  ]);
  assert.deepEqual(chunks2.map((c) => c.choices[0].delta.content), ["Hel", "lo world"]);
});

test("没有增量时 done 整段直发", () => {
  const state = new MmspToChatChunks("m");
  const chunks = drain(state, [delta({ type: "text.done", text: "all at once" })]);
  assert.deepEqual(chunks.map((c) => c.choices[0].delta.content), ["all at once"]);
});

test("思考增量进 reasoning_content 与 reasoning 两个字段", () => {
  const state = new MmspToChatChunks("m");
  const chunks = drain(state, [delta({ type: "thinking.delta", thinking: "hmm " }), delta({ type: "thinking.done", thinking: "hmm ok" })]);
  assert.deepEqual(chunks[0].choices[0].delta.reasoning_content, "hmm ");
  assert.deepEqual(chunks[0].choices[0].delta.reasoning, "hmm ");
  assert.deepEqual(chunks[1].choices[0].delta.reasoning_content, "ok"); // 去重后只补 "ok"
});

test("tool_call 增量归到正确的调用：首片带 id/name，后续只带 arguments", () => {
  const state = new MmspToChatChunks("m");
  const chunks = drain(state, [
    delta({ type: "tool_call.delta", name: "get_weather", arguments: '{"loc', tool_call_id: "call_00_ET_a" }),
    delta({ type: "tool_call.delta", name: "", arguments: 'ation":"Paris"}', tool_call_id: "" }),
    delta({ type: "tool_call.delta", name: "other", arguments: "{}", tool_call_id: "call_00_ET_b" }),
  ]);
  const calls = chunks.map((c) => c.choices[0].delta.tool_calls?.[0]);
  assert.equal(calls[0].index, 0);
  assert.equal(calls[0].id, "call_00_ET_a");
  assert.equal(calls[0].function.name, "get_weather");
  assert.equal(calls[0].function.arguments, '{"loc');
  assert.equal(calls[1].index, 0); // 归属第一个调用
  assert.equal(calls[1].id, undefined);
  assert.equal(calls[1].function.arguments, 'ation":"Paris"}');
  assert.equal(calls[2].index, 1); // 第二个调用
  assert.equal(calls[2].id, "call_00_ET_b");
});

test("tool_call.done 在已流过增量时跳过，未流过时整发", () => {
  const streamed = new MmspToChatChunks("m");
  const a = drain(streamed, [
    delta({ type: "tool_call.delta", name: "f", arguments: "{}", tool_call_id: "call_00_ET_a" }),
    delta({ type: "tool_call.done", name: "f", arguments: {}, tool_call_id: "call_00_ET_a" }),
  ]);
  assert.equal(a.length, 1);

  const direct = new MmspToChatChunks("m");
  const b = drain(direct, [delta({ type: "tool_call.done", name: "f", arguments: { x: 1 }, tool_call_id: "call_00_ET_b" })]);
  const call = b[0].choices[0].delta.tool_calls[0];
  assert.equal(call.id, "call_00_ET_b");
  assert.deepEqual(JSON.parse(call.function.arguments), { x: 1 });
});

test("stop 事件：finish_reason tool_call → tool_calls；deepseek 的 stop + 出现过工具调用也覆写成 tool_calls", () => {
  const s1 = new MmspToChatChunks("m");
  drain(s1, [delta({ type: "text.delta", text: "calling" }), delta({ type: "tool_call.delta", name: "f", arguments: "{}", tool_call_id: "c1" })]);
  const [finish1] = s1.onStop(stop("tool_call", null));
  assert.equal(finish1.choices[0].finish_reason, "tool_calls");

  const s2 = new MmspToChatChunks("deepseek-flash");
  drain(s2, [delta({ type: "tool_call.delta", name: "f", arguments: "{}", tool_call_id: "c1" })]);
  const [finish2] = s2.onStop(stop("stop", null)); // 上游报 stop
  assert.equal(finish2.choices[0].finish_reason, "tool_calls"); // 覆写

  const s3 = new MmspToChatChunks("m");
  drain(s3, [delta({ type: "text.delta", text: "plain" })]);
  const [finish3] = s3.onStop(stop("stop", null));
  assert.equal(finish3.choices[0].finish_reason, "stop");

  assert.equal(finishReasonFor(false, "length"), "length");
});

test("usage 换算：input = prompt + cached，output = thoughts + response，附 details", () => {
  const state = new MmspToChatChunks("m");
  const [finish, usageChunk] = state.onStop(
    stop("stop", { cached_tokens: 10, prompt_tokens: 20, thoughts_tokens: 5, response_tokens: 7 }),
  );
  assert.equal(finish.choices[0].finish_reason, "stop");
  assert.deepEqual(usageChunk.choices, []);
  assert.equal(usageChunk.usage.prompt_tokens, 30);
  assert.equal(usageChunk.usage.completion_tokens, 12);
  assert.equal(usageChunk.usage.total_tokens, 42);
  assert.deepEqual(usageChunk.usage.prompt_tokens_details, { cached_tokens: 10 });
  assert.deepEqual(usageChunk.usage.completion_tokens_details, { reasoning_tokens: 5 });
});

test("null usage 字段按 0 计", () => {
  const state = new MmspToChatChunks("m");
  const [, usageChunk] = state.onStop(stop("stop", { cached_tokens: null, prompt_tokens: null, thoughts_tokens: null, response_tokens: null }));
  assert.deepEqual([usageChunk.usage.prompt_tokens, usageChunk.usage.completion_tokens], [0, 0]);
});

test("非流式聚合：文本 + 思考 + 工具 + usage 一次成型", () => {
  const agg = new MmspToChatMessage("deepseek-flash");
  for (const event of [
    delta({ type: "thinking.delta", thinking: "hmm" }),
    delta({ type: "text.delta", text: "Hel" }),
    delta({ type: "text.done", text: "Hello" }),
    delta({ type: "tool_call.delta", name: "get_weather", arguments: '{"location":"Par', tool_call_id: "call_00_ET_a" }),
    delta({ type: "tool_call.delta", name: "", arguments: 'is"}', tool_call_id: "" }),
    stop("stop", { cached_tokens: 1, prompt_tokens: 2, thoughts_tokens: 3, response_tokens: 4 }),
  ]) {
    if (event.event_type === "stop") agg.onStop(event);
    else for (const item of event.content_items) agg.onItem(item);
  }
  const completion = agg.finish();
  assert.equal(completion.object, "chat.completion");
  const { message } = completion.choices[0];
  assert.equal(message.content, "Hello");
  assert.equal(message.reasoning_content, "hmm");
  assert.equal(message.tool_calls[0].function.arguments, '{"location":"Paris"}');
  assert.equal(completion.choices[0].finish_reason, "tool_calls");
  assert.equal(completion.usage.prompt_tokens, 3);
  assert.equal(completion.usage.completion_tokens, 7);
});

test("SSE 解析：注释行跳过、[DONE] 终止、坏 JSON 跳过", async () => {
  const body = ReadableStream.from([
    ": keepalive\n\n",
    "data: not json\n\n",
    'data: {"role":"assistant","event_type":"delta","content_items":[{"type":"text.delta","text":"hi"}],"usage_metadata":null,"finish_reason":null}\n',
    ": keepalive again\n",
    "data: [DONE]\n",
    'data: {"never":"reached"}\n',
  ]);
  const events = [];
  for await (const event of mmspEvents(body)) events.push(event);
  assert.equal(events.length, 1);
  assert.equal(events[0].content_items[0].text, "hi");
});

test("流中途错误事件原样暴露", async () => {
  const state = new MmspToChatChunks("m");
  const chunks = [];
  const error = { type: "ProviderStreamError", message: "upstream blew up" };
  chunks.push(...state.onItem({ type: "text.delta", text: "partial" }));
  chunks.push({ error }); // 处理层把 error 事件原样下发
  assert.equal(chunks[0].choices[0].delta.content, "partial");
  assert.equal(chunks[1].error.message, "upstream blew up");
});
