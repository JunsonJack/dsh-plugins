import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const name = 'dsh-plugin-notebook-grid';
export const inject = ['webServer'];

// 允许用环境变量把落盘位置挪走（测试与多实例调试用），默认仍是 ~/.dsh/notebook-grid。
function configFiles() {
  const dir = process.env.DSH_NOTEBOOK_GRID_CONFIG_DIR || join(homedir(), '.dsh', 'notebook-grid');
  return { dir, file: join(dir, 'config.json') };
}

const CONFIG_PATH = '/_plugins/notebook-grid/config';
const MAX_BODY_BYTES = 16 * 1024;

const DEFAULT_CONFIG = {
  enabled: true,
  style: 'grid',       // 'grid' | 'engineering' | 'dots' | 'lines'
  size: 24,            // px
  opacity: 0.08        // 0.02 - 0.3
};

const STYLES = ['grid', 'engineering', 'dots', 'lines'];
const PALETTES = ['classic', 'warm', 'pure', 'mint', 'graphite', 'ocean', 'sky', 'ice', 'navy', 'custom'];
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * 本机请求判定。与 dsh-task-panel/server/file-clipboard.js 的 localRequest 同构：
 * 只接受 loopback 来源，且拒绝 cross-site 与任何非本机 Origin。
 *
 * 保留 dsh-app://app 例外：桌面端主进程转发请求时会剥掉 Origin/Sec-Fetch-Site，
 * 直接打到本机回环端口，此时用 Host 与本地端口是否一致来判定。
 *
 * Origin 判定放宽到「hostname 是 loopback」而不要求端口与 Host 完全一致：
 * 开发模式下客户端可能由 vite 等本地 dev server 提供（端口不同、请求经代理
 * 转发），严格比对端口会把正常保存挡掉；而远程网页的 Origin 永远不是
 * loopback，仍然被拒。防 DNS rebinding 由无 Origin 分支的 directHost 负责。
 */
function localRequest(req) {
  const address = req.socket?.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return false;
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers?.origin;
  if (origin === 'dsh-app://app') return true;
  if (!origin) return req.headers?.['sec-fetch-site'] === 'same-origin' || directHost(req);
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol)
      && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function directHost(req) {
  const port = req.socket?.localPort;
  if (!Number.isInteger(port)) return false;
  try {
    const url = new URL(`http://${req.headers?.host}`);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && Number(url.port) === port;
  } catch {
    return false;
  }
}

