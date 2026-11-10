# magpie-mmsp —— MMSP 协议转换插件（magpie 原生）

让 magpie **直接用 MMSP 协议**调用 `go.penguin.ooo` 等只开放 MMSP 的上游。

---

## 一句话

`go.penguin.ooo` 把 Anthropic / OpenAI / Google 兼容协议锁在 VIP 后面，普通账号只剩
**MMSP**（Model Message Stream Protocol）。本插件声明一个 chat completions 供应商，
在 loader 的自定义 `fetch` 里**进程内**完成双向转换：网关转好的 OpenAI 请求翻译成
MMSP 发给上游，MMSP 的事件流翻译回 chat completions 让 AI SDK 原生解析。

```
magpie agent ──Anthropic──► magpie 网关 ──chat completions──► 本插件 fetch
                                                                  │  翻译请求（白名单 config、id 归一化、tool_result 首位…）
                                                                  │  POST {root}/api/v1/stream
                                                                  │  SSE: data: {UniEvent} … data: [DONE]
                                                                  ▼
                                                          go.penguin.ooo（MMSP）
```

与 DSH 版（`dsh-llm-mmsp`）的分工完全一致，只是宿主换成了 magpie：
不用起外部转换层，工具调用 / 思考块 / token 用量都走网关原生那一套。

## 安装

```bash
magpie plugin add ./magpie-mmsp     # 文件夹就地加载，不安装任何东西
magpie plugin login mmsp            # 粘贴 Penguin API key
magpie provider test mmsp           # ✓ chat · deepseek-flash
magpie quota                        # 看账号
```

在应用里：**插件 → 添加插件**，填入本文件夹路径，再在 `mmsp` 供应商那一行登录。
之后 agent 就能用 `mmsp/deepseek-flash` 这样的 `<供应商>/<模型>` 组合。

多密钥不需要密钥池：**登录几次就是几个账号**（`mmsp`、`mmsp#xxxxxx`…），
轮询、优先级、冷却、故障切换由 magpie 的原生多账号机制承担——这正是 DSH 版
`key-pool.js` 在 magpie 里不必存在的理由。

## 配置

| 项 | 默认 | 说明 |
|---|---|---|
| 供应商 id | `mmsp` | 在 magpie 设置里可改 `provider.mmsp.api` 换上游根地址 |
| 上游根地址 | `https://go.penguin.ooo` | 端点固定为 `{root}/api/v1/stream` 与 `{root}/api/v1/models`（penguin 带 `/api` 前缀）；也可用环境变量 `MMSP_BASE_URL` |
| 自定义请求头 | 无 | 多行 `Key: Value`、`#`/`//` 注释、JSON、对象都行；见下方「请求头四层来源」 |
| 推理档位 | 不选 = 上游默认 | 模型声明了 `variants: low/medium/high/xhigh/max`，选中的档位经 `reasoning_effort` 直映 `thinking_level`，**不压平**（`minimal` 归 `low`） |

改 `provider.mmsp.api` **立即生效**：每次请求都重读配置，不必重启。

### 请求头四层来源（低 → 高）

1. 环境变量 `MMSP_HEADERS`
2. **插件 options 的 `headers`**——**设置 → 插件 → 「MMSP 设置」面板**写的就是它，
   命令行 `magpie plugin options magpie-mmsp '<json>'` 是同一份；存
   `~/.config/magpie/plugins.json` 的 `plugins[].options`，插件按 mtime + 文件大小
   缓存、每次请求重读，所以**改完立即生效，不必重启插件**
3. config 层的 `provider.mmsp.headers`
4. `providers.json` 里该供应商条目的 `headers` 对象——magpie 只给**自建供应商**渲染
   「高级 → 请求头」那一栏，插件供应商的弹窗里没有它；留着这层是给 magpie 哪天
   给插件供应商也加上时用的

第 4 层的由来：网关不会把 `providers.json` 里那份请求头塞给插件（实测
`init.headers` 只有 `authorization` / `content-type` / `x-magpie-fallback`），
所以插件自己读回来。

### 在 magpie 界面里配（设置页面板）

`package.json` 的 `magpie.panels` 只声明一个面板：`slot: "settings"` →
**设置 → 插件** 那一页，标题「MMSP 设置」。

