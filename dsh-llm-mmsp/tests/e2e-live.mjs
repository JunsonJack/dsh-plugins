/**
 * 脱离 DSH 进程的端到端验证。
 *
 * ## 为什么要有这个
 *
 * 适配器 import 了 `@deepseek-ai/dsh-llm`（`LlmAdapter` / `LlmError` / …），
 * 而那些包只存在于 DSH 安装目录里，普通 node 解析不到。这个脚本用
 * `node --experimental-loader` 的模块替身（见 `stubs/`）把那几个符号换成本地
 * 最小实现，于是**适配器的真实代码**（请求组装、SSE 读取、chunk 解码）可以
 * 直接打到真实的 go.penguin.ooo 上跑。
 *
 * 这比"另写一份 Python 脚本模拟"强得多：跑的就是要装进 DSH 的那份代码。
 *
 * ## 用法
 *
 * ```
 * node --import ./tests/stubs/register.mjs tests/e2e-live.mjs
 * ```
 *
 * 环境变量 `MMSP_API_KEY` 提供密钥；不提供则脚本会从 9router 的库里读一个
 * penguin 连接（仅本机开发用）。
 *
 * @module dsh-llm-mmsp/e2e-live
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MmspAdapter } from '../lib/mmsp-adapter.js';

/**
 * 取密钥：环境变量优先，否则读 9router 的库。
 *
 * @returns {Promise<string>} 密钥。
 */
async function resolveKey() {
  const fromEnv = process.env.MMSP_API_KEY;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  const { loadPenguinKey } = await import('./stubs/penguin-key.mjs');
  return loadPenguinKey();
}

/**
 * 把 chunk 流折叠成一段可读的结果。
 *
 * @param {AsyncIterable<import('@deepseek-ai/dsh-llm').StreamChunk>} stream - chunk 流。
 * @returns {Promise<{text: string, reasoning: string, tools: unknown[], usage: unknown, finish: unknown}>} 折叠结果。
 */
async function collect(stream) {
  let text = '';
  let reasoning = '';
  /** @type {unknown[]} */
  const tools = [];
  let usage;
  let finish;
  for await (const chunk of stream) {
    switch (chunk.type) {
      case 'text-delta':
        text += chunk.text;
        break;
      case 'reasoning-delta':
        reasoning += chunk.text;
        break;
      case 'block-end':
        if (chunk.block?.type === 'tool-call') tools.push(chunk.block);
        break;
      case 'usage':
        usage = chunk.usage;
        break;
      case 'finish':
        finish = chunk.reason;
        break;
      default:
        break;
    }
  }
  return { text, reasoning, tools, usage, finish };
}

/**
 * 跑一组用例并汇报。
 *
 * @param {string} title - 用例名。
 * @param {() => Promise<unknown>} run - 用例体。
 * @returns {Promise<boolean>} 是否通过。
 */
