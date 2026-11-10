// magpie-mmsp —— 在 magpie 里直接说 MMSP 的协议转换插件
//
// magpie 网关把 agent 请求转成 chat completions 交给 loader 的 fetch；
// 这里把它翻译成 MMSP（POST {root}/api/v1/stream，SSE 回答），再把 MMSP
// 事件流翻译回 chat completions，让 AI SDK 当作普通 OpenAI 兼容上游解析。
//
// 注意：只从入口导出插件函数——入口里任何其他导出都会被当成另一个插件。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handleChatRequest, mmspEndpoints, parseHeaders, buildUpstreamHeaders, debugHeaders } from "./lib/mmsp-fetch.mjs";
import { dialogHeaders, pluginOptions } from "./lib/magpie-config.mjs";

// 版本号从自己的 package.json 读，避免两处写死后走散；
// 展示在供应商名里，用户看弹窗标题就知道加载的是不是新代码。
const PKG = (() => {
  try {
    return JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  } catch {
    return {};
  }
})();
// plugins.json 里认出「自己这条」用：本地目录路径或包名
const PLUGIN_DIR = fileURLToPath(new URL(".", import.meta.url)).replace(/[\\/]+$/, "");
const PLUGIN_NAME = PKG.name || "magpie-mmsp";

const PROVIDER = "mmsp";
const DEFAULT_ROOT = "https://go.penguin.ooo";
const DEFAULT_API = DEFAULT_ROOT + "/api/v1";

const VARIANTS = { low: {}, medium: {}, high: {}, xhigh: {}, max: {} };
const fallbackModel = (id) => ({ id, name: id, reasoning: true, tool_call: true, variants: VARIANTS });

// "https://host/api/v1" | "https://host/v1" | "https://host" → "https://host"
function rootOf(url, fallback = DEFAULT_ROOT) {
  if (typeof url !== "string" || !url.trim()) return fallback;
  const stripped = url.trim().replace(/\/+$/, "").replace(/\/(?:api\/)?v1$/, "");
  return stripped || fallback;
}

