# dsh-plugins 产品优化报告

日期：2026-11-18 ｜ 范围：仓库内 5 个插件 ｜ 方法：静态盘点 + 构建产物比对 + 本地测试执行 + git 历史核对

---

## 1. 现状盘点

### 1.1 组合概览

| 插件 | 版本 | 定位 | 源码行数 | 测试 | CI | 发布产物 |
|---|---|---|---|---|---|---|
| dsh-qq-skin | 0.6.0 | 主题皮肤（旗舰） | 3,867（13 文件） | 8 spec / 1,962 行 | ✅ | `lib/`（**gitignore，当前陈旧**） |
| dsh-task-panel | 0.6.0 | 会话任务面板 | 492（server 7 文件）+ 预构建 client 5.0 MB | ❌ 0 | ❌ | 仓库内直接提交 `client.js` |
| dsh-llm-mmsp | 0.4.0 | MMSP 协议适配 | 3,803（lib 5 文件） | 94 用例 ✅ | ❌ | 仓库内直接提交 `lib/` |
| dsh-plugin-notebook-grid | 3.2.0 | 纸张背景 | 无源码，仅 `lib/` 手工维护 | ❌ 0 | ❌ | 仓库内直接提交 `lib/` |
| magpie-mmsp | 0.1.6 | magpie 侧 MMSP 转换 | 1,297（7 文件） | 54 用例 ✅ | ✅ | 零依赖源码 |

仓库：101 个受控文件，63 次提交（2026-10-31 → 2026-11-17），**0 个 tag**，版本号靠手改。

### 1.2 工程健康度实测

| 项 | 结果 |
|---|---|
| `node --test dsh-llm-mmsp/tests/` | 94 passed / 0 failed |
| `node --test magpie-mmsp/tests/` | 54 passed / 0 failed |
| 全仓文件 UTF-8 严格解码 | 全部通过（看到的乱码只是 PowerShell 控制台代码页） |
| `pnpm install`（dsh-qq-skin） | **失败**：`@deepseek-ai/cordis@workspace:^` 在 workspace 内不存在 |
| 各包 `package.json` | 4/5 无 `repository`；3/5 无 `LICENSE` 文件；3/5 无 `scripts`；task-panel 无 `files` |

结论：**产品功能完成度高，工程化和分发链路是短板。** 三个能跑的插件里有两个的测试没接进 CI，而最复杂的皮肤插件恰好是唯一不能从干净检出构建出来的。

---

## 2. 关键问题

### P0-1 皮肤插件的发布产物落后源码 8 天（用户装到的是旧 bug）

证据：
- `dsh-qq-skin/lib/client.js` 最后写入 **2026-11-09**，`src/client/qq-layout.ts` 最后写入 **2026-11-17**。
- 11-09 之后有 7 次提交改动 qq-skin，其中 3 个是修复：`3ae110d` 时间分隔条从未插入、`e01638c` 按回合归组、`3ac03b7` 放弃编辑后草稿不同步。
- 直接产物证据：`installHostProbe` / `HOST_SELECTORS` 在 `src/client/index.ts:37,81` 与 `src/client/host-probe.ts` 中存在，在 `lib/client.js` 中 **0 次出现**。
- `dsh-qq-skin/.gitignore:5` 忽略 `lib/`，仓库里没有可发布产物；`package.json.files` 却声明 `lib/index.js`、`lib/client.js`。

影响：任何「git clone 后从源码目录安装」的用户拿到的是 11-09 的构建——时间分隔条不出现、草稿状态错乱，刚加入的宿主锚点探针（本可作兼容性护栏）完全不生效。这是当前**唯一会直接伤害用户体验**的问题。

### P0-2 notebook-grid 的配置接口可被任意网页跨站改写

`dsh-plugin-notebook-grid/lib/index.js:47-89`：路由 `/_plugins/notebook-grid/config` 对 GET/POST/OPTIONS 全部返回 `Access-Control-Allow-Origin: *`，且**没有任何来源校验**；POST 分支把请求体直接展开进配置并落盘：

```js
currentConfig = { ...currentConfig, ...parsed };   // 任意键写入
writeStoredConfig(currentConfig);                  // 写入 ~/.dsh/notebook-grid/config.json
```

影响：用户浏览任意页面时，该页可以 `fetch('http://127.0.0.1:<port>/_plugins/notebook-grid/config', {method:'POST'})` 覆盖配置（含注入任意键），并持久化到用户主目录。同仓 `dsh-task-panel/server/file-clipboard.js` 已有正确的 `localRequest()`（loopback + `sec-fetch-site` + origin/host 比对），可直接复用。

