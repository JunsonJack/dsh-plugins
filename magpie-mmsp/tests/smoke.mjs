import { MmspProvider } from "../index.mjs";

const mod = { MmspProvider };
console.log("exports:", Object.keys(mod));

const hooks = await MmspProvider({
  client: { config: { get: async () => ({ provider: { mmsp: { api: "https://example.org/api/v1" } } }) } },
});
console.log("hook keys:", Object.keys(hooks));

const cfg = {};
await hooks.config(cfg);
console.log("provider declared:", JSON.stringify(Object.keys(cfg.provider.mmsp)));
console.log("models:", Object.keys(cfg.provider.mmsp.models).join(","));

const loader = await hooks.auth.loader(async () => ({ type: "api", key: "ep_test" }));
console.log("loader fields:", Object.keys(loader));

const models = await hooks.provider.models(cfg.provider.mmsp, { auth: { type: "api", key: "x" } });
console.log("models hook fell back to:", Object.keys(models).join(","));

const noAuth = await hooks.provider.models(cfg.provider.mmsp, {});
console.log("models hook without auth:", Object.keys(noAuth).join(","));

const anonymousLoader = await hooks.auth.loader(async () => undefined);
console.log("loader without auth:", JSON.stringify(anonymousLoader));
console.log("OK");
