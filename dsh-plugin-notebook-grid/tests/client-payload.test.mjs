import test from 'node:test'
import assert from 'node:assert/strict'

const { sanitizePatch } = await import('../lib/index.js')

// lib/client.js 的 persist() 实际发出去的 body 形状（含 DEFAULT_CUSTOM 的两个分支）
const clientPayload = {
  enabled: true,
  style: 'dots',
  palette: 'custom',
  custom: {
    light: {
      bg: '#f8fafc',
      ink: '#2563eb',
      alpha: 0.08,
      inkFor: { dots: '#0f172a' },
      alphaFor: { dots: 0.13, lines: 0.09 },
    },
    dark: { bg: '#0b0f17', ink: '#ffffff', alpha: 0.055, alphaFor: { dots: 0.09, lines: 0.065 } },
  },
  alphaScale: 1.2,
  sizeOverride: { grid: 32, engineering: 22, dots: 18, lines: 28 },
  size: 24,
  opacity: 0.08,
}

test('客户端真实 payload 一字不丢地被接受', () => {
  const out = sanitizePatch(clientPayload)
  assert.deepEqual(out.custom, clientPayload.custom)
  assert.deepEqual(out.sizeOverride, clientPayload.sizeOverride)
  assert.equal(out.palette, 'custom')
  assert.equal(out.alphaScale, 1.2)
  assert.equal(out.style, 'dots')
  assert.equal(out.enabled, true)
})

test('cordis.patch.yml 那份 config 也能过', () => {
  assert.deepEqual(sanitizePatch({ enabled: true, style: 'grid', size: 24, opacity: 0.08 }), {
    enabled: true,
    style: 'grid',
    size: 24,
    opacity: 0.08,
  })
})

test('九档预设色板 id 全部被接受', () => {
  for (const id of ['classic', 'warm', 'pure', 'mint', 'graphite', 'ocean', 'sky', 'ice', 'navy', 'custom']) {
    assert.equal(sanitizePatch({ palette: id }).palette, id, id + ' 应被接受')
  }
})
