# dsh-acp-modes

DeepSeek Harness (DSH) ACP 桥接的本地分支插件：在原有 `@deepseek-ai/dsh-acp` 之上，为 ACP 客户端多暴露**一个 Mode 选择器**，把 DSH 自己的权限预设与计划模式合并成一档可选模式。

主要面向 **Tern** 这类支持 `session/set_mode`（或 `category: "mode"` 配置项）但无法在自定义 agent 里配置模式的客户端：官方 `acp` profile 只做自动化桥接，`session/new` 不返回 `modes`，所以 Tern 里 DSH 一直没有模式可选。

---

## 模式映射

| 模式 id | 显示名 | DSH 权限预设 | 计划模式 |
| --- | --- | --- | --- |
| `default` | 默认 | `workspace-write`（工作区内读写 + 询问） | 关 |
| `plan` | 计划 | `workspace-write` | 开 |
| `full-access` | 完全访问 | `danger-full-access`（不再询问） | 关 |

- 若当前 profile 没有配置 `danger-full-access` 预设，`full-access` 不会出现在可选列表里；同理，没有 `workspace-write` 时回退到该 profile 的 `defaultPreset`。
- 模式**不单独存储**，每次都从 DSH 的 `permissionPresets.current(session)` 与 `planMode.get(agent)` 推导。因此 Tern、TUI、Web、桌面端看到的是同一个状态，`session/close` 之后 `session/resume` 也能恢复。
- 切到 `plan` 时若正处于一轮对话中，`planMode` 的 pending 值也计入推导，UI 会立即显示 `plan`。

## ACP 表面

同一状态通过两条通道暴露，客户端用哪条都行：

1. `session/new`、`session/resume` 响应的 `modes: { currentModeId, availableModes }`；
2. 每次 `configOptions` 里追加一个 `{ id: "mode", category: "mode", type: "select", ... }` 选项，可用 `session/set_config_option` 设置。

另提供 `session/set_mode` 方法；状态变化（包括 agent 自己退出计划模式、其他端改了权限预设）会推送：

- `current_mode_update`（`sessionUpdate: "current_mode_update"`）
- `config_option_update`（带新的完整 `configOptions`）

推送由 DSH 的持久事件 `plan/mode`、`permission/preset` 驱动，同一状态只推一次。

## 实现方式

`lib/index.js` **不是手写的**，而是由 `sync.mjs` 从当前安装的 dsh 里抽出上游 `dsh-acp` bundle，再按锚点做 10 处改动生成：

- 引入 `lib/modes.js`（纯函数，不依赖 ACP SDK）；
- `configOptions()` 追加模式选项；
- `setConfig("mode", ...)` 路由到模式逻辑；
- 新增 `modeState()` / `setMode()` / `publishMode()`；
- `session/new` 与 `session/resume` 返回 `modes`；
- 注册 `session/set_mode`；
- 监听 `plan/mode` 与 `permission/preset` 事件推送。

每处改动都断言上游文本**恰好匹配一次**：dsh 升级导致上游代码变动时，`sync.mjs` 会直接报 `anchor not found` / `anchor is not unique`，不会静默丢掉功能。

## 安装

```bash
# 1. 挂到 acp profile（写入 dependencies）
dsh plugin --profile acp add file:D:/AIWork/dsh-plugins/dsh-acp-modes

# 2. 生成 lib/index.js 并装进 profile
cd D:/AIWork/dsh-plugins/dsh-acp-modes
node sync.mjs
node install-local.mjs
```

然后在 profile 的 `cordis.patch.yml`（`%USERPROFILE%\.dsh\profiles\acp\cordis.patch.yml`）追加：

```yaml
# 禁用原 acp 桥，插入本地分支插件
- id: acp
  disabled: true
- insert:
    - id: acp-modes
      name: dsh-acp-modes
      inject: [acpAppStartup]
      config:
        provider: deepseek-official
        model: deepseek-v4-flash
```