function finiteNumber(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** 一层深度的映射过滤：只保留 allowedKeys 中的键，值必须通过 check。 */
function pickMap(value, allowedKeys, check) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = {};
  for (const key of allowedKeys) {
    // hasOwn 而不是 `in`：后者会把原型链上的同名属性也算进来。
    if (!Object.hasOwn(value, key)) continue;
    const item = value[key];
    if (!check(item)) continue;
    out[key] = item;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const isHex = (v) => typeof v === 'string' && HEX.test(v);
const isAlpha = (v) => finiteNumber(v, 0, 1);

/**
 * 自定义配色的形状与 lib/client.js 的 DEFAULT_CUSTOM 一致：
 *   { light: { bg, ink, alpha, inkFor: { <style>: hex }, alphaFor: { <style>: number } }, dark: {...} }
 * 任何一档不合法就整档丢弃，避免半套颜色导致亮暗错配。
 */
function sanitizeCustom(value) {
  const clean = (side) => {
    if (!side || typeof side !== 'object' || Array.isArray(side)) return undefined;
    const out = {};
    if (isHex(side.bg)) out.bg = side.bg;
    if (isHex(side.ink)) out.ink = side.ink;
    if (isAlpha(side.alpha)) out.alpha = side.alpha;
    const inkFor = pickMap(side.inkFor, STYLES, isHex);
    if (inkFor) out.inkFor = inkFor;
    const alphaFor = pickMap(side.alphaFor, STYLES, isAlpha);
    if (alphaFor) out.alphaFor = alphaFor;
    return Object.keys(out).length > 0 ? out : undefined;
  };
  const light = clean(value?.light);
  const dark = clean(value?.dark);
  if (!light && !dark) return undefined;
  return { ...(light ? { light } : {}), ...(dark ? { dark } : {}) };
}

/**
 * 请求体 → 配置补丁。未知键直接丢弃，已知键做类型与范围校验，
 * 防止任意网页把垃圾写进 ~/.dsh/notebook-grid/config.json。
 */
export function sanitizePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const patch = {};
  if (typeof input.enabled === 'boolean') patch.enabled = input.enabled;
  if (typeof input.style === 'string' && STYLES.includes(input.style)) patch.style = input.style;
  if (typeof input.palette === 'string' && PALETTES.includes(input.palette)) patch.palette = input.palette;
  if (finiteNumber(input.size, 8, 64)) patch.size = Math.round(input.size);
  if (finiteNumber(input.opacity, 0, 0.5)) patch.opacity = input.opacity;
  if (finiteNumber(input.alphaScale, 0.05, 3)) patch.alphaScale = input.alphaScale;

  const custom = sanitizeCustom(input.custom);
  if (custom) patch.custom = custom;

  // 按纹理分别覆盖尺寸：{ grid: 24, dots: 20, ... }
  const sizeOverride = pickMap(input.sizeOverride, STYLES, (v) => finiteNumber(v, 8, 64));
  if (sizeOverride) patch.sizeOverride = sizeOverride;

  return patch;
}

function readStoredConfig() {
  const { file } = configFiles();
  try {
    if (existsSync(file)) {
      const raw = readFileSync(file, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('[notebook-grid] Failed to read stored config:', e);
  }
  return { ...DEFAULT_CONFIG };
}

function writeStoredConfig(cfg) {
  const { dir, file } = configFiles();
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(file, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('[notebook-grid] Failed to save config:', e);
  }
}

export function apply(ctx, config) {
  let currentConfig = { ...readStoredConfig(), ...sanitizePatch(config || {}) };

  ctx.effect(() => {
    const registration = ctx.webServer.register({
      kind: 'exact',
      path: CONFIG_PATH,
      handler: (req, res) => {
        const allowed = localRequest(req);
        const origin = req.headers?.origin;
        const base = {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          Vary: 'Origin',
        };
        // 只在请求确实来自本机 DSH 窗口时回显 Origin，绝不发 `*`：
        // 桌面端（dsh-app://app）需要 CORS 才能读响应，任意网页则拿不到。
        if (allowed && origin) {
          base['Access-Control-Allow-Origin'] = origin;
        }
        const reply = (status, value, extra) => {
          res.writeHead(status, { ...base, ...extra });
          // 204/304 不允许带响应体；HEAD 也不能带。
          const bodyless = status === 204 || status === 304 || req.method === 'HEAD';
          res.end(bodyless ? undefined : JSON.stringify(value));
        };

        if (!allowed) {
          // 拒绝时把请求体排空，避免连接被 reset 而不是拿到 403 响应。
          req.resume();
          reply(403, { error: '配置接口只接受本机 DSH 窗口的请求。' });
          return;
        }

        if (req.method === 'GET' || req.method === 'HEAD') {
          reply(200, currentConfig);
          return;
        }

        if (req.method === 'POST') {
          if (!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type'] || '')) {
            reply(415, { error: '请求格式无效，需 application/json。' });
            req.resume();
            return;
          }
          const parts = [];
          let bytes = 0;
          let settled = false;
          req.on('data', (chunk) => {
            if (settled) return;
            bytes += chunk.length;
            if (bytes > MAX_BODY_BYTES) {
              settled = true;
              reply(413, { error: '请求过大。' });
              req.resume();
              return;
            }
            parts.push(chunk);
          });
          req.on('end', () => {
            if (settled) return;
            settled = true;
            let parsed;
            try {
              parsed = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}');
            } catch {
              reply(400, { error: '请求体不是合法 JSON。' });
              return;
            }
            const patch = sanitizePatch(parsed);
            if (Object.keys(patch).length === 0) {
              reply(400, { error: '没有可写入的合法配置项。' });
              return;
            }
            currentConfig = { ...currentConfig, ...patch };
            writeStoredConfig(currentConfig);
            reply(200, { success: true, config: currentConfig });
          });
          req.on('error', () => {
            if (settled) return;
            settled = true;
            reply(400, { error: '读取请求体失败。' });
          });
          return;
        }

        if (req.method === 'OPTIONS') {
          reply(204, {}, {
            'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '600',
          });
          return;
        }

        reply(405, { error: 'Method not allowed' }, { Allow: 'GET, HEAD, POST, OPTIONS' });
      },
    });
    return () => {
      if (typeof registration === 'function') registration();
      else registration?.dispose?.();
    };
  }, 'notebook-grid: config api endpoint');
}
