import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 必须在 import 插件前设好，否则会读到用户真实的 ~/.dsh/notebook-grid
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-grid-'))
process.env.DSH_NOTEBOOK_GRID_CONFIG_DIR = sandbox

const { apply, sanitizePatch } = await import('../lib/index.js')

const CONFIG_FILE = path.join(sandbox, 'config.json')
const readDisk = () => (fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : null)
const resetDisk = () => fs.rmSync(CONFIG_FILE, { force: true })

/** 用一个真 HTTP 服务承载插件的 handler，这样 remoteAddress / Host / localPort 都是真的。 */
async function mount() {
  // 每个用例从干净状态起跑：配置是模块级 + 落盘的，留着上一条会污染断言。
  resetDisk()
  let handler
  let disposed = false
  const ctx = {
    effect(fn) {
      const off = fn()
      return () => {
        disposed = true
        off?.()
      }
    },
    webServer: {
      register(route) {
        handler = route.handler
        return () => {
          handler = undefined
        }
      },
    },
  }
  apply(ctx, {})
  const server = http.createServer((req, res) => handler(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    port,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
    disposed: () => disposed,
  }
}

function request(port, { path: p = '/_plugins/notebook-grid/config', method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json
        try {
          json = text ? JSON.parse(text) : undefined
        } catch {
          json = undefined
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json })
      })
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

test('sanitizePatch：未知键一律丢弃', () => {
  const out = sanitizePatch({ enabled: false, evil: 'x', __proto__: { polluted: true }, style: 'dots' })
  assert.deepEqual(out, { enabled: false, style: 'dots' })
  assert.equal({}.polluted, undefined)
})

test('sanitizePatch：类型与范围校验', () => {
  assert.deepEqual(sanitizePatch({ style: 'zigzag' }), {})
  assert.deepEqual(sanitizePatch({ palette: 'neon' }), {})
  assert.deepEqual(sanitizePatch({ size: 4 }), {})
  assert.deepEqual(sanitizePatch({ size: 999 }), {})
  assert.deepEqual(sanitizePatch({ size: '24' }), {})
  assert.deepEqual(sanitizePatch({ size: 24.6 }), { size: 25 })
  assert.deepEqual(sanitizePatch({ opacity: 0.08 }), { opacity: 0.08 })
  assert.deepEqual(sanitizePatch({ alphaScale: 9 }), {})
  assert.deepEqual(sanitizePatch({ alphaScale: 1.4 }), { alphaScale: 1.4 })
  assert.deepEqual(sanitizePatch(null), {})
  assert.deepEqual(sanitizePatch([1, 2]), {})
})

test('sanitizePatch：自定义配色按形状裁剪，半套/坏值整档丢弃', () => {
  const ok = sanitizePatch({
    custom: {
      light: { bg: '#fafafa', ink: '#123456', alpha: 0.07, inkFor: { dots: '#000000', evil: '#ffffff' } },
      dark: { bg: 'not-a-color', ink: '#ffffff' },
    },
  })
  assert.deepEqual(ok.custom, {
    light: { bg: '#fafafa', ink: '#123456', alpha: 0.07, inkFor: { dots: '#000000' } },
    dark: { ink: '#ffffff' },
  })
  assert.deepEqual(sanitizePatch({ custom: { light: { bg: 'red' } } }), {})
  assert.deepEqual(sanitizePatch({ custom: 'nope' }), {})
  const badAlpha = sanitizePatch({ custom: { light: { bg: '#fff', alpha: 5 } } })
  assert.deepEqual(badAlpha.custom, { light: { bg: '#fff' } })
})

test('sanitizePatch：每纹理尺寸只留四种纹理', () => {
  const out = sanitizePatch({ sizeOverride: { grid: 30, dots: 20, lines: 'x', nope: 12 } })
  assert.deepEqual(out.sizeOverride, { grid: 30, dots: 20 })
})

test('sanitizePatch：原型链上的同名属性不会被当成输入', () => {
  const payload = JSON.parse('{"sizeOverride":{"__proto__":{"grid":30}},"style":"grid"}')
  assert.deepEqual(sanitizePatch(payload), { style: 'grid' })
})

test('GET：返回配置，且绝不回 `*` 的 CORS 头', async () => {
  const s = await mount()
  try {
    const r = await request(s.port, { headers: { Origin: 'https://evil.example' } })
    assert.equal(r.status, 403)
    assert.equal(r.headers['access-control-allow-origin'], undefined)

    const local = await request(s.port)
    assert.equal(local.status, 200)
    assert.equal(local.json.enabled, true)
    assert.equal(local.json.style, 'grid')
    assert.notEqual(local.headers['access-control-allow-origin'], '*')
    assert.equal(local.headers['cache-control'], 'no-store')
    assert.equal(local.headers['x-content-type-options'], 'nosniff')
  } finally {
    await s.close()
  }
})