### P0-3 task-panel 两个服务端模块从未注册（死路由 + 隐式外联）

- `server/preset-market.js`、`server/running-assets.js` 存在，但 `index.js` 只注册 nudge / clipboard / fileOperations / gitStatus。`git log -S "registerPresetMarket"` 显示**从首次提交起就没接过线**。
- 客户端仍在请求 `/dsh-ui-beautify/preset-market/catalog` 与 `/dsh-ui-beautify/running`。
- `server/running-assets.js:2` 读取 `../assets/running-whale/manifest.json`，而 `dsh-task-panel/assets/` **不存在**——即使接上线也是 500。

影响：① 每次打开面板产生 2 个必然 404；② 预设市场始终走远程兜底（jsDelivr / raw.githubusercontent），本地代理形同虚设；③ 读者误以为存在一个并不工作的功能。

### P1-1 面板插件 5.0 MB，其中 94.7% 是玻璃拟态渲染层

| 段 | 原始 | gzip |
|---|---|---|
| 整个 `client.js` | 4,986 KB | 2,965 KB |
| 其中 `DCB_LENS_BUNDLE`（4,833,073 字节） | 4,720 KB | 2,903 KB |
| 其余业务逻辑 | 266 KB | 64 KB |

另有 4 张图片内联为 data URI（PNG 1,469 KB、WebP 511 KB、WebP 311 KB、JPEG 143 KB）与一个 117 KB 的 base64 zip 预设。

影响：装一个任务面板要付 **~3 MB gzip** 前端成本（对比：notebook 12 KB、qq-skin 41 KB、llm-mmsp 19 KB）。这是"是否值得装"的直接门槛。

### P1-2 五个插件三种构建真相，CI 只覆盖 2 个

- CI 矩阵只跑 `dsh-qq-skin` 与 `magpie-mmsp`（`.github/workflows/ci.yml:15`）；llm-mmsp 有 94 个**已通过**的用例却没有任何 job，也没有 `scripts.test`。
- notebook 与 task-panel 完全没有测试，也没有 `scripts`。
- `dsh-qq-skin/pnpm-workspace.yaml` 把 `../deepseek-harness/packages/*/*`、`native/system`、`apps/*` 全列进 workspace 并硬编码 `link:` override。CI 没有这个兄弟目录，只能 `pnpm install --no-frozen-lockfile`——锁文件等于不生效，构建不可复现。

### P1-3 文档与代码五处打架

| 位置 | 声明 | 实际 |
|---|---|---|
| 根 `README.md:21` | 「支持 5 种精调色板」+「Web Audio 合成寻呼机嘀嘀提示音」 | 6 种 + custom = 7；提示音已在 `27d5fc2` 移除 |
| 根 README 目录树 | 4 个插件 | 5 个（缺 magpie-mmsp） |
| `dsh-qq-skin/README.zh.md` | 「内置六种色板变体」 | 6 种 + 自定义，共 7 个可选项 |
| `dsh-task-panel/CHANGELOG.md:3` | `## 0.6.1` | `package.json` 是 `0.6.0` |
| `magpie-mmsp/README.md` | 提到 `0.1.5` | `package.json` 是 `0.1.6` |

### P2 分发与合规细节

- 3/5 包声明 MIT 但**没有 LICENSE 文件**（notebook、llm-mmsp、magpie）。
- 4/5 包没有 `repository`，npm 页无源码入口。
- `dsh-task-panel` 没有 `files` 字段 → 发布会带上 `vendor/`、`CHANGELOG` 等；`dsh-qq-skin` 的 `files` 又漏了 `README.md`。
- `dsh-llm-mmsp/backups/` 5 个 `.bak`（107 KB，含旧版 adapter 与 client）**被 git 跟踪**。
- `dsh-plugin-notebook-grid` 没有 `src/`：3 KB 服务端 + 53 KB 客户端全靠手改 `lib/`；`preview.html`（39 KB）是第三份副本且已漂移（不含 `settings.general.item`、`nb-bg-*`、`alphaScale`）。
- 全仓 0 tag、0 release，回滚只能靠 commit hash。

### 2.5 做得好的地方（重构时不要弄丢）

