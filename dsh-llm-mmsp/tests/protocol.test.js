/**
 * MMSP 协议转换的单元测试。
 *
 * 用 node 内置的 `node:test` + `node:assert`，不引入任何依赖 ——
 * 这样测试能在任何装了 node 的机器上直接跑（`node --test`）。
 *
 * 覆盖的每条规则都来自对 go.penguin.ooo 的实测（见 `mmsp-protocol.js` 模块头）。
 *
 * @module dsh-llm-mmsp/protocol.test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MmspStreamDecoder,
  bareModelId,
  buildMmspRequest,
  messagesToMmsp,
  normalizeToolCallId,
  thinkingLevelFor,
  thinkingLevelOf,
  thinkingLevelsForModel,
  toolsToMmsp,
  usageFromMmsp,
} from '../lib/mmsp-protocol.js';

test('normalizeToolCallId: 非前缀 id 被改写成 call_00_ET_ + 26 位十六进制', () => {
  const id = normalizeToolCallId('toolu_01ABCDEFGHIJKLMNOPQRSTUV');
  assert.match(id, /^call_00_ET_[0-9A-F]{26}$/);
});

test('normalizeToolCallId: 已带前缀的 id 原样返回（幂等）', () => {
  const once = normalizeToolCallId('toolu_01ABCDEFGHIJKLMNOPQRSTUV');
  const twice = normalizeToolCallId(once);
  assert.equal(twice, once);
});

test('normalizeToolCallId: 不同 id 映射到不同值', () => {
  const a = normalizeToolCallId('toolu_01A');
  const b = normalizeToolCallId('toolu_01B');
  assert.notEqual(a, b);
});

test('normalizeToolCallId: 空 id 也得到合法形状', () => {
  assert.match(normalizeToolCallId(''), /^call_00_ET_[0-9A-F]{26}$/);
});

test('bareModelId: 去掉路由前缀', () => {
  assert.equal(bareModelId('penguin/deepseek-flash'), 'deepseek-flash');
  assert.equal(bareModelId('deepseek-flash'), 'deepseek-flash');
});

test('thinkingLevelOf: harness 档位 → MMSP thinking_level（六档不降级）', () => {
  assert.equal(thinkingLevelOf('off'), 'none');
  assert.equal(thinkingLevelOf('low'), 'low');
  assert.equal(thinkingLevelOf('medium'), 'medium');
  assert.equal(thinkingLevelOf('high'), 'high');
  // 六档全部原样透传：xhigh / max 不再被压成 high（实测 relay 接受）。
  assert.equal(thinkingLevelOf('xhigh'), 'xhigh');
  assert.equal(thinkingLevelOf('max'), 'max');
  assert.equal(thinkingLevelOf('unknown-level'), undefined);
  assert.equal(thinkingLevelOf(undefined), undefined);
});

test('thinkingLevelOf: 各家的同义词归一到 MMSP 的词表', () => {
  assert.equal(thinkingLevelOf('none'), 'none');
  assert.equal(thinkingLevelOf('disabled'), 'none');
  assert.equal(thinkingLevelOf('minimal'), 'low');
});

test('thinkingLevelsForModel: 默认声明全六档（升序）', () => {
  assert.deepEqual(thinkingLevelsForModel('deepseek-flash'), [
    'none', 'low', 'medium', 'high', 'xhigh', 'max',
  ]);
});

test('thinkingLevelsForModel: argon 不声明 none（该模型收 none 会 400）', () => {
  const levels = thinkingLevelsForModel('gemini-4-argon');
  assert.equal(levels.includes('none'), false);
  assert.equal(levels[0], 'low');
  assert.equal(levels[levels.length - 1], 'max');
});

test('thinkingLevelsForModel: 认带路由前缀的 id，且大小写无关', () => {
  assert.equal(thinkingLevelsForModel('mmsp/gemini-4-argon').includes('none'), false);
  assert.equal(thinkingLevelsForModel('Gemini-4-Argon').includes('none'), false);
});

test('thinkingLevelsForModel: 其余 Gemini 仍可声明 none（它们只是跑最少思考）', () => {
  for (const model of ['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.5-flash-lite']) {
    assert.equal(thinkingLevelsForModel(model).includes('none'), true, model);
  }
});

test('thinkingLevelFor: argon 的 none 兜到 low，其他档位不动', () => {
  assert.equal(thinkingLevelFor('gemini-4-argon', 'none'), 'low');
  assert.equal(thinkingLevelFor('gemini-4-argon', 'high'), 'high');
  assert.equal(thinkingLevelFor('gemini-4-argon', 'max'), 'max');
  // 非 argon 的 none 原样发。
  assert.equal(thinkingLevelFor('deepseek-flash', 'none'), 'none');
  assert.equal(thinkingLevelFor('gemini-3.8-flash', 'none'), 'none');
});

test('thinkingLevelFor: 空档位不表达', () => {
  assert.equal(thinkingLevelFor('deepseek-flash', undefined), undefined);
  assert.equal(thinkingLevelFor('deepseek-flash', ''), undefined);
});

test('usageFromMmsp: input = cached + prompt, output = thoughts + response', () => {
  const usage = usageFromMmsp({
    cached_tokens: 10,
    prompt_tokens: 100,
    thoughts_tokens: 5,
    response_tokens: 20,
  });
  assert.equal(usage.inputTokens, 110);
  assert.equal(usage.outputTokens, 25);
  assert.equal(usage.totalTokens, 135);
  assert.equal(usage.cacheReadTokens, 10);
  assert.equal(usage.reasoningTokens, 5);
});

test('usageFromMmsp: 缺字段按 0 处理', () => {
  const usage = usageFromMmsp(undefined);
  assert.equal(usage.inputTokens, 0);
  assert.equal(usage.outputTokens, 0);
});

test('toolsToMmsp: 工具表转成 MMSP 形状', () => {
  const tools = toolsToMmsp([
    { name: 'get_weather', description: 'weather', parameters: { type: 'object' } },
  ]);
  assert.deepEqual(tools, [
    { name: 'get_weather', description: 'weather', parameters: { type: 'object' } },
  ]);
});

test('toolsToMmsp: 没有工具时返回 undefined（不下发空表）', () => {
  assert.equal(toolsToMmsp([]), undefined);
  assert.equal(toolsToMmsp(undefined), undefined);
});

test('messagesToMmsp: system 提示词被移出消息、进 config.system_prompt', () => {
  const { messages, systemPrompt } = messagesToMmsp({
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    system: 'You are terse.',
  });
  assert.equal(systemPrompt, 'You are terse.');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, 'user');
});

test('messagesToMmsp: system 角色的消息并进系统提示词，而不是留在消息里', () => {
  const { messages, systemPrompt } = messagesToMmsp({
    messages: [
      { role: 'system', content: [{ type: 'text', text: 'sys text' }] },
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ],
    system: undefined,
  });
  assert.equal(systemPrompt, 'sys text');
  assert.equal(messages.length, 1);
});

test('messagesToMmsp: developer 消息被丢弃', () => {
  const { messages } = messagesToMmsp({
    messages: [
      { role: 'developer', content: [{ type: 'text', text: 'tools changed' }] },
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ],
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, 'user');
});

test('messagesToMmsp: tool 消息转成 tool_result.done，字段名是 text', () => {
  const { messages } = messagesToMmsp({
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'weather?' }] },
      { role: 'assistant', content: [{ type: 'tool-call', id: 'toolu_01A', name: 'get_weather', arguments: '{"location":"Paris"}' }] },
      { role: 'tool', toolCallId: 'toolu_01A', content: [{ type: 'text', text: 'sunny' }] },
    ],
  });
  const last = messages[messages.length - 1];
  assert.equal(last.role, 'user');
  const result = last.content_items[0];
  assert.equal(result.type, 'tool_result.done');
  assert.equal(result.text, 'sunny');
  assert.match(result.tool_call_id, /^call_00_ET_[0-9A-F]{26}$/);
});

test('messagesToMmsp: tool_result 是该 user 消息的首个 item（实测约束）', () => {
  const { messages } = messagesToMmsp({
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'weather?' }] },
      { role: 'assistant', content: [{ type: 'tool-call', id: 'toolu_01A', name: 'w', arguments: '{}' }] },
      { role: 'tool', toolCallId: 'toolu_01A', content: [{ type: 'text', text: 'sunny' }] },
      { role: 'user', content: [{ type: 'text', text: 'summarize' }] },
    ],
  });
  const toolMsg = messages.find((m) => m.content_items.some((i) => i.type === 'tool_result.done'));
  assert.equal(toolMsg.content_items[0].type, 'tool_result.done');
  assert.equal(toolMsg.content_items[1].type, 'text.done');
});

test('messagesToMmsp: 连续的工具结果合并进同一条 user 消息', () => {
  const { messages } = messagesToMmsp({
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'two?' }] },
      { role: 'assistant', content: [
        { type: 'tool-call', id: 'toolu_01A', name: 'w', arguments: '{}' },
        { type: 'tool-call', id: 'toolu_01B', name: 'w', arguments: '{}' },
      ] },
      { role: 'tool', toolCallId: 'toolu_01A', content: [{ type: 'text', text: 'a' }] },
      { role: 'tool', toolCallId: 'toolu_01B', content: [{ type: 'text', text: 'b' }] },
    ],
  });
  const withResults = messages.filter((m) => m.content_items.some((i) => i.type === 'tool_result.done'));
  assert.equal(withResults.length, 1);
  assert.equal(withResults[0].content_items.filter((i) => i.type === 'tool_result.done').length, 2);
});

test('messagesToMmsp: assistant 的 tool-call id 被归一化', () => {
  const { messages } = messagesToMmsp({
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'weather?' }] },
      { role: 'assistant', content: [{ type: 'tool-call', id: 'toolu_01A', name: 'w', arguments: '{}' }] },
      { role: 'tool', toolCallId: 'toolu_01A', content: [{ type: 'text', text: 'sunny' }] },
    ],
  });
  const call = messages[1].content_items[0];
  assert.equal(call.type, 'tool_call.done');
  assert.match(call.tool_call_id, /^call_00_ET_[0-9A-F]{26}$/);
  // 同一个 id 在工具结果侧必须一致（否则对不上）。
  const result = messages[2].content_items[0];
  assert.equal(result.tool_call_id, call.tool_call_id);
});

test('messagesToMmsp: 悬挂的 tool_call（对话以 assistant 工具调用结尾）被清理', () => {
  const { messages } = messagesToMmsp({
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'weather?' }] },
      { role: 'assistant', content: [{ type: 'tool-call', id: 'toolu_01A', name: 'w', arguments: '{}' }] },
    ],
  });
  const last = messages[messages.length - 1];
  assert.equal(last.role, 'user');
  assert.equal(last.content_items[0].type, 'text.done');
});

test('messagesToMmsp: 空消息序列产出占位 user 消息', () => {
  const { messages } = messagesToMmsp({ messages: [] });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, 'user');
});

test('messagesToMmsp: 图片附件按 id 内联成 image_url.done', () => {
  const { messages } = messagesToMmsp({
    messages: [
      { role: 'user', content: [
        { type: 'image', attachment: { attachmentId: 'abc' } },
        { type: 'text', text: 'what color?' },
      ] },
    ],
    imageDataUris: new Map([['abc', 'data:image/png;base64,AAA']]),
  });
  assert.equal(messages[0].content_items[0].type, 'image_url.done');
  assert.equal(messages[0].content_items[0].image_url, 'data:image/png;base64,AAA');
});

test('buildMmspRequest: 只下发 relay 白名单内的 config 键', () => {
  const body = buildMmspRequest({
    model: 'mmsp/deepseek-flash',
    system: 'be terse',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    tools: [{ name: 'w', description: 'd', parameters: { type: 'object' } }],
    maxTokens: 512,
    reasoningEffort: 'medium',
  });
  assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.config.max_tokens, 512);
  assert.equal(body.config.system_prompt, 'be terse');
  assert.equal(body.config.thinking_level, 'medium');
  assert.ok(body.config.tools);
  // temperature / stop / top_p 一律不下发（实测会被 relay 拒）。
  assert.equal('temperature' in body.config, false);
  assert.equal('stop' in body.config, false);
  assert.equal('top_p' in body.config, false);
});

test('buildMmspRequest: thinking_summary 只在开口时才带，且必须是布尔', () => {
  const messages = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }];

  const on = buildMmspRequest({ model: 'gemini-3.8-flash', messages, reasoningEffort: 'high', thinkingSummary: true });
  assert.equal(on.config.thinking_summary, true);
  assert.equal(on.config.thinking_level, 'high');

  const off = buildMmspRequest({ model: 'gemini-3.8-flash', messages, reasoningEffort: 'high', thinkingSummary: false });
  assert.equal('thinking_summary' in off.config, false);

  const unset = buildMmspRequest({ model: 'gemini-3.8-flash', messages, reasoningEffort: 'high' });
  assert.equal('thinking_summary' in unset.config, false);
});

test('buildMmspRequest: 档位为 none 时不要摘要（没东西可摘要）', () => {
  const body = buildMmspRequest({
    model: 'deepseek-flash',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    reasoningEffort: 'none',
    thinkingSummary: true,
  });
  assert.equal(body.config.thinking_level, 'none');
  assert.equal('thinking_summary' in body.config, false);
});

test('buildMmspRequest: 没有任何档位时也不带摘要', () => {
  const body = buildMmspRequest({
    model: 'deepseek-flash',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    thinkingSummary: true,
  });
  assert.equal('thinking_level' in body.config, false);
  assert.equal('thinking_summary' in body.config, false);
});

test('buildMmspRequest: argon 的 none 实际发成 low（不 400）', () => {
  const body = buildMmspRequest({
    model: 'gemini-4-argon',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    reasoningEffort: 'none',
  });
  assert.equal(body.config.thinking_level, 'low');
});

test('buildMmspRequest: max 档原样下发，不被压成 high', () => {
  const body = buildMmspRequest({
    model: 'gemini-3.8-flash',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    reasoningEffort: 'max',
  });
  assert.equal(body.config.thinking_level, 'max');
});

test('MmspStreamDecoder: 文本流产出 block-start / text-delta', () => {
  const decoder = new MmspStreamDecoder('m');
  const chunks = decoder.feed({
    event_type: 'delta',
    content_items: [{ type: 'text.delta', text: 'Hel' }],
  });
  assert.deepEqual(chunks, [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'Hel' },
  ]);
});

test('MmspStreamDecoder: text.done 不重复已流过的文本', () => {
  const decoder = new MmspStreamDecoder('m');
  decoder.feed({ event_type: 'delta', content_items: [{ type: 'text.delta', text: 'Hel' }] });
  const chunks = decoder.feed({
    event_type: 'delta',
    content_items: [{ type: 'text.done', text: 'Hello' }],
  });
  assert.deepEqual(chunks, []);
});

test('MmspStreamDecoder: 没有 delta 时 text.done 补发整段', () => {
  const decoder = new MmspStreamDecoder('m');
  const chunks = decoder.feed({
    event_type: 'delta',
    content_items: [{ type: 'text.done', text: 'Hello' }],
  });
  assert.equal(chunks.length, 2);
  assert.equal(chunks[1].type, 'text-delta');
  assert.equal(chunks[1].text, 'Hello');
});

test('MmspStreamDecoder: 思考流用 reasoning 块', () => {
  const decoder = new MmspStreamDecoder('m');
  const chunks = decoder.feed({
    event_type: 'delta',
    content_items: [{ type: 'thinking.delta', thinking: 'hmm' }],
  });
  assert.equal(chunks[0].blockType, 'reasoning');
  assert.equal(chunks[1].type, 'reasoning-delta');
});

test('MmspStreamDecoder: 工具调用的分片归属到打开的调用', () => {
  const decoder = new MmspStreamDecoder('m');
  const first = decoder.feed({
    event_type: 'delta',
    content_items: [{ type: 'tool_call.delta', name: 'get_weather', arguments: '', tool_call_id: 'call_00_ET_ABC' }],
  });
  assert.equal(first[0].type, 'block-start');
  assert.equal(first[0].blockType, 'tool-call');
  const second = decoder.feed({
    event_type: 'delta',
    content_items: [{ type: 'tool_call.delta', name: '', arguments: '{"a":', tool_call_id: '' }],
  });
  assert.equal(second.length, 1);
  assert.equal(second[0].type, 'tool-call-delta');
  assert.equal(second[0].index, first[0].index);
  assert.equal(second[0].argumentsDelta, '{"a":');
});

test('MmspStreamDecoder: tool_call.done 的完整参数不与分片重复', () => {
  const decoder = new MmspStreamDecoder('m');
  decoder.feed({
    event_type: 'delta',
    content_items: [{ type: 'tool_call.delta', name: 'w', arguments: '{"a":', tool_call_id: 'call_00_ET_ABC' }],
  });
  decoder.feed({
    event_type: 'delta',
    content_items: [{ type: 'tool_call.delta', name: '', arguments: '1}', tool_call_id: '' }],
  });
  const done = decoder.feed({
    event_type: 'delta',
    content_items: [{ type: 'tool_call.done', name: 'w', arguments: { a: 1 }, tool_call_id: 'call_00_ET_ABC' }],
  });
  // 只有 block-end，没有重复的参数 delta。
  assert.equal(done.length, 1);
  assert.equal(done[0].type, 'block-end');
  assert.equal(done[0].block.arguments, '{"a":1}');
  assert.equal(done[0].block.name, 'w');
});

test('MmspStreamDecoder: 没有分片时 tool_call.done 补发完整参数', () => {
  const decoder = new MmspStreamDecoder('m');
  const chunks = decoder.feed({
    event_type: 'delta',
    content_items: [{ type: 'tool_call.done', name: 'w', arguments: { a: 1 }, tool_call_id: 'call_00_ET_ABC' }],
  });
  assert.equal(chunks[1].type, 'tool-call-delta');
  assert.equal(chunks[1].argumentsDelta, '{"a":1}');
  assert.equal(chunks[2].type, 'block-end');
});

test('MmspStreamDecoder: 出现工具调用时结束原因是 tool-calls（尽管 relay 说 stop）', () => {
  const decoder = new MmspStreamDecoder('m');
  decoder.feed({
    event_type: 'delta',
    content_items: [{ type: 'tool_call.delta', name: 'w', arguments: '', tool_call_id: 'call_00_ET_ABC' }],
  });
  const chunks = decoder.feed({ event_type: 'stop', finish_reason: 'stop' });
  const finish = chunks[chunks.length - 1];
  assert.equal(finish.type, 'finish');
  assert.equal(finish.reason.kind, 'tool-calls');
});

test('MmspStreamDecoder: stop 事件产出 usage 再产出 finish（协议顺序）', () => {
  const decoder = new MmspStreamDecoder('m');
  const chunks = decoder.feed({
    event_type: 'stop',
    finish_reason: 'stop',
    usage_metadata: { prompt_tokens: 10, response_tokens: 5, cached_tokens: 0, thoughts_tokens: 0 },
  });
  const types = chunks.map((c) => c.type);
  assert.deepEqual(types, ['usage', 'finish']);
  assert.equal(chunks[0].usage.inputTokens, 10);
  assert.equal(chunks[0].usage.outputTokens, 5);
});

test('MmspStreamDecoder: finish_reason=length 映射成 max-tokens', () => {
  const decoder = new MmspStreamDecoder('m');
  const chunks = decoder.feed({ event_type: 'stop', finish_reason: 'length' });
  assert.equal(chunks[chunks.length - 1].reason.kind, 'max-tokens');
});

test('MmspStreamDecoder: stop 时闭合文本块', () => {
  const decoder = new MmspStreamDecoder('m');
  decoder.feed({ event_type: 'delta', content_items: [{ type: 'text.delta', text: 'hi' }] });
  const chunks = decoder.feed({ event_type: 'stop', finish_reason: 'stop' });
  assert.equal(chunks[0].type, 'block-end');
  assert.equal(chunks[0].block.text, 'hi');
});

test('MmspStreamDecoder: finalize 兜底收尾（上游没发 stop）', () => {
  const decoder = new MmspStreamDecoder('m');
  decoder.feed({ event_type: 'delta', content_items: [{ type: 'text.delta', text: 'hi' }] });
  const chunks = decoder.finalize();
  assert.equal(chunks[chunks.length - 1].type, 'finish');
  assert.equal(chunks.some((c) => c.type === 'block-end'), true);
});

test('MmspStreamDecoder: stop 之后不再产出内容', () => {
  const decoder = new MmspStreamDecoder('m');
  decoder.feed({ event_type: 'stop', finish_reason: 'stop' });
  assert.deepEqual(decoder.feed({ event_type: 'delta', content_items: [{ type: 'text.delta', text: 'late' }] }), []);
});