async function caseOf(title, run) {
  try {
    const detail = await run();
    console.log(`  ✅ ${title}${detail === undefined ? '' : ` — ${detail}`}`);
    return true;
  } catch (error) {
    console.log(`  ❌ ${title} — ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * 主流程。
 *
 * @returns {Promise<void>} 结束。
 */
async function main() {
  const apiKey = await resolveKey();
  const adapter = new MmspAdapter({
    baseURL: 'https://go.penguin.ooo',
    resolveApiKey: async () => apiKey,
  });

  console.log('\n=== MMSP 适配器端到端验证（真实上游 go.penguin.ooo）===\n');

  let passed = 0;
  let total = 0;

  // 1) 模型目录
  total += 1;
  passed += await caseOf('模型目录（GET /api/v1/models）', async () => {
    const models = await adapter.listModels('mmsp');
    if (models.length === 0) throw new Error('目录为空');
    return `${models.length} 个模型：${models.slice(0, 4).map((m) => m.id).join(', ')}…`;
  }) ? 1 : 0;

  // 2) 简单文本
  total += 1;
  passed += await caseOf('简单文本（流式）', async () => {
    const result = await collect(adapter.stream({
      provider: 'mmsp',
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly: HELLO WORLD' }] }],
      maxTokens: 64,
      system: 'You answer with the requested text only.',
    }));
    if (result.text.trim().length === 0) throw new Error('没有文本输出');
    return `text=${JSON.stringify(result.text.trim().slice(0, 40))} finish=${result.finish?.kind}`;
  }) ? 1 : 0;

  // 3) system 提示词
  total += 1;
  passed += await caseOf('system 提示词生效', async () => {
    const result = await collect(adapter.stream({
      provider: 'mmsp',
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'What is your name?' }] }],
      system: 'Your name is Ada. When asked, reply with exactly: Ada',
      maxTokens: 64,
    }));
    if (!result.text.toLowerCase().includes('ada')) {
      throw new Error(`回答里没有 Ada：${JSON.stringify(result.text.slice(0, 80))}`);
    }
    return `text=${JSON.stringify(result.text.trim().slice(0, 40))}`;
  }) ? 1 : 0;

  // 4) 思考（reasoning 块）
  total += 1;
  passed += await caseOf('推理档位 medium 产出 reasoning 块', async () => {
    const result = await collect(adapter.stream({
      provider: 'mmsp',
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'What is 17*23? Think it through.' }] }],
      reasoningEffort: 'medium',
      maxTokens: 512,
    }));
    if (result.reasoning.length === 0) throw new Error('没有 reasoning 输出');
    return `reasoning=${result.reasoning.length} 字符, text=${JSON.stringify(result.text.trim().slice(0, 30))}`;
  }) ? 1 : 0;

  // 5) 工具调用
  total += 1;
  passed += await caseOf('工具调用（stop_reason=tool-calls）', async () => {
    const result = await collect(adapter.stream({
      provider: 'mmsp',
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'What is the weather in Paris? Use the get_weather tool.' }] }],
      tools: [{
        name: 'get_weather',
        description: 'Get the current weather for a city.',
        parameters: {
          type: 'object',
          properties: { location: { type: 'string' } },
          required: ['location'],
        },
      }],
      maxTokens: 512,
    }));
    if (result.tools.length === 0) throw new Error('没有工具调用');
    const tool = result.tools[0];
    if (tool.name !== 'get_weather') throw new Error(`工具名不对：${tool.name}`);
    const args = JSON.parse(tool.arguments);
    if (args.location !== 'Paris') throw new Error(`参数不对：${tool.arguments}`);
    if (result.finish?.kind !== 'tool-calls') throw new Error(`结束原因不对：${result.finish?.kind}`);
    return `tool=${tool.name}(${tool.arguments}) id=${String(tool.id).slice(0, 16)}…`;
  }) ? 1 : 0;

  // 6) 工具结果回灌（id 归一化后的往返）
  total += 1;
  passed += await caseOf('工具结果回灌（多轮工具链）', async () => {
    const tools = [{
      name: 'get_weather',
      description: 'Get the current weather for a city.',
      parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] },
    }];
    const first = await collect(adapter.stream({
      provider: 'mmsp',
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'What is the weather in Paris? Use the tool.' }] }],
      tools,
      maxTokens: 512,
    }));
    if (first.tools.length === 0) throw new Error('第一轮没有工具调用');
    const call = first.tools[0];
    // 用**归一化后**的 id 回灌——这正是 harness 的行为。
    const second = await collect(adapter.stream({
      provider: 'mmsp',
      model: 'deepseek-flash',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'What is the weather in Paris? Use the tool.' }] },
        { role: 'assistant', content: [{ type: 'tool-call', id: call.id, name: call.name, arguments: call.arguments }] },
        { role: 'tool', toolCallId: call.id, content: [{ type: 'text', text: 'sunny, 21C' }] },
        { role: 'user', content: [{ type: 'text', text: 'Summarize it.' }] },
      ],
      tools,
      maxTokens: 512,
    }));
    if (second.text.trim().length === 0) throw new Error('第二轮没有文本');
    return `text=${JSON.stringify(second.text.trim().slice(0, 60))}`;
  }) ? 1 : 0;

  // 7) usage
  total += 1;
  passed += await caseOf('token 用量上报', async () => {
    const result = await collect(adapter.stream({
      provider: 'mmsp',
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      maxTokens: 32,
    }));
    if (!result.usage) throw new Error('没有 usage chunk');
    if (!(result.usage.inputTokens > 0)) throw new Error(`inputTokens=${result.usage.inputTokens}`);
    return `in=${result.usage.inputTokens} out=${result.usage.outputTokens}`;
  }) ? 1 : 0;

  // 8) 缺密钥
  total += 1;
  passed += await caseOf('缺密钥时报 MISSING_CREDENTIAL', async () => {
    const bare = new MmspAdapter({ baseURL: 'https://go.penguin.ooo', resolveApiKey: async () => undefined });
    try {
      await collect(bare.stream({
        provider: 'mmsp', model: 'deepseek-flash',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      }));
    } catch (error) {
      if (error?.code === 'MISSING_CREDENTIAL') return '按预期拒绝';
      throw error;
    }
    throw new Error('没有抛错');
  }) ? 1 : 0;

  console.log(`\n=== ${passed}/${total} 通过 ===\n`);
  if (passed !== total) process.exitCode = 1;
}

await main();