- `dsh-llm-mmsp` 密钥池语义正确：只有 `AUTH`/`RATE_LIMIT` 换密钥，`TRANSPORT`/`SERVER` 直接抛；**首帧之后不再换源**（避免一条回复混两个账号）；`content-type` 嗅探拦截「200 + HTML 拦截页」。协议测试覆盖 thinking 六档、tool-call id 归一化、usage 换算。
- `dsh-task-panel` 本地接口守卫扎实：`localRequest()`、`git checkout --end-of-options`（阻断分支名注入）、回收站删除走 `-EncodedCommand`、Windows 保留名与尾点空格校验。
- `dsh-qq-skin` 用官方 `ctx.theme.overrideTokens` 叠加、卸载即还原，不注册新主题 id、不改用户明暗偏好——正确的扩展姿势。11-17 新增的 `host-probe.ts` 把 15 个宿主锚点集中到 `HOST_SELECTORS` 并失配告警，方向完全正确。

---

## 3. 优化机会（按杠杆排序）

| # | 机会 | 预期收益 | 成本 |
|---|---|---|---|
| 1 | 把「构建产物 = 源码」变成机器保证 | 消除唯一会伤用户的类别（装到旧 bug） | 0.5 天 |
| 2 | 补齐 CI 到 5 个插件 | 94 + 54 个已有用例从"本地能过"变成"合入即验" | 0.5 天 |
| 3 | task-panel 包体从 3 MB gzip 降到 < 250 KB | 安装转化率、首屏、更新流量 | 2–3 天 |
| 4 | 本地接口统一走 `localRequest()` | 关掉一个可跨站写配置的口子 | 2 小时 |
| 5 | 版本/变更/文档单一来源 | 消除 5 处漂移，发布可复现 | 1 天 |
| 6 | 死路由二选一（接上或删掉） | 去掉 2 个必然 404 + 隐式外联 | 2 小时 |
| 7 | llm-mmsp 流式空闲看门狗 | 上游卡流时快速失败而不是挂死 | 0.5 天 |

---

## 4. 实施方案

### 波次 0 — 当天（4 项，约 3 小时）

#### 4.1 修 notebook 跨站写配置（P0-2）

在 `dsh-plugin-notebook-grid/lib/index.js` 顶部加入与 task-panel 同构的守卫，并给 POST 加键白名单：

```js
const ALLOWED = ['enabled', 'style', 'palette', 'custom', 'alphaScale', 'sizeOverride', 'size', 'opacity']

function localRequest(req) {
  const address = req.socket?.remoteAddress
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return false
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers?.origin
  if (!origin) return true
  try {
    const url = new URL(origin)
    return ['http:', 'https:'].includes(url.protocol) &&
      url.host === req.headers.host &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch { return false }
}
```

handler 首行加 `if (!localRequest(req)) { res.writeHead(403).end(); return }`，三处 `Access-Control-Allow-Origin: '*'` 全部删除（同源请求不需要 CORS 头），POST 落盘前过滤：

```js
const patch = {}
for (const k of ALLOWED) if (k in parsed) patch[k] = parsed[k]
currentConfig = { ...currentConfig, ...patch }
```

验收：`curl -H "Origin: https://evil.example" -X POST .../config -d '{"enabled":false}'` → 403；页面内正常保存仍成功。

#### 4.2 皮肤产物对齐源码（P0-1）

```bash
cd dsh-qq-skin
pnpm install --frozen-lockfile   # 先补 ../deepseek-harness 检出，或按 4.8-B 走 registry
pnpm build
node -e "const s=require('fs').readFileSync('lib/client.js','utf8');if(!s.includes('installHostProbe')){console.error('stale bundle');process.exit(1)}"
```

把检查固化成脚本 `scripts/verify-artifact.mjs`：从 `src/**` 取 3 个最近修复的特征串（当前可用 `installHostProbe`、`HOST_SELECTORS`、`斜杠`），断言都出现在 `lib/client.js`，缺任一即非零退出。这样忘记 build 会在 CI 变红，而不是到用户机器上才发现。

#### 4.3 死路由二选一（P0-3）

最省事且正确的做法是**接上**，因为客户端已经在调用：

```js
// dsh-task-panel/index.js
import {registerPresetMarket} from './server/preset-market.js'
import {registerRunningAssets} from './server/running-assets.js'

export function apply(root, config) {
  registerDeliverableNudge(root, config)
  registerFileClipboard(root)
  registerFileOperations(root)
  registerGitStatus(root)
  registerPresetMarket(root)     // /dsh-ui-beautify/preset-market/{catalog,<id>/<version>}
  registerRunningAssets(root)    // /dsh-ui-beautify/running/*
}
```

