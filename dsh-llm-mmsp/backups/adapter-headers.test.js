/**
 * MmspAdapter 自定义请求头与 BaseURL 动态配置的单元测试。
 *
 * @module dsh-llm-mmsp/adapter-headers.test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MmspAdapter, parseHeaders, DEFAULT_BASE_URL } from '../lib/mmsp-adapter.js';

test('parseHeaders: null / undefined / 空输入返回空对象', () => {
  assert.deepEqual(parseHeaders(null), {});
  assert.deepEqual(parseHeaders(undefined), {});
  assert.deepEqual(parseHeaders(''), {});
  assert.deepEqual(parseHeaders('   \n  \t '), {});
});

test('parseHeaders: 解析多行 Key: Value 文本', () => {
  const input = `
# 注释行应该被忽略
// 另外一种注释
X-Custom-Header: value123
CF-Access-Client-Id: client-id-abc
Authorization: Bearer secret-token
  Custom-Trim:   spaced-value  
EmptyVal:
`;
  const result = parseHeaders(input);
  assert.equal(result['X-Custom-Header'], 'value123');
  assert.equal(result['CF-Access-Client-Id'], 'client-id-abc');
  assert.equal(result['Authorization'], 'Bearer secret-token');
  assert.equal(result['Custom-Trim'], 'spaced-value');
  assert.equal(result['EmptyVal'], '');
});

test('parseHeaders: 处理带冒号的 Value（如 URL）', () => {
  const input = 'X-Callback: https://example.com/api?a=1:2';
  const result = parseHeaders(input);
  assert.equal(result['X-Callback'], 'https://example.com/api?a=1:2');
});

test('parseHeaders: 解析 JSON 文本格式', () => {
  const input = JSON.stringify({
    'X-Api-Key': 'key1',
    'X-Version': '2.0',
  });
  const result = parseHeaders(input);
  assert.equal(result['X-Api-Key'], 'key1');
  assert.equal(result['X-Version'], '2.0');
});

test('parseHeaders: 直接传入对象输入', () => {
  const input = {
    'X-Header-A': 'alpha',
    'X-Header-B': 42,
  };
  const result = parseHeaders(input);
  assert.equal(result['X-Header-A'], 'alpha');
  assert.equal(result['X-Header-B'], '42');
});

test('MmspAdapter baseURL: 动态 resolveBaseURL 热生效与尾随斜杠清理', () => {
  let current = 'https://go.penguin.ooo/';
  const adapter = new MmspAdapter({
    baseURL: current,
    resolveBaseURL: () => current,
  });

  assert.equal(adapter.baseURL, 'https://go.penguin.ooo');

  current = 'https://custom-proxy.internal:8080/prefix///';
  assert.equal(adapter.baseURL, 'https://custom-proxy.internal:8080/prefix');
});

test('MmspAdapter customHeaders: 动态 customHeaders 热生效', () => {
  let headersConfig = 'X-Header-1: one';
  const adapter = new MmspAdapter({
    baseURL: DEFAULT_BASE_URL,
    customHeaders: () => headersConfig,
  });

  assert.deepEqual(adapter.customHeaders(), { 'X-Header-1': 'one' });

  headersConfig = 'X-Header-2: two\nX-Header-3: three';
  assert.deepEqual(adapter.customHeaders(), {
    'X-Header-2': 'two',
    'X-Header-3': 'three',
  });
});
