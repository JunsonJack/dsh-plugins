/**
 * 从 9router 的库里取一个 penguin 连接的密钥（**仅本机开发用**）。
 *
 * 这个读取只用于端到端验证脚本，避免把密钥硬编码进仓库或命令行。
 * 插件本身**不**读 9router —— 它的密钥走 DSH 凭据库 / 环境变量。
 *
 * ## 路径是**可配的**
 *
 * 库里没有硬编码任何人的用户名：默认路径按当前用户推导，也可以用
 * `MMSP_9ROUTER_DB` 环境变量指到别处。非本机开发者直接给
 * `MMSP_API_KEY` 设环境变量即可，本模块根本不会被调用。
 *
 * @module dsh-llm-mmsp/stubs/penguin-key
 */
import { copyFileSync, existsSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * 9router 数据库的位置：环境变量优先，否则按当前用户推导。
 *
 * @returns {string} 数据库文件路径。
 */
function resolveDbPath() {
  const fromEnv = process.env.MMSP_9ROUTER_DB;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  return join(homedir(), '.9router', 'db', 'data.sqlite');
}

/**
 * 读一个 penguin 连接的密钥。
 *
 * @returns {string} 密钥。
 */
export function loadPenguinKey() {
  const dbPath = resolveDbPath();
  if (!existsSync(dbPath)) {
    throw new Error(
      `找不到 9router 的库（${dbPath}）；请设置 MMSP_API_KEY 环境变量，`
      + '或用 MMSP_9ROUTER_DB 指向正确的路径。',
    );
  }
  const dir = mkdtempSync(join(tmpdir(), 'mmsp-key-'));
  const copy = join(dir, 'data.sqlite');
  copyFileSync(dbPath, copy);
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(dbPath + suffix)) copyFileSync(dbPath + suffix, copy + suffix);
  }
  const sqlite = require('node:sqlite');
  const db = new sqlite.DatabaseSync(copy);
  try {
    const rows = db.prepare('SELECT name, data FROM providerConnections').all();
    for (const row of rows) {
      const parsed = JSON.parse(row.data);
      const specific = parsed?.providerSpecificData ?? {};
      if (String(specific.baseUrl ?? '').includes('20129') || String(row.name ?? '').toLowerCase().includes('penguin')) {
        if (typeof parsed.apiKey === 'string' && parsed.apiKey.length > 0) return parsed.apiKey;
      }
    }
  } finally {
    db.close();
  }
  throw new Error('9router 的库里没有找到 penguin 连接；请设置 MMSP_API_KEY 环境变量。');
}