但 `assets/running-whale/` 不存在，必须先补资源，否则会从 404 变成 500。不想补资源就删掉 `running-assets.js` 并把客户端常量指向内置 `builtin-whale`，让降级发生在代码里而不是靠一次网络失败。

接上 preset-market 之前加一条完整性约束：catalog 条目带 `sha256`，下载后校验再解压。当前只限大小（64 MB）不校验内容，而源来自第三方仓库 `AumiSatori/dsh-ui-beautify`。

#### 4.4 元数据补齐（P2，10 分钟）

四个缺 `repository` 的包补：

```json
"repository": { "type": "git", "url": "https://github.com/JunsonJack/dsh-plugins.git", "directory": "<包名>" },
"files": ["lib/index.js", "lib/client.js", "cordis.patch.yml", "README.md", "LICENSE"],
"scripts": { "test": "node --test tests/" }
```

三个缺 LICENSE 的包从 `dsh-qq-skin/LICENSE` 拷贝同一份 MIT 文本。

### 波次 1 — 本周（CI + 单一来源，约 1.5 天）

#### 4.5 CI 从 2 个 job 扩到 5 个

```yaml
jobs:
  test-qq-skin:            # 已有：install → typecheck → test → build → verify:artifact
  test-magpie-mmsp:        # 已有

  test-llm-mmsp:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: dsh-llm-mmsp } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: node --test tests/

  test-task-panel:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: dsh-task-panel } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: node --test tests/
      - run: node scripts/check-bundle-budget.mjs

  test-notebook-grid:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: dsh-plugin-notebook-grid } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: node --check lib/index.js
      - run: node --test tests/
```

task-panel 的 `tests/` 目前为空，先补 3 个最小用例就有价值：`localRequest` 的 4 种来源判定、`validFileName` 的保留名/尾点/超长、`git-checkout` 的 `--end-of-options` 断言。`file-operations.js` 已是纯函数 + 可注入依赖的结构，测起来成本很低。

#### 4.6 包体预算门禁

```js
// dsh-task-panel/scripts/check-bundle-budget.mjs
import fs from 'node:fs'
import zlib from 'node:zlib'
const LIMIT_KB = 400
const buf = fs.readFileSync(new URL('../client.js', import.meta.url))
const gz = Math.round(zlib.gzipSync(buf, { level: 9 }).length / 1024)
console.log(`client.js gzip ${gz}KB (budget ${LIMIT_KB}KB)`)
if (gz > LIMIT_KB) { console.error('bundle budget exceeded'); process.exit(1) }
```

初始阈值设成当前实际值 +10%（约 3,260 KB）避免立刻红，4.9 完成后再收紧到 400 KB。

#### 4.7 把版本/变更/文档收敛到一处

1. 引入 changesets（或一个 40 行的 `scripts/release.mjs`）：版本号只从 changeset 生成，`package.json` 不再手改。
2. 打 tag：`dsh-qq-skin@0.6.1`、`dsh-task-panel@0.6.1`、`dsh-llm-mmsp@0.4.0`、`dsh-plugin-notebook-grid@3.2.0`、`magpie-mmsp@0.1.6`，从当前 HEAD 起算。
3. 修 2 处已知漂移：task-panel CHANGELOG 的 0.6.1 要么回填到 `package.json` 要么并回 0.6.0；magpie README 的 0.1.5 → 0.1.6。
4. 根 README 重写三处：色板 6 + 自定义、删掉提示音、目录树补 `magpie-mmsp`。

#### 4.8 让干净检出可构建（P1-2 根因）

两条路，推荐第二条：

- **A**：CI 里额外 checkout `deepseek-harness` 到 `../`（慢、依赖两仓同版本、把 CI 变成集成测试）。
- **B**：`pnpm-workspace.yaml` 只保留 `packages: ['.']`，`devDependencies` 指向 registry 上的 `@deepseek-ai/*` 版本；本地联调另放 `pnpm-workspace.dev.yaml` 切换。这样 CI 能 `--frozen-lockfile`，锁文件恢复意义。

### 波次 2 — 两周（包体 + 稳定性）

#### 4.9 task-panel 包体：3 MB gzip → < 250 KB

按收益从大到小：

1. **玻璃层懒加载**（省 ~2.9 MB gzip）。`DcbLens` 只在面板展开且 `prefers-reduced-motion: no-preference` 时才需要。改成动态 `import()` 的独立 chunk：

   ```js
   let lensReady = false
   async function ensureLens() {
     if (lensReady) return
     await import('./lens.bundle.js')   // 仅在首次展开面板时拉取
     lensReady = true
   }
   ```

   短期不能拆包时至少加开关：默认关，设置项里"启用液态玻璃效果"，关闭时完全不初始化 WebGL。