> **为什么不在供应商弹窗里**：magpie 的供应商编辑器里，「高级 → 请求头」那一栏只由
> `drawEditor` 画出；插件供应商的弹窗走的是另一套渲染路径（有上下文窗口 / 最大输出 /
> 压缩阈值 / 备用 / 代理，但没有请求头）。宿主给供应商编辑器留了
> `magpie.slot("provider", …)` 插槽，但实测插件供应商弹窗不会渲染它（最小探测面板也
> 不出现）。所以面板只能挂在设置页。

面板里可以改上游地址与自定义请求头（每行 `名称: 值`，也收 JSON）、按保存。
面板跑在沙箱 iframe 里，只用 bridge 的 `magpie.options.get/set`，不联网、不碰
magpie 接口；启动时先 `await magpie.ready` 握手，否则宿主 10 秒后会把它判成
「页面停止工作」。面板高度跟内容走（宿主通过 bridge 上报高度）。

请求头怎么真正到上游：插件声明了 **`chat.headers`** 钩子（OpenCode 兼容），magpie
在发每个请求前会依次 `set`：SDK 头 → loader 的 `headers` → 网关请求头 →
`chat.headers`。**最后 set 的赢**，所以自定义头能压过 magpie 自己加的头；钩子里
按 `input.model.providerID !== "mmsp"` 过滤，不会污染别的供应商。

**版本号只在插件这一侧显示**：`package.json` 的 `magpie.name` 是
`MMSP v0.1.5`，插件列表 / 插件弹窗里能看到它，用来确认加载的是不是新代码。
供应商名保持干净的 `MMSP (penguin)`——版本是插件的属性，不该混进供应商条目里。
`tests/panel.test.mjs` 会校验 `magpie.name` 里的版本与 `package.json` 的
`version` 一致，防止升了版本忘了改名。

本地目录插件改了代码要整只重载：`magpie plugin off magpie-mmsp` 再 `on`
（`magpie plugin update` 对本地目录无效）。命令行侧 `magpie plugin` 只打印
`spec` 路径与供应商名（`mmsp (MMSP (penguin), 10 models)`），不带版本。

规则细节（都是实测踩过的坑）：

- **`authorization` 与 `content-type` 由插件接管**：弹窗里配这两个同名头不生效
  ——否则多账号轮询的 key 会被顶掉、JSON 线格式会被改坏，报错极难定位。
  需要额外鉴权方案时配别的头（`api-key`、`x-api-key` 等）没问题。
- **非法头名直接丢弃**：名字含空格/中文等非法字符、值里带换行的行都会被剥掉或
  丢弃，不会让整条请求 502。
- **逐跳头不转发**：`host` / `content-length` / `connection` / `transfer-encoding` /
  `keep-alive` / `te` / `upgrade` / `expect` 由运行时负责，填了也会被剔除。
- **按供应商 id 读取**：只认 `mmsp` 这一条，多账号（`mmsp#xxxxxx`）共用同一份
  弹窗请求头。
- 配置目录固定 `~/.config/magpie`（或 `$XDG_CONFIG_HOME/magpie`）；测试可用
  `MAGPIE_CONFIG_DIR` 环境变量另指一处。

**URL 不要在弹窗里改**：往供应商弹窗的 URL 栏写值会让 magpie 把该供应商当自建
供应商路由，请求到不了插件的 fetch（实测直接 EOF）。换上游根地址请走
`provider.mmsp.api` / 插件 options / `MMSP_BASE_URL`。

## 协议转换要点（对 go.penguin.ooo 实测结论的继承）

线格式来自 MMSP-RFC-0002 / 官方 SDK：`POST {root}/api/v1/stream` 收
`{"model", "messages", "config"}`，回答 SSE（`data: {UniEvent}` 行 + `data: [DONE]`，
keepalive 为 `":"` 注释行）；`GET {root}/api/v1/models` 是 OpenAI 列表形状；
鉴权 `Authorization: Bearer <key>`。

**请求方向（chat completions → MMSP）**：

- **config 白名单下发**：只发 `max_tokens` / `system_prompt` / `tools` / `tool_choice` /
  `thinking_level` / `thinking_summary`。实测被上游拒绝的 `temperature` / `top_p` /
  `stop` / `prompt_caching` / `fast_mode: true` 一律静默丢弃——控制项在本路由上无效。
