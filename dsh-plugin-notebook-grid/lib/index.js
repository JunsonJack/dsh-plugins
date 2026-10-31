import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const name = 'dsh-plugin-notebook-grid';
export const inject = ['webServer'];

const CONFIG_DIR = join(homedir(), '.dsh', 'notebook-grid');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  enabled: true,
  style: 'grid',       // 'grid' | 'engineering' | 'dots' | 'lines'
  size: 24,            // px
  opacity: 0.08        // 0.02 - 0.3
};

function readStoredConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('[notebook-grid] Failed to read stored config:', e);
  }
  return { ...DEFAULT_CONFIG };
}

function writeStoredConfig(cfg) {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('[notebook-grid] Failed to save config:', e);
  }
}

export function apply(ctx, config) {
  let currentConfig = { ...readStoredConfig(), ...(config || {}) };

  ctx.effect(() => {
    return ctx.webServer.register({
      kind: 'exact',
      path: '/_plugins/notebook-grid/config',
      handler: (req, res) => {
        if (req.method === 'GET' || req.method === 'HEAD') {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(req.method === 'HEAD' ? undefined : JSON.stringify(currentConfig));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              currentConfig = { ...currentConfig, ...parsed };
              writeStoredConfig(currentConfig);
              res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
              });
              res.end(JSON.stringify({ success: true, config: currentConfig }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
          res.end();
          return;
        }

        res.writeHead(405, { Allow: 'GET, POST, OPTIONS' });
        res.end('Method not allowed');
      }
    });
  }, 'notebook-grid: config api endpoint');
}