test('跨站 POST 被拒且不写盘', async () => {
  const s = await mount()
  try {
    const r = await request(s.port, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, style: 'lines' }),
    })
    assert.equal(r.status, 403)
    assert.equal(readDisk(), null)
  } finally {
    await s.close()
  }
})

test('sec-fetch-site: cross-site 即使没有 Origin 也被拒', async () => {
  const s = await mount()
  try {
    const r = await request(s.port, {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site', 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })
    assert.equal(r.status, 403)
    assert.equal(readDisk(), null)
  } finally {
    await s.close()
  }
})

test('同源 POST 成功并落盘，未知键不入库', async () => {
  const s = await mount()
  try {
    const r = await request(s.port, {
      method: 'POST',
      headers: { Origin: s.base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ style: 'dots', palette: 'navy', alphaScale: 1.3, injected: 'pwn' }),
    })
    assert.equal(r.status, 200)
    assert.equal(r.json.success, true)
    assert.equal(r.json.config.style, 'dots')
    assert.equal(r.headers['access-control-allow-origin'], s.base)
    const disk = readDisk()
    assert.equal(disk.style, 'dots')
    assert.equal(disk.palette, 'navy')
    assert.equal(disk.injected, undefined)
  } finally {
    await s.close()
  }
})

test('没有 Origin 的本机请求（桌面端转发形态）按 Host/端口判定通过', async () => {
  const s = await mount()
  try {
    const r = await request(s.port, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style: 'lines' }),
    })
    assert.equal(r.status, 200)
    assert.equal(readDisk().style, 'lines')
  } finally {
    await s.close()
  }
})

test('端口不匹配的 Host 被拒（DNS rebinding 形态）', async () => {
  const s = await mount()
  try {
    const r = await request(s.port, {
      path: '/_plugins/notebook-grid/config',
      headers: { Host: 'localhost:1' },
    })
    assert.equal(r.status, 403)
  } finally {
    await s.close()
  }
})

test('本机 dev server 跨端口（vite 代理）的 Origin 被接受', async () => {
  const s = await mount()
  try {
    const r = await request(s.port, {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
      body: JSON.stringify({ style: 'engineering' }),
    })
    assert.equal(r.status, 200)
    assert.equal(r.headers['access-control-allow-origin'], 'http://localhost:5173')
    assert.equal(readDisk().style, 'engineering')
  } finally {
    await s.close()
  }
})

test('非 loopback 的 Origin 一律被拒（含 localhost 仿冒域名）', async () => {
  const s = await mount()
  try {
    for (const origin of ['https://evil.example', 'https://localhost.evil.example', 'http://127.0.0.1.nip.io']) {
      const r = await request(s.port, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })
      assert.equal(r.status, 403, origin + ' 应被拒')
      assert.equal(r.headers['access-control-allow-origin'], undefined, origin + ' 不应回显 CORS')
    }
    assert.equal(readDisk(), null)
  } finally {
    await s.close()
  }
})

test('错误的 content-type 返回 415', async () => {
  const s = await mount()
  try {
    const r = await request(s.port, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ enabled: false }),
    })
    assert.equal(r.status, 415)
    assert.equal(readDisk(), null)
  } finally {
    await s.close()
  }
})

test('超大请求体返回 413 且不落盘', async () => {
  const s = await mount()
  try {
    const r = await request(s.port, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(64 * 1024) },
      body: 'x'.repeat(64 * 1024),
    })
    assert.equal(r.status, 413)
    assert.equal(readDisk(), null)
  } finally {
    await s.close()
  }
})

test('非法 JSON 返回 400，全部非法键也返回 400', async () => {
  const s = await mount()
  try {
    const bad = await request(s.port, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{oops',
    })
    assert.equal(bad.status, 400)

    const none = await request(s.port, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nope: 1, style: 'zzz' }),
    })
    assert.equal(none.status, 400)
    assert.equal(readDisk(), null)
  } finally {
    await s.close()
  }
})

test('HEAD 返回无响应体，OPTIONS 只对本机回 204', async () => {
  const s = await mount()
  try {
    const head = await request(s.port, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(head.text, '')

    const opt = await request(s.port, { method: 'OPTIONS' })
    assert.equal(opt.status, 204)
    assert.equal(opt.headers['access-control-allow-methods'], 'GET, HEAD, POST, OPTIONS')
    assert.notEqual(opt.headers['access-control-allow-origin'], '*')

    const cross = await request(s.port, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })
    assert.equal(cross.status, 403)
  } finally {
    await s.close()
  }
})

test('不支持的方法返回 405 并带 Allow', async () => {
  const s = await mount()
  try {
    const r = await request(s.port, { method: 'DELETE' })
    assert.equal(r.status, 405)
    assert.equal(r.headers.allow, 'GET, HEAD, POST, OPTIONS')
  } finally {
    await s.close()
  }
})
