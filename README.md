# dsh-plugins

DeepSeek Harness (DSH) 本地插件集合，另含一个 magpie 原生插件。

## 插件列表

### dsh-plugin-notebook-grid `v3.2.0`

笔记本网格插件：以网格布局展示 DSH 笔记本内容，附 `preview.html` 可直接预览效果。

### dsh-llm-mmsp `v0.4.0`

LLM 多模态 MMSP 协议适配插件：在进程内把 harness 消息转换为 MMSP 请求（直连 `go.penguin.ooo` 等只开放 MMSP 的上游），再把事件流翻译回 `StreamChunk`。含多语言文案（`locale/`）与测试（`tests/`），支持六档思考等级、思考摘要、可拖拽排序的多密钥池（轮询/优先级/自动故障切换/实时用量）。安装步骤见 [dsh-llm-mmsp/INSTALL.md](./dsh-llm-mmsp/INSTALL.md)。

### dsh-task-panel `v0.6.0`

右上角任务面板插件：为 DeepSeek Harness 提供右上角常驻会话任务面板，支持会话任务进度与步骤时间线、交付物文件展示与预览、工具与技能统计、Git Diff 统计及本地分支一键切换、侧边栏联动。

### dsh-qq-skin `v0.6.0`

QQ NT 风格皮肤插件：通过官方 token 层（`ctx.theme.overrideTokens`）叠加全局 `<style>` 布局层，为 DSH Web 客户端带来 QQ NT 视觉语言。支持 6 种色板（经典蓝、炫彩紫、简洁白、经典绿、深空黑、QQ蓝）与自定义主色，可配置头像装扮/头像尺寸/气泡尾巴/会话宽度/消息密度/毛玻璃/打字机动效/时间分隔条；配置集中在插件管理页的「QQ 皮肤」卡片，支持可视化切换与热更新。要求 dsh 0.2.0+，详见 [dsh-qq-skin/README.zh.md](./dsh-qq-skin/README.zh.md)。

### magpie-mmsp `v0.1.6`

magpie 原生 MMSP 协议转换插件：声明一个 chat completions 供应商，在 loader 的自定义 `fetch` 里完成双向转换（网关的 OpenAI 请求 → MMSP 发给上游，MMSP 事件流 → chat completions）。无需外部转换层，多密钥直接复用 magpie 原生多账号机制。安装：`magpie plugin add ./magpie-mmsp`，详见 [magpie-mmsp/README.md](./magpie-mmsp/README.md)。

### dsh-acp-modes `v0.1.0`

DSH ACP 桥接的本地分支插件：在官方 `dsh-acp` 之上为 ACP 客户端多暴露一个 Mode 选择器，把权限预设与计划模式合并为「默认 / 计划 / 完全访问」三档，供 Tern 等客户端选择。`lib/index.js` 由 `sync.mjs` 从已安装的 dsh 生成，dsh 升级后重跑即可。安装与恢复步骤见 [dsh-acp-modes/README.md](./dsh-acp-modes/README.md)。

## 安装方式

- **DSH 插件**（前四个）：各插件目录下均带 `cordis.patch.yml`，按 DSH 本地插件方式挂载即可（具体见各插件 README）。
- **magpie 插件**：`magpie plugin add ./magpie-mmsp` 就地加载，再用 `magpie plugin login mmsp` 登录密钥。
- **dsh-acp-modes**：替换式的 ACP 桥分支，需先 `dsh plugin --profile acp add file:...`，再生成并复制进 profile（见其 README）。

## 测试

CI（[`.github/workflows/ci.yml`](./.github/workflows/ci.yml)）在 push 到 `main` 与 PR 时运行：

```bash
# dsh-qq-skin：需先 pnpm install，再 typecheck / test / build
cd dsh-qq-skin && pnpm install --no-frozen-lockfile && pnpm run typecheck && pnpm test && pnpm run build

# magpie-mmsp：零依赖，node --test 直接跑
cd magpie-mmsp && node --test tests/
```

其余插件目前无独立锁文件，接入 CI 时按上述 job 模式添加即可。

## 目录结构

```
dsh-plugins/
├── dsh-plugin-notebook-grid/   # 笔记本网格插件
├── dsh-llm-mmsp/               # DSH MMSP 协议适配插件
├── dsh-task-panel/             # 右上角任务面板插件
├── dsh-qq-skin/                # QQ NT 风格皮肤插件
├── magpie-mmsp/                # magpie 原生 MMSP 协议转换插件
├── dsh-acp-modes/              # ACP 模式选择器桥接分支
├── docs/                       # 设计与评审文档
└── .github/workflows/ci.yml    # CI：typecheck / test / build
```