`config.provider` / `config.model` 只是传给桥接的默认模型，保持与原 `acp` 行一致即可。改完用 `dsh --profile acp --dump-config` 确认 `acp-modes` 行生效。

> 注意：
> - **不能**写成 `- id: acp` + `name: dsh-acp-modes` 来覆盖。补丁里的 `name` 是对已有模块名的断言，dsh 会报 `name mismatch ... skipping` 并跳过整行，必须 `disabled: true` 再 `insert`。
> - `<profile>/node_modules/dsh-acp-modes` **必须是真实目录**，不能是 junction / symlink。Node 会把链接解析到真实路径，而 dsh 只对 profile 目录内的导入者做模块拦截，链接会让 `@deepseek-ai/schemastery` 等裸导入解析失败（`ERR_MODULE_NOT_FOUND`）。`install-local.mjs` 会自动把链接替换成真实副本。

最后重启 dsh ACP 进程（在 Tern 里重开 DSH agent），输入框上方就会出现「模式」选择器。

## dsh 升级之后

```bash
node sync.mjs            # 重新从新版本 dsh-acp 生成
node install-local.mjs   # 覆盖 profile 内的副本
```

- 若 `sync.mjs` 报锚点缺失，说明上游结构变了，按报错里的标签更新 `sync.mjs` 对应改动即可。
- `sync.mjs` 默认自动找最新的 nvmd / npm 安装；也可以 `node sync.mjs --from <...>/dsh-acp/lib/index.js` 指定。
- `package.json` 里没有 `engines` / `peerDependencies`，这是为了让 dsh 的兼容性预检通过；`@deepseek-ai/*` 依赖全部由宿主的模块拦截提供。

## 验证

不依赖 Tern，也可以直接用 ACP 的 JSON-RPC 验证：

1. `initialize` → `session/new`：响应里应有 `modes`（三个 id）和 `configOptions` 里的 `mode` 选项；
2. `session/set_mode` 依次切 `plan` / `full-access` / `default`：每次返回 `{}` 并推送 `current_mode_update` + `config_option_update`；
3. `session/set_config_option(configId: "mode", value: "plan")`：返回的 `configOptions` 中 `mode.currentValue === "plan"`；
4. 切到 `plan` 后 `session/close`，再 `session/resume`：`modes.currentModeId` 仍为 `plan`。

## 恢复原状

1. 从 `cordis.patch.yml` 删掉上面的两行（`- id: acp, disabled: true` 与 `- insert:` 块），原 `acp` 桥即恢复；
2. 从 profile 的 `package.json` 依赖里删掉 `dsh-acp-modes`（或 `dsh plugin --profile acp remove dsh-acp-modes`）；
3. 需要时删除 `<profile>/node_modules/dsh-acp-modes`。

修改前的 `cordis.patch.yml` 与 `package.json` 备份在该 profile 目录下（`*.bak-acp-modes`）。

## 目录结构

```
dsh-acp-modes/
├── lib/
│   ├── index.js       # 由 sync.mjs 生成，勿手改
│   └── modes.js       # 模式推导与写入（纯函数）
├── sync.mjs           # 从已安装 dsh-acp 生成 lib/index.js
├── install-local.mjs  # 把插件真实复制进 <profile>/node_modules
├── package.json
└── README.md
```

## 已知限制

- 依赖 DSH 内部服务 `permissionPresets` 与 `planMode`（非公开 API）。两者缺失时会退化为只读推导：没有 `planMode` 则 `plan` 选择不生效，没有 `permissionPresets` 则只能选 `default`。当前 `acp` profile 两者都由 `dsh-base` 挂载。
- 计划模式的「批准后执行」沿用 DSH 自身的计划审批流程；在 ACP 里表现为普通权限请求，由客户端弹窗处理。
- 模式名与描述是中文硬编码；如需其他语言，改 `lib/modes.js` 后重新执行 `node install-local.mjs`（`sync.mjs` 只在 dsh 升级后需要）。