- **tool_call id 归一化**：deepseek 系要求 id 以 `call_00_ET_` 开头。所有 id（调用与
  结果两侧）统一归一化为 `call_00_ET_` + 26 位十六进制 sha256 摘要，**幂等**，
  对 gemini 系同样安全，工具结果必能对上调用。
- **tool_result 位置约束**：`tool_result` 必须是其 user 消息的**第一个** item。
  连续 tool 消息合并进一条 user 消息，紧随其后的用户文本接在 tool_result 之后。
- **悬挂调用清理**：对话不能以带 tool_call 的 assistant 消息结尾（上游 400）。
  清掉结尾的悬挂调用并补一句 "Please continue."。
- **图片必须内联**：relay 不抓远程 URL。`data:` URI 原样直传；远程地址先抓取转成
  `data:` URI（失败则 400 并说明原因）。工具结果里的图片进 `images` 数组。
- **思考档位**：六档全接受且真的分层，不降级。唯一例外 `gemini-4-argon` 收 `none`
  稳定 400 → 自动兜到 `low`（精确 id 匹配，不做子串匹配）。
- **thinking_summary**：开摘要不增加思考计费，只是把已计费的思考暴露出来（Gemini 系
  不传就一个字都看不到）。除档位为 `none` 外恒为 `true`。
- **usage 换算**：`input = prompt_tokens + cached_tokens`，`output = thoughts_tokens +
  response_tokens`，并附 `prompt_tokens_details.cached_tokens` 与
  `completion_tokens_details.reasoning_tokens`。

**响应方向（MMSP → chat completions）**：

- `text.*` → `delta.content`；`thinking.*` → `delta.reasoning_content` 与
  `delta.reasoning` 双字段（DeepSeek / OpenRouter 两种惯例都能被解析）。
- `tool_call.delta`（首片带 id/name、后续只带 arguments 片段）→ OpenAI `tool_calls`
  增量，按上游 id 归属正确的调用索引；arguments 原样透传（两边都是原始 JSON 串）。
- **done 去重**：done 项携带完整内容，与已发增量一致时不再发，只补差额——
  不会把同一段文字发两遍。
- **finish_reason 覆写**：deepseek 系即使发起了工具调用 `finish_reason` 也是 `stop`
  → 以"是否出现过 tool_call"为准覆写成 `tool_calls`；`length` 原样保留。
- **usage 块**：finish 块之后跟一个 `choices: []` 的 usage 块再 `[DONE]`，
  与 OpenAI `include_usage` 形状一致。
- **错误透传**：流前的错误按上游状态码与原话回给网关（401 标记账号需重登、
  404 视为模型被拒，由 magpie 决定故障切换）；流中错误是一个 `{"error": …}`
  data 事件后跟 `[DONE]`。
- **流中断兜底**：上游没发 stop 就断流时，合成 finish（有工具调用则
  `tool_calls`）并带上已知的 usage。

## 模型列表

登录后 `provider.models` 钩子实时拉 `GET /api/v1/models`（任何账号都可列），每个
账号只承接它列出的模型；失败时保留 config 钩子里的静态兜底列表。`embedding` 模型
被过滤掉（本插件是聊天路由）。**不编造 `limit.context`**——上游不给窗口大小，编一个
会让自动压缩在错误阈值触发，交给网关默认值。

## 已知限制

1. relay 把上游错误一律压成 400 `Model request failed`（个别带原类型），
   客户端无法可靠区分 429 限流 / 上下文超长 / 配额耗尽。
2. `temperature` / `top_p` / `stop` 无法透传（上游拒绝），这些控制项在本路由上无效。
3. 模型目录没有窗口大小与定价：不编造，模型选择器里相应列留空。
4. 图片只支持内联路径；远程图由本插件代抓后内联，抓取失败该请求报 400。
5. `service_tier`（服务档位）未声明：上游的 `fast_mode: true` 实测被拒。

## 验证

```bash
cd magpie-mmsp
node --test tests/     # 54 例
node tests/smoke.mjs   # 入口冒烟：导出、钩子、loader、models 兜底
```