export const MmspProvider = async (input = {}) => {
  const client = input.client;

  // config 钩子读回来的就是插件自己的 provider 配置（注意是 cfg.data.provider）
  const providerCfg = async () => {
    try {
      const cfg = await client?.config?.get?.();
      return cfg?.data?.provider?.[PROVIDER] ?? cfg?.provider?.[PROVIDER] ?? null;
    } catch {
      return null;
    }
  };

  // 选项优先读 plugins.json（面板 / 命令行刚写完就能用），退回加载时的快照
  const currentOptions = () => {
    const fromFile = pluginOptions([PLUGIN_DIR, PLUGIN_NAME]);
    if (fromFile) return fromFile;
    return input.options ?? input.magpie?.options ?? null;
  };

  // 上游根地址动态读取：改了配置或 options 立刻生效，不必重启
  const rootFromConfig = async () => {
    const p = await providerCfg();
    const api = p?.api ?? p?.baseURL ?? p?.base_url;
    if (typeof api === "string" && api.trim()) return rootOf(api);

    const opt = currentOptions();
    const optApi = opt?.baseURL ?? opt?.api;
    if (typeof optApi === "string" && optApi.trim()) return rootOf(optApi);

    return rootOf(process.env.MMSP_BASE_URL || process.env.MMSP_API || DEFAULT_API);
  };

  // 动态读取自定义请求头（支持多行、JSON、对象）
  // 优先级（低 → 高）：环境变量 < 插件 options < 配置级 headers < 供应商弹窗「高级 → 请求头」
  const headersFromConfig = async () => {
    try {
      const layers = [];
      if (process.env.MMSP_HEADERS) layers.push(process.env.MMSP_HEADERS);
      const opt = currentOptions();
      if (opt?.headers) layers.push(opt.headers);
      const p = await providerCfg();
      if (p?.headers) layers.push(p.headers);
      // 弹窗那栏最后压上去：界面上填的说了算
      const dialog = dialogHeaders(PROVIDER);
      if (dialog && Object.keys(dialog).length) layers.push(dialog);
      return layers.reduce((acc, raw) => ({ ...acc, ...parseHeaders(raw) }), {});
    } catch {
      // 任何一层读坏了都不该让请求失败：退回「没有自定义头」
      return {};
    }
  };

  return {
    config: async (cfg) => {
      cfg.provider ??= {};
      cfg.provider[PROVIDER] ??= {
        name: "MMSP (penguin)",
        npm: "@ai-sdk/openai-compatible", // chat completions —— 与 MMSP 最接近的线格式
        api: DEFAULT_API,
        // 静态兜底目录：登录后 provider.models 会换成上游的实时列表。
        // 不编造 limit.context——上游不给窗口大小，编了会让自动压缩在错误阈值触发。
        models: {
          "deepseek-flash": fallbackModel("deepseek-flash"),
          "gemini-3.8-flash": fallbackModel("gemini-3.8-flash"),
          "gemini-3.1-pro-preview": fallbackModel("gemini-3.1-pro-preview"),
          "gemini-4-argon": fallbackModel("gemini-4-argon"),
        },
      };
    },

    auth: {
      provider: PROVIDER,
      methods: [
        { type: "api", label: "Penguin API key", placeholder: "ep-…" },
      ],
      // 每个账号运行一次；多密钥 = 多次登录，轮询/冷却/故障切换由 magpie 原生承担
      async loader(getAuth) {
        const auth = await getAuth();
        if (auth?.type !== "api" || !auth.key) return {};
        const root = await rootFromConfig();
        const customHeaders = await headersFromConfig();
        return {
          baseURL: root + "/api/v1",
          apiKey: auth.key,
          headers: customHeaders,
          async fetch(inputReq, init) {
            const currentRoot = await rootFromConfig();
            const currentHeaders = await headersFromConfig();
            return handleChatRequest({
              init,
              key: auth.key,
              endpoints: mmspEndpoints(currentRoot),
              extraHeaders: currentHeaders,
            });
          },
        };
      },
    },

    // OpenCode 的 chat.headers 钩子：magpie 对每个请求都会运行它。
    // 网关请求的头会覆盖 loader 的 headers，所以自定义头必须也从这里补一遍，
    // 否则会被网关自己的头盖掉。
    "chat.headers": async (input, output) => {
      if (input?.model?.providerID !== PROVIDER) return;
      const extra = await headersFromConfig();
      output.headers ??= {};
      for (const [k, v] of Object.entries(extra)) {
        const key = k.toLowerCase();
        // 协议关键头与逐跳头由插件最上层接管，这里不覆盖
        if (key === "authorization" || key === "content-type") continue;
        output.headers[k] = v;
      }
    },

    provider: {
      id: PROVIDER,
      // 每个账号的模型列表：GET /api/v1/models 任何账号都可列。
      // 失败时原样返回 provider.models，magpie 保留原来的列表。
      async models(provider, { auth } = {}) {
        if (auth?.type !== "api" || !auth.key) return provider.models;
        const root = await rootFromConfig();
        const customHeaders = await headersFromConfig();
        let res;
        try {
          const upstreamHeaders = buildUpstreamHeaders({ extra: customHeaders, key: auth.key });
          debugHeaders("models " + mmspEndpoints(root).models, upstreamHeaders);
          res = await fetch(mmspEndpoints(root).models, { headers: upstreamHeaders });
        } catch {
          return provider.models;
        }
        if (!res.ok) return provider.models;
        let body;
        try {
          body = await res.json();
        } catch {
          return provider.models;
        }
        const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
        const template = provider?.models?.["deepseek-flash"] ?? Object.values(provider?.models ?? {})[0] ?? {};
        const out = {};
        for (const m of list) {
          if (typeof m?.id !== "string" || !m.id) continue;
          if (/embedding/i.test(m.id)) continue; // 聊天路由不适配 embedding 模型
          out[m.id] = { ...template, id: m.id, name: typeof m.name === "string" && m.name ? m.name : m.id };
        }
        return Object.keys(out).length ? out : (provider?.models ?? {});
      },
    },
  };
};
