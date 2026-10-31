/**
 * `key-pool.js` 的单元测试。
 *
 * 这一层是纯逻辑（排序 / 轮询 / 冷却），不碰网络也不碰 DSH，所以能直接测。
 * 适配器那层的「失败切换」靠这些语义，这里把语义钉死。
 *
 * @module dsh-llm-mmsp/tests/key-pool.test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_COOLDOWN_MS,
  MmspKeyPool,
  isKeyFault,
  normalizeKeys,
} from '../lib/key-pool.js';

/** 造一份可注入时间的时钟。 */
function fakeClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => { current += ms; },
  };
}

test('normalizeKeys: 保留顺序，这就是优先级', () => {
  const keys = normalizeKeys([{ ref: 'C' }, { ref: 'A' }, { ref: 'B' }]);
  assert.deepEqual(keys.map((entry) => entry.ref), ['C', 'A', 'B']);
});

test('normalizeKeys: enabled 省略视为启用', () => {
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B', enabled: false }]);
  assert.deepEqual(keys, [
    { ref: 'A', enabled: true },
    { ref: 'B', enabled: false },
  ]);
});

test('normalizeKeys: 脏数据被跳过而不是抛错', () => {
  const keys = normalizeKeys([
    null,
    'string',
    42,
    { ref: '' },
    { ref: '   ' },
    { ref: 123 },
    { ref: 'OK' },
  ]);
  assert.deepEqual(keys, [{ ref: 'OK', enabled: true }]);
});

test('normalizeKeys: 非数组退化成空', () => {
  assert.deepEqual(normalizeKeys(undefined), []);
  assert.deepEqual(normalizeKeys(null), []);
  assert.deepEqual(normalizeKeys({}), []);
  assert.deepEqual(normalizeKeys('A,B'), []);
});

test('normalizeKeys: 同名重复只保留第一次（防拖拽产生重复行）', () => {
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B' }, { ref: 'A' }]);
  assert.deepEqual(keys.map((entry) => entry.ref), ['A', 'B']);
});

test('normalizeKeys: 前后空白被裁掉', () => {
  assert.deepEqual(normalizeKeys([{ ref: '  A  ' }]), [{ ref: 'A', enabled: true }]);
});

test('plan: priority 策略永远从头开始', () => {
  const pool = new MmspKeyPool({ now: () => 0 });
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B' }, { ref: 'C' }]);
  assert.deepEqual(pool.plan(keys, 'priority'), ['A', 'B', 'C']);
  // 记录成功也不改变 priority 的顺序。
  pool.recordSuccess('A', keys);
  assert.deepEqual(pool.plan(keys, 'priority'), ['A', 'B', 'C']);
});

test('plan: round-robin 从游标位置开始绕一圈', () => {
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B' }, { ref: 'C' }]);
  const pool = new MmspKeyPool({ now: () => 0 });

  // 初始游标 0 → A 开头。
  assert.deepEqual(pool.plan(keys, 'round-robin'), ['A', 'B', 'C']);

  // A 成功后游标移到 1 → B 开头。
  pool.recordSuccess('A', keys);
  assert.deepEqual(pool.plan(keys, 'round-robin'), ['B', 'C', 'A']);

  // B 成功后游标移到 2 → C 开头。
  pool.recordSuccess('B', keys);
  assert.deepEqual(pool.plan(keys, 'round-robin'), ['C', 'A', 'B']);

  // C 成功后游标回到 0 → A 开头（转完一圈）。
  pool.recordSuccess('C', keys);
  assert.deepEqual(pool.plan(keys, 'round-robin'), ['A', 'B', 'C']);
});

test('plan: enabled:false 不参与轮询', () => {
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B', enabled: false }, { ref: 'C' }]);
  const pool = new MmspKeyPool({ now: () => 0 });
  assert.deepEqual(pool.plan(keys, 'round-robin'), ['A', 'C']);
});

test('plan: 冷却中的密钥被跳过', () => {
  const clock = fakeClock();
  const pool = new MmspKeyPool({ now: clock.now });
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B' }, { ref: 'C' }]);

  pool.recordFailure('A');
  assert.equal(pool.isCooling('A'), true);
  assert.deepEqual(pool.plan(keys, 'round-robin'), ['B', 'C']);
});

test('plan: 冷却到期后自动复活', () => {
  const clock = fakeClock();
  const pool = new MmspKeyPool({ now: clock.now });
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B' }]);

  pool.recordFailure('A');
  assert.deepEqual(pool.plan(keys, 'round-robin'), ['B']);

  // 差 1 毫秒还在冷却。
  clock.advance(DEFAULT_COOLDOWN_MS - 1);
  assert.equal(pool.isCooling('A'), true);

  // 到点复活。
  clock.advance(1);
  assert.equal(pool.isCooling('A'), false);
  assert.deepEqual(pool.plan(keys, 'round-robin'), ['A', 'B']);
});

test('plan: 全部冷却时返回空（调用方决定降级策略）', () => {
  const clock = fakeClock();
  const pool = new MmspKeyPool({ now: clock.now });
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B' }]);

  pool.recordFailure('A');
  pool.recordFailure('B');
  assert.deepEqual(pool.plan(keys, 'round-robin'), []);
});

test('plan: 空列表返回空', () => {
  const pool = new MmspKeyPool({ now: () => 0 });
  assert.deepEqual(pool.plan([], 'round-robin'), []);
});

