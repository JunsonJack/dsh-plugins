/**
 * 端到端验证：多密钥轮询真的会换账号。
 *
 * ## 怎么证明「换」发生了
 *
 * 两个 key 都指向同一个上游，回复内容无法区分。所以这里**记录每个 key 被
 * 请求的次数**，而不是看回复：
 *
 * 1. 配两个 key，串行发 4 次请求；
 * 2. 用 `round-robin` 时，两个 key 应各被用 2 次；
 * 3. 用 `priority` 时，只用第一个（2 次全在第 1 个）。
 *
 * 另外验证「故障切换」：把一个 key 换成无效值，请求应改用另一个成功，
 * 且无效 key 进入冷却。
 *
 * @module dsh-llm-mmsp/tests/e2e-rotation
 */
import { readFileSync } from 'node:fs';
import { MmspKeyPool, normalizeKeys } from '../lib/key-pool.js';

const keys = JSON.parse(readFileSync('F:/traeWorkData/_tmp/mmsp-keys.json', 'utf8'));

/** 调一次上游，返回是否成功。 */
async function callUpstream(key, baseURL = 'https://go.penguin.ooo') {
  const body = {
    model: 'deepseek-flash',
    messages: [{ role: 'user', content_items: [{ type: 'text.done', text: 'hi' }] }],
    config: { max_tokens: 8 },
  };
  const response = await fetch(`${baseURL}/api/v1/stream`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      authorization: `Bearer ${key}`,
      'x-api-key': key,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text: text.slice(0, 120) };
}

/**
 * 模拟适配器的密钥选择：用真实的池 + 配置，看每次选到哪个 ref。
 *
 * @param {object} options - 选项。
 * @returns {Promise<{used: string[], results: object[]}>} 每次用的 ref 与结果。
 */
async function run(options) {
  const { refs, strategy, rounds, resolve } = options;
  const pool = new MmspKeyPool();
  const config = normalizeKeys(refs.map((ref) => ({ ref })));
  const used = [];
  const results = [];

  for (let index = 0; index < rounds; index += 1) {
    const plan = pool.plan(config, strategy);
    let picked;
    for (const ref of plan) {
      const value = await resolve(ref);
      if (value === undefined) continue;
      const result = await callUpstream(value);
      if (result.ok) {
        picked = ref;
        pool.recordSuccess(ref, config);
        results.push({ ref, ok: true });
        break;
      }
      if (result.status === 401 || result.status === 403 || result.status === 429) {
        pool.recordFailure(ref);
        results.push({ ref, ok: false, status: result.status });
        continue;
      }
      throw new Error(`意外失败 ${result.status}: ${result.text}`);
    }
    if (picked === undefined) throw new Error('这一轮没有可用密钥');
    used.push(picked);
  }
  return { used, results };
}

const resolveMap = {
  MMSP_API_KEY: keys[0],
  MMSP_API_KEY_2: keys[1],
  BAD_KEY: 'ep_bogus_' + 'x'.repeat(30),
};
const resolve = async (ref) => resolveMap[ref];

console.log('=== 1) 两个 key 单独都能用 ===');
for (const [ref, value] of Object.entries(resolveMap)) {
  if (ref === 'BAD_KEY') continue;
  const r = await callUpstream(value);
  console.log(`  ${ref}: ${r.ok ? '✅ 可用' : `❌ ${r.status}`}`);
}

console.log('\n=== 2) round-robin：4 次请求应各用 2 次 ===');
const rr = await run({
  refs: ['MMSP_API_KEY', 'MMSP_API_KEY_2'],
  strategy: 'round-robin',
  rounds: 4,
  resolve,
});
console.log('  每次用的 ref:', rr.used.join(' → '));
const tally = {};
for (const ref of rr.used) tally[ref] = (tally[ref] ?? 0) + 1;
console.log('  统计:', JSON.stringify(tally));
console.log('  两者都被用到:', Object.keys(tally).length === 2 ? '✅' : '❌');

console.log('\n=== 3) priority：4 次请求应全用第一个 ===');
const pr = await run({
  refs: ['MMSP_API_KEY', 'MMSP_API_KEY_2'],
  strategy: 'priority',
  rounds: 4,
  resolve,
});
console.log('  每次用的 ref:', pr.used.join(' → '));
console.log('  全用第一个:', pr.used.every((ref) => ref === 'MMSP_API_KEY') ? '✅' : '❌');

console.log('\n=== 4) 故障切换：第一个是坏 key，应改用第二个 ===');
const fo = await run({
  refs: ['BAD_KEY', 'MMSP_API_KEY_2'],
  strategy: 'priority',
  rounds: 2,
  resolve,
});
console.log('  每次用的 ref:', fo.used.join(' → '));
console.log('  全部落到第二个:', fo.used.every((ref) => ref === 'MMSP_API_KEY_2') ? '✅' : '❌');
console.log('  坏 key 被记录失败:', fo.results.some((r) => r.ref === 'BAD_KEY' && r.ok === false) ? '✅' : '❌');

console.log('\n=== 5) 冷却生效后跳过坏 key ===');
const coolPool = new MmspKeyPool();
const coolConfig = normalizeKeys([{ ref: 'BAD_KEY' }, { ref: 'MMSP_API_KEY_2' }]);
coolPool.recordFailure('BAD_KEY');
console.log('  plan 结果:', coolPool.plan(coolConfig, 'priority').join(', '));
console.log('  跳过坏 key:', !coolPool.plan(coolConfig, 'priority').includes('BAD_KEY') ? '✅' : '❌');