2. **图片外置**（省 ~2.4 MB 原始）。4 张图（1.47 MB PNG 最碍事）改为 `assets/` 下的独立文件 + `webServer.register` 静态路由（`running-assets.js` 已是这个模式），客户端用 URL 引用而非 data URI。PNG 先转 WebP/AVIF，1.47 MB 通常能到 80 KB 以内。

3. **预设 zip 移出主包**（省 117 KB）。按需从 `preset-market` 或独立文件加载。

验收：`check-bundle-budget.mjs` 阈值降到 400 KB 后 CI 仍绿；4G 模拟下首屏可交互时间下降 ≥ 60%。

#### 4.10 llm-mmsp 流式空闲看门狗

当前只有模型目录的 8 s 超时（`mmsp-adapter.js:62`），流式请求本身没有帧级超时。上游半开连接会让会话静默挂住。

```js
const IDLE_MS = 60_000
let idle
const arm = () => { clearTimeout(idle); idle = setTimeout(() => controller.abort(), IDLE_MS) }
arm()
try {
  for await (const frame of frames) { arm(); /* … */ }
} finally { clearTimeout(idle) }
```

这里的 abort 要映射成 `TRANSPORT`（不是密钥问题），与现有 `isKeyFault` 语义一致——否则会把一次网络卡顿错记成密钥失效，触发 60 s 冷却。

#### 4.11 qq-skin 锚点探针产品化

`host-probe.ts` 已在失配时 `warn`。把它接到设置页：插件页显示「宿主兼容性：15/15 锚点命中」或列出缺失项与建议（"harness 升级导致，请更新插件"）。把一次性调试能力变成用户可自助诊断的能力，是 harness 快速迭代期最需要的护栏。

#### 4.12 notebook 补 `src/`

53 KB 客户端 + 3 KB 服务端目前只有构建产物。至少把 `lib/index.js` 提到 `src/index.ts` 并用轻量构建，让 `preview.html` 从真实组件生成而不是第三份副本。

---

## 5. 度量

按周跟踪 6 个指标，前三个直接对应用户感知：

| 指标 | 现状 | 目标 |
|---|---|---|
| task-panel `client.js` gzip | 2,965 KB | < 250 KB（先到 400 KB） |
| CI 覆盖插件数 | 2 / 5 | 5 / 5 |
| 干净检出可构建（clone → install → build） | qq-skin ❌ | 5 / 5 ✅ |
| 文档漂移条数（自动脚本计数） | 5 | 0 |
| qq-skin 锚点命中率（探针上报） | 未知 | ≥ 15/15，跌破即告警 |
| llm-mmsp 密钥切换成功率 / 误冷却次数 | 未知 | 成功率 > 95%，误冷却 = 0 |

---

## 6. 风险与取舍

- **拆 lens 会动到 5 MB 预构建产物，而 task-panel 没有源码。** 最大执行风险：没有 `src/` 就无法安全做 `import()` 拆分。建议先做 4.9-2（图片外置，纯资源层、零逻辑风险）把 3 MB 降到 ~1.6 MB，再决定是否为拆包重建源码树。
- **CI 走 registry（4.8-B）会让本地联调多一步切换。** 独立 `pnpm-workspace.dev.yaml` 可以两全，但需要约定"提交前用 dev 配置、CI 用默认配置"。
- **接上 preset-market 会引入第三方内容解包。** 上线前必须加 sha256 校验与条目上限，否则是把一个"没接的洞"变成"接上的洞"。
- **不建议现在做的**：把 5 个插件合并成 monorepo workspace。发布节奏、依赖面（一个要 React + harness 源码、一个零依赖）差异太大，合并只会把 qq-skin 的构建难题扩散到全部。

---

## 7. 一页结论

产品力不缺：QQ 皮肤的还原度、MMSP 适配器的协议严谨度（94 + 54 个用例）、任务面板的本地接口守卫都在水准之上。真正的差距在**交付链路**——最复杂的插件产物比源码旧 8 天，最重的插件 3 MB gzip，5 个插件只有 2 个有 CI，版本和文档靠人肉同步。

优先级应当是：**先保证"用户装到的是最新且正确的产物"，再降包体，最后才谈新功能。** 波次 0 的四件事（3 小时）就能拿掉全部 P0；波次 1（1.5 天）把工程约束变成机器保证；波次 2 才去动 3 MB 的玻璃层。