test('recordSuccess 清掉该密钥的冷却', () => {
  const clock = fakeClock();
  const pool = new MmspKeyPool({ now: clock.now });
  const keys = normalizeKeys([{ ref: 'A' }]);

  pool.recordFailure('A');
  assert.equal(pool.isCooling('A'), true);

  pool.recordSuccess('A', keys);
  assert.equal(pool.isCooling('A'), false);
});

test('recordSuccess 对不在列表里的 ref 不炸，游标归零', () => {
  const pool = new MmspKeyPool({ now: () => 0 });
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B' }]);
  pool.recordSuccess('不存在', keys);
  assert.deepEqual(pool.plan(keys, 'round-robin'), ['A', 'B']);
});

test('reset 清空游标与冷却', () => {
  const clock = fakeClock();
  const pool = new MmspKeyPool({ now: clock.now });
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B' }]);

  pool.recordSuccess('A', keys);
  pool.recordFailure('B');
  pool.reset();

  assert.equal(pool.isCooling('B'), false);
  assert.deepEqual(pool.plan(keys, 'round-robin'), ['A', 'B']);
});

test('冷却时长可配置', () => {
  const clock = fakeClock();
  const pool = new MmspKeyPool({ now: clock.now, cooldownMs: 5_000 });
  pool.recordFailure('A');

  clock.advance(4_999);
  assert.equal(pool.isCooling('A'), true);
  clock.advance(1);
  assert.equal(pool.isCooling('A'), false);
});

test('isKeyFault: 只有 AUTH 与 RATE_LIMIT 归咎于密钥', () => {
  assert.equal(isKeyFault('AUTH'), true);
  assert.equal(isKeyFault('RATE_LIMIT'), true);

  // 这些换密钥也没用，交给 harness 的重试策略。
  assert.equal(isKeyFault('BAD_REQUEST'), false);
  assert.equal(isKeyFault('TRANSPORT'), false);
  assert.equal(isKeyFault('SERVER'), false);
  assert.equal(isKeyFault('INVALID_CREDENTIAL'), false);
  assert.equal(isKeyFault(undefined), false);
});

// ── 可观测状态（界面靠它验证「到底切了没」）────────────────────────────

test('snapshot: 初始状态各计数为 0，next 指向第一条', () => {
  const pool = new MmspKeyPool({ now: () => 0 });
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B' }]);
  const snap = pool.snapshot(keys);

  assert.deepEqual(snap.entries, [
    { ref: 'A', enabled: true, coolingMs: 0, successes: 0 },
    { ref: 'B', enabled: true, coolingMs: 0, successes: 0 },
  ]);
  assert.equal(snap.next, 'A');
  assert.equal(snap.lastUsed, undefined);
  assert.equal(snap.total, 0);
});

test('snapshot: 记录成功后，计数与 lastUsed 反映出来', () => {
  const pool = new MmspKeyPool({ now: () => 1_000 });
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B' }]);

  pool.recordSuccess('A', keys);
  const snap = pool.snapshot(keys);

  assert.equal(snap.entries[0].successes, 1);
  assert.equal(snap.entries[1].successes, 0);
  assert.equal(snap.lastUsed, 'A');
  assert.equal(snap.lastUsedAt, 1_000);
  // A 成功后游标移到 B。
  assert.equal(snap.next, 'B');
  assert.equal(snap.total, 1);
});

test('snapshot: 轮询两轮后两条计数相同 —— 这是「真的在切」的证据', () => {
  const pool = new MmspKeyPool({ now: () => 0 });
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B' }]);

  for (const ref of ['A', 'B', 'A', 'B']) pool.recordSuccess(ref, keys);
  const snap = pool.snapshot(keys);

  assert.equal(snap.entries[0].successes, 2);
  assert.equal(snap.entries[1].successes, 2);
  assert.equal(snap.total, 4);
});

test('snapshot: 冷却中的密钥带剩余毫秒，且 next 跳过它', () => {
  const clock = fakeClock();
  const pool = new MmspKeyPool({ now: clock.now });
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B' }]);

  pool.recordFailure('A');
  const snap = pool.snapshot(keys);

  assert.equal(snap.entries[0].coolingMs, DEFAULT_COOLDOWN_MS);
  assert.equal(snap.entries[1].coolingMs, 0);
  assert.equal(snap.next, 'B', 'next 应跳过冷却中的 A');

  clock.advance(1_000);
  assert.equal(pool.snapshot(keys).entries[0].coolingMs, DEFAULT_COOLDOWN_MS - 1_000);
});

test('snapshot: 停用的密钥不进 next，但仍在列表里', () => {
  const pool = new MmspKeyPool({ now: () => 0 });
  const keys = normalizeKeys([{ ref: 'A', enabled: false }, { ref: 'B' }]);
  const snap = pool.snapshot(keys);

  assert.equal(snap.entries.length, 2);
  assert.equal(snap.entries[0].enabled, false);
  assert.equal(snap.next, 'B');
});

test('snapshot: 全部不可用时 next 为 undefined', () => {
  const pool = new MmspKeyPool({ now: () => 0 });
  const keys = normalizeKeys([{ ref: 'A' }, { ref: 'B' }]);
  pool.recordFailure('A');
  pool.recordFailure('B');
  assert.equal(pool.snapshot(keys).next, undefined);
});

test('reset 也清掉使用统计', () => {
  const pool = new MmspKeyPool({ now: () => 0 });
  const keys = normalizeKeys([{ ref: 'A' }]);
  pool.recordSuccess('A', keys);
  pool.reset();
  const snap = pool.snapshot(keys);
  assert.equal(snap.entries[0].successes, 0);
  assert.equal(snap.lastUsed, undefined);
  assert.equal(snap.total, 0);
});