### 怎么确认请求头真的加上了

设环境变量 `MMSP_DEBUG=1` 再发一次请求，插件会把出站请求头打到 stderr
（magpie 的日志里就能看到），`authorization` 永远显示成 `<hidden>`：

```
[mmsp] chat https://go.penguin.ooo/api/v1/stream → {"content-type":"application/json","x-app-url":"https://penguin.ooo/","authorization":"<hidden>"}
```

- `MMSP_DEBUG=0`、`false` 或不设 = 关闭（默认）。
- 打两行分别对应 `chat`（`/api/v1/stream`）与 `models`（`/api/v1/models`）。
- 日志失败不影响请求本身。

- `tests/convert.test.mjs`（15 例）：请求映射——system / max_tokens / 白名单 /
  tools / tool_choice / 思考档位与 argon 兜底 / id 归一化幂等 / tool_result 首位 /
  悬挂调用清理 / 图片内联。
- `tests/stream.test.mjs`（11 例）：响应解码——文本与思考增量、done 去重、
  工具分片归属、finish 覆写、usage 换算、SSE 解析（注释行 / [DONE] / 坏行）。
- `tests/handler.test.mjs`（13 例）：**本地假上游全链路**——真实 fetch + 真实 SSE
  管道，验证上游收到的 MMSP 请求体是干净的（无 temperature、id 已归一化）、
  流式与非流式两条路、错误透传、流中断兜底；另有请求头解析与透传、动态
  baseURL / headers 生效、`MMSP_DEBUG` 开关（开着打一行且隐去密钥、关着静默）。
- `tests/config.test.mjs`（10 例）：magpie 配置的读取——配置目录解析、
  `providers.json` 条目查找（顶层数组与坏文件兜底、mtime 缓存、只认对象形态），
  以及 `plugins.json` 里插件 options 的定位（本地目录 / 包名 / 带版本后缀、
  没有匹配项与坏文件兜底、mtime 刷新）。
- `tests/panel.test.mjs`（5 例）：面板与版本守卫——`package.json` 声明的面板文件
  存在、slot 合法、引用了 `_magpie/bridge.js`；`magpie.name` 里的版本与
  `package.json` 的 `version` 一致；面板与供应商名都不再自带版本号。
- `tests/` 不进发布包（`files` 白名单不含）。

沙箱里试（不应碰到你真正在用的 magpie）：给 magpie 一个单独的 `HOME`，做法见
magpie 文档的「测试」一节。

真实上游联调：设 `MMSP_API_KEY` 环境变量后，把 `tests/handler.test.mjs` 的
假上游换成 `https://go.penguin.ooo` 即可复用同一组断言。

## 文件

| 文件 | 作用 |
|---|---|
| `index.mjs` | 插件入口：声明供应商、auth 方法、loader 接线、模型列表钩子 |
| `lib/mmsp-convert.mjs` | **纯函数**请求层：chat completions 消息 ↔ MMSP、config 白名单、id 归一化 |
| `lib/mmsp-stream.mjs` | **纯逻辑**响应层：SSE 行解析、事件 → chunk 状态机、非流式聚合 |
| `lib/mmsp-fetch.mjs` | 处理层：请求路由、上游调用、错误映射、流式装配 |
| `lib/magpie-config.mjs` | 读 magpie 配置：`providers.json` 里该供应商的 `headers`、`plugins.json` 里本插件的 options（都按 mtime 缓存） |
| `panel/headers.html` | 供应商弹窗里的「MMSP 请求头」面板：改上游地址与请求头，写进插件 options |

## 参考

- MMSP 规范站：<https://mmsp.penguin.ooo/>
- RFC-0002 消息协议：<https://mmsp.penguin.ooo/rfcs/mmsp-rfc-0002-message-protocol/>
- RFC-0009 协议转换：<https://mmsp.penguin.ooo/rfcs/mmsp-rfc-0009-protocol-conversion/>
- 官方 SDK（Apache-2.0）：<https://github.com/Prism-Shadow/model-message-stream-protocol>
- magpie 插件文档：<https://usemagpie.ai/docs/zh/plugins>
- DSH 姊妹版（本插件转换规则的实测来源）：`dsh-llm-mmsp`
