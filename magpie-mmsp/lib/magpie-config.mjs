// magpie-config.mjs —— 读 magpie 自己的供应商存储（供应商弹窗写的那份）
//
// 为什么需要它：弹窗里「高级 → 请求头」写进 ~/.config/magpie/providers.json 的
// provider 条目（headers 对象），但 magpie 网关不会把插件供应商的这份 headers
// 塞进 loader.fetch 的 init.headers（实测只有 authorization/content-type/
// x-magpie-fallback），所以插件只能自己读回来，再用到发往上游的请求上。
//
// 注意：只读 headers，不读 URL。弹窗里的 URL（chat）会让 magpie 把该供应商当
// 自建供应商路由，请求根本到不了插件的 fetch（实测 EOF），所以 URL 仍走
// 插件配置 / options / 环境变量。
//
// 另外也读 plugins.json 的 options：面板/命令行改完选项不必重启插件。
// magpie 传给插件的 input.options 是加载时的快照，改完不重启就一直是旧值。

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// magpie 配置目录：MAGPIE_CONFIG_DIR（测试/自定义）> $XDG_CONFIG_HOME/magpie > ~/.config/magpie
export function magpieConfigDir(env = process.env) {
  const explicit = env.MAGPIE_CONFIG_DIR;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const xdg = env.XDG_CONFIG_HOME;
  const base = typeof xdg === "string" && xdg.trim() ? xdg.trim() : join(homedir(), ".config");
  return join(base, "magpie");
}

// 进程级缓存，键是「文件 + 供应商 id」。只存 headers：
// providers.json 里每个条目都带账号 key，没必要在内存里多留一份。
const SHARED_CACHE = new Map();

function findHeaders(data, id) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.providers) ? data.providers : [];
  const found = list.find((p) => p && p.id === id);
  const headers = found?.headers;
  return headers && typeof headers === "object" && !Array.isArray(headers) ? headers : null;
}

/**
 * 弹窗里「高级 → 请求头」那一栏，对象形态 {name: value}。
 * 文件不存在、JSON 坏了、结构不对、没有 headers —— 一律返回 null，绝不打断请求。
 * @param {string} id 供应商 id（如 "mmsp"）
 * @param {{ configDir?: string, cache?: Map }} [options]
 * @returns {Record<string, string> | null}
 */
export function dialogHeaders(id, { configDir = magpieConfigDir(), cache = SHARED_CACHE } = {}) {
  if (typeof id !== "string" || !id) return null;
  const file = join(configDir, "providers.json");
  const cacheKey = `${file}\u0000${id}`;
  try {
    const stat = statSync(file);
    const hit = cache.get(cacheKey);
    // mtime 之外再比一次大小：Windows 上同毫秒的连续写不会漏掉
    if (hit && hit.mtime === stat.mtimeMs && hit.size === stat.size) return hit.headers;
    const data = JSON.parse(readFileSync(file, "utf8"));
    const headers = findHeaders(data, id);
    cache.set(cacheKey, { mtime: stat.mtimeMs, size: stat.size, headers });
    return headers;
  } catch {
    // stat / 读 / parse 任一失败：当作没有弹窗配置
    return null;
  }
}

// plugins.json 里的 spec 可能是本地路径（D:\magpie-plugins\magpie-mmsp）、
// npm 包名（magpie-mmsp 或 @scope/name），也可能带版本后缀（@latest / @1.2.3）。
const PLUGIN_CACHE = new Map();

function looksLikePath(spec) {
  return /^[A-Za-z]:[\\/]/.test(spec) || spec.startsWith("\\\\") || spec.startsWith("/") || spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("file:") || spec.includes("\\");
}

function normalizePath(spec) {
  return spec.replace(/^file:/i, "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function stripVersion(spec) {
  // "@scope/name@1.2.3" → "@scope/name"；"name@latest" → "name"；"@scope/name" 原样保留
  const trimmed = spec.trim();
  const at = trimmed.lastIndexOf("@");
  if (at > 0 && !trimmed.slice(0, at).endsWith("/")) return trimmed.slice(0, at);
  return trimmed;
}

function specMatches(spec, candidates) {
  if (typeof spec !== "string" || !spec.trim()) return false;
  const raw = spec.trim();
  const bare = stripVersion(raw);
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    if (raw === candidate || bare === candidate) return true;
    if (looksLikePath(raw) && looksLikePath(candidate) && normalizePath(raw) === normalizePath(candidate)) return true;
  }
  return false;
}

/**
 * 插件选项（package.json 声明的那些开关）：面板和 `magpie plugin options` 都写在这里。
 * 存于 plugins.json 的 plugins[].options；每次请求重新读，改完不必重启插件。
 * @param {string | string[]} candidates 用来认出「自己这条」的名字：本地目录、包名都行
 * @param {{ configDir?: string, cache?: Map }} [options]
 * @returns {Record<string, unknown> | null}
 */
export function pluginOptions(candidates, { configDir = magpieConfigDir(), cache = PLUGIN_CACHE } = {}) {
  const list = (Array.isArray(candidates) ? candidates : [candidates]).filter((c) => typeof c === "string" && c.trim());
  if (!list.length) return null;
  const file = join(configDir, "plugins.json");
  const cacheKey = `${file}\u0000${list.join("|")}`;
  try {
    const stat = statSync(file);
    const hit = cache.get(cacheKey);
    if (hit && hit.mtime === stat.mtimeMs && hit.size === stat.size) return hit.options;
    const data = JSON.parse(readFileSync(file, "utf8"));
    const entries = Array.isArray(data) ? data : Array.isArray(data?.plugins) ? data.plugins : [];
    const entry = entries.find((item) => item && specMatches(item.spec, list));
    const options =
      entry?.options && typeof entry.options === "object" && !Array.isArray(entry.options) ? entry.options : null;
    cache.set(cacheKey, { mtime: stat.mtimeMs, size: stat.size, options });
    return options;
  } catch {
    // 文件缺失 / 坏 JSON / 结构不对：当作没设过选项
    return null;
  }
}
