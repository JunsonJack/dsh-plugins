# dsh-llm-mmsp —— MMSP 协议转换插件（DSH 原生）

让 DeepSeek Harness **直接用 MMSP 协议**调用 `go.penguin.ooo` 等只开放 MMSP 的上游。

---

## 一句话

`go.penguin.ooo` 把 Anthropic / OpenAI / Google 兼容协议锁在 VIP 后面，普通账号只剩
**MMSP**（Model Message Stream Protocol）。本插件实现 DSH 的 `LlmAdapter` 接口，
在**进程内**把 harness 的消息/工具/思考翻译成 MMSP 请求，把 MMSP 事件流翻译回
harness 的 `StreamChunk`。

```
DSH agent ──harness 消息 + 工具──►  dsh-llm-mmsp 适配器
                                          │  POST {baseURL}/api/v1/stream
                                          │  SSE: data: {json}
                                          ▼
                                   go.penguin.ooo（MMSP）
```

---

## 为什么要做这个插件

`go.penguin.ooo` 把 Anthropic / OpenAI / Google 兼容协议锁在 VIP 后面，**普通账号
只有 MMSP 一种协议**。DSH 原本不支持 MMSP，所以只能靠外部转换层：

```
DSH ──Anthropic 协议──> 转换层 ──MMSP──> penguin
```

本插件把这一层**做进 DSH 内部**——直接实现 `LlmAdapter`，让 DSH 说 MMSP：

```
DSH ──MMSP──> penguin
```

结果：不用起额外进程、不用中间转发、配置面只有 `cordis.patch.yml` 一处，
工具调用 / 思考块 / token 用量都走 harness 原生那一套。

---

## 安装

**接收方请看 `INSTALL.md`**（含环境要求、三种安装方式、配置步骤、排错）。

### 从 tgz 安装

```bash
dsh plugin --profile <你的profile> add ./dsh-llm-mmsp-<版本>.tgz
```

装完重启 DSH。安装后 profile 的 `package.json` → `dsh.profile.bundles` 会加上
`dsh-llm-mmsp`，loader 自动挂载 `cordis.patch.yml` 里的那一行（条目 id `mmsp`）。

### 从源码目录安装（开发用）

把本目录放在任意位置，用 `plugin_manager` 的 `install_bundle` 指向它即可。
profile 会以**软链**引用该目录：

```json
"dsh-llm-mmsp": "link:<你放这个目录的绝对路径>"
```

改动源码后**不需要重装**——软链指向源码目录，改完文件即生效；
需要让 DSH 重新加载模块时，重启 DSH 即可。

---

## 配置

**在界面上改**：设置（左下角齿轮）→ 左侧分区栏的 **MMSP** 页。三个字段直接在
那里编辑，点保存即热生效。

**也可以直接改文件**（等价）：

```yaml
# profile 的 cordis.patch.yml（按 id 覆盖 bundle 的默认行）
- id: mmsp
  config:
    provider: mmsp              # 注册的路由名
    baseURL: https://go.penguin.ooo
    apiKeyEnv: MMSP_API_KEY     # 密钥的**引用**（值走 DSH 凭据库）
```

| 字段 | 默认 | 含义 |
|---|---|---|
| `provider` | `mmsp` | 注册到 `ctx.llm` 的路由名 |
| `baseURL` | `https://go.penguin.ooo` | MMSP 服务端根地址 |
| `apiKeyEnv` | `MMSP_API_KEY` | 单密钥模式的引用名（`keys` 为空时用它） |
| `keys` | `[]` | 多密钥表。**数组顺序 = 优先级**。空则退回单密钥模式 |
| `keyStrategy` | `round-robin` | `round-robin` = 每次换下一个；`priority` = 只用最靠前的 |
| `thinkingSummary` | `true` | 是否请求思考摘要（`config.thinking_summary`）。见下文 |

### 思考等级

档位表直接来自 MMSP 的 `thinking_level` 枚举，**六档全部原样下发**：

| 档位 | 选择器名 | 上游实际行为（实测 2026-10-30） |
|---|---|---|
| `none` | 关闭 | deepseek 系真正关闭（thoughts=0）；Gemini 3.x 跑成"最少思考"；**argon 不支持**（见下） |
| `low` | 低 | 全部模型接受 |
| `medium` | 中 | 全部模型接受 |
| `high` | 高 | 全部模型接受 |
| `xhigh` | 极高 | Gemini 系列上确实比 high 更强（3.5-flash 181→210） |
| `max` | 最高 | 同上（argon 205→221） |

三条要点：

1. **不降级**。早前把 `xhigh`/`max` 压成 `high`（依据是"relay 只认四档"）
   已被实测推翻：六档全接受，且强度真的分层。压平等于丢掉用户选的档位。
2. **`gemini-4-argon` 不声明 `none`**。它收 `none` 会**稳定 400**
   （`Model request failed`，连试 3 次全 400），而 `low` 正常（thoughts=0，
   效果上就是不思考）。所以对该模型选择器里没有「关闭」，且万一被要求
   `none` 也会兜到 `low`。名单写死在 `MODELS_REJECTING_NONE`，一条模型一行，
   **不做子串匹配**（符合 MMSP-RFC-0003 §6.1「请求参数不模糊匹配」）。
3. **`defaultEffort` 刻意不声明**。不写 = 保持上游默认；各模型默认差别很大
   （argon 默认不思考，deepseek-flash 默认 15 个思考 token），写死一个会改变
   用户既有的成本曲线。

### 思考摘要（`thinkingSummary`）

Gemini 系列**不传** `thinking_summary` 时，`thinking.delta` 一个字都不来，
只有 `thoughts_tokens` 在计费——**付了思考的钱却看不到思考**：

| 模型 | 不传 | `thinking_summary: true` |
|---|---|---|
| gemini-3.8-flash | thoughts=59，思考文本 **0 字符** | thoughts=61，**197 字符** |
| gemini-4-argon | thoughts=0，0 字符 | **250 字符** |
| gemini-3.1-pro-preview | thoughts=61，0 字符 | **214 字符** |
| deepseek-flash | 115 字符（无视该键，总是给原始思考） | 97 字符 |

开摘要**不增加** thoughts_tokens（266 vs 261，噪声内），只是把已计费的思考
暴露出来 ⇒ 默认 `true` 是纯收益。只在开了思考（档位不是 `none`）时才带这个键。

relay 只接受**布尔值**：`"auto"` 这类字符串仍会 400（旧结论成立）。

> 密钥值**不进**配置文件（配置里只有引用名）。**在设置页里直接填**就行——见到
> 密钥那一栏，粘贴、点「写入」，下一次请求即生效。也可以手动改凭据库（等价）：
>
> ```yaml
> # <DSH_HOME>/.credentials.yaml   （Windows 默认 %USERPROFILE%\.dsh\.credentials.yaml）
> refs:
>   MMSP_API_KEY: ep_…（实际值）
> ```

用起来就是在模型选择器里选 `mmsp/deepseek-flash` 这类 `<路由>/<模型>` 组合。

### 多密钥：直接粘贴，轮询与优先级

设置页的「密钥」区是一个可拖拽的列表，**顺序就是优先级**：

```
⠿ 1  ● 已配置  MMSP_API_KEY      [已保存（输入新值可更换）]        ⏸ ✕
⠿ 2  ● 已配置  MMSP_API_KEY_2    [已保存（输入新值可更换）]        ⏸ ✕
⠿ 3  ● 已配置  MMSP_API_KEY_3    [已保存（输入新值可更换）]        ⏸ ✕
⠿ 4  ● 已配置  MMSP_API_KEY_4    [已保存（输入新值可更换）]        ⏸ ✕
     ↕ 列表可滚动 —— 一次显示 4 条，共 10 条

     [粘贴密钥]  [添加密钥]
     直接粘贴密钥即可 —— 会自动分配一个内部引用名，不用你起名字。
     [保存顺序]   ← 只有拖过顺序或改过策略时才亮
```

**列表定高滚动**：默认一次显示 **4 条**，超出的部分滚动查看。密钥攒到八九条时
不再把设置页拉成一条长龙、把「添加密钥」挤出视野。超过 4 条时列表下方会出现
`列表可滚动 —— 一次显示 4 条，共 10 条`，免得你以为其余的丢了。

条数由 `lib/client.js` 的 `KEY_LIST_VISIBLE_ROWS` 控制，高度由它和行高常量一起
算出（含行间隙，见那里的注释）。想改 3 或 5 改那一个数字即可。

**你只需要粘贴密钥。** 引用名（`MMSP_API_KEY`、`_2`、`_3`…）由系统自动分配，
只在每行以灰字显示，不需要理解也不用填。粘贴 → 点「添加密钥」→ 立刻可用。

每行右侧只有**两个**图标按钮，每个都**点完即生效**（不用再点保存）：

| 按钮 | 作用 |
|---|---|
| **⏸ / ▶** | 临时停用/启用某条 —— 保留在表里但不参与轮询 |
| **✕** | 删除这一行，**连凭据值一起清掉** |

- **拖拽**任意行调整顺序。顺序改动留在草稿里，点底部「保存顺序」统一提交
  ——一次拖动会连发多个事件，逐次写配置既吵又慢。按钮只在真有改动时才亮。
- **换值**：点输入框粘贴新密钥，行内会就地长出「更换」按钮（旧值不显示，
  所以也就没有「显示/隐藏」按钮 —— 那是必然点不动的死按钮）。
- 启停和删除**立刻写配置**：一条密钥的启停或删除本来就是一个完整意图，
  不该再要一次确认。

> 引用名为什么还必须存在：DSH 的凭据库用「引用名 → 值」的形式存储，
> 插件配置里记的也是引用名而不是值——这样配置文件可以安全地提交/备份。
> 但那层细节不该由你来处理，所以界面上把它降级成了辅助信息。

两种策略：

| 策略 | 行为 | 适用 |
|---|---|---|
| `round-robin`（默认） | 每次请求换下一个可用密钥 | 把负载摊到多个账号，避开单账号限流 |
| `priority` | 始终用最靠前的可用密钥，失败才降级 | 主账号优先，备用只是兜底 |

#### 怎么验证「真的在切换」/ 现在用的是哪条

轮询发生在后台，不给读数就只能靠翻日志。设置页的密钥区因此带一个**实时用量条**：

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  累计成功 16 次   上次用 MMSP_API_KEY_7   下次用 MMSP_API_KEY_8   [刷新]
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘

⠿ 1  ● 已配置  MMSP_API_KEY     [用 10 次]              ⏸ ✕
⠿ 2  ● 已配置  MMSP_API_KEY_2   [用 1 次]  [下一个]      ⏸ ✕
⠿ 3  ● 已配置  MMSP_API_KEY_3   [用 1 次]  [刚用过]      ⏸ ✕
⠿ 5  ● 已配置  MMSP_API_KEY_5   [冷却 42s]              ⏸ ✕
```

每行显示：

- **用 N 次** —— 这条密钥成功服务过多少次请求。轮询生效时，各条会依次增长；
  `priority` 下只有第一条增长。
- **冷却 Ns** —— 因 401/429 进入冷却的剩余秒数，到点自动消失。
- **刚用过 / 下一个** —— 最近一次用的和下一次要用的。

页面每 3 秒自动刷新（标签页切到后台时暂停，不空转）；点「刷新」可立即更新。

**同一份数据也能直接用 HTTP 看**（loopback，免认证）：

```bash
curl http://127.0.0.1:<port>/api/dsh-llm-mmsp/key/usage
```

```json
{"ok":true,"value":{
  "entries":[{"ref":"MMSP_API_KEY","enabled":true,"coolingMs":0,"successes":10}, …],
  "next":"MMSP_API_KEY_8","lastUsed":"MMSP_API_KEY_7","lastUsedAt":1793335376275,
  "total":16,"strategy":"priority"}}
```

> ⚠️ 计数是**内存态**，插件重启后归零——它衡量的是「本次运行以来的使用情况」，
> 不是历史账单。要长期统计请看上游账号后台。

实测（8 条真实密钥、`round-robin`）：一次任务执行含 5 次模型调用，依次用到
`_3 → _4 → _5 → _6 → _7`，各 +1，`next` 推进到 `_8` —— 轮换确实发生。

#### 故障切换只认「密钥的账」

| 失败 | 是否换密钥 | 为什么 |
|---|---|---|
| `AUTH`（401/403） | ✅ 换 | 这个密钥废了 |
| `RATE_LIMIT`（429） | ✅ 换 | 这个密钥限流了 |
| `BAD_REQUEST` | ❌ 不换 | 请求本身有问题，换密钥也一样 |
| `TRANSPORT` | ❌ 不换 | 网络断了，怪不到密钥 |
| `SERVER`（5xx） | ❌ 不换 | 上游故障，交给 harness 的重试策略 |

换密钥只发生在**首帧之前**：一旦开始 yield chunk 就不再换——中途换来源会让同一条
回复混进两个账号的内容。

失败的密钥进入 **60 秒冷却**（`AUTH`/`RATE_LIMIT` 触发），期间跳过，到点自动复活。
全部密钥都在冷却时，会忽略冷却再试一轮，免得把用户彻底挡在门外。

实测（真实上游 + 两个真实密钥）：轮询 `A→B→A→B`、优先级全部用 A、坏 key 自动降级到 B，
三项都通过。

### 密钥是怎么写进去的

浏览器的设置页没有写凭据的 cordis 服务，所以 Host 半边注册了一个 **loopback 路由**
（`lib/index.js` 的 `registerKeyRoute`），由它调 `ctx.credentials.set()`：

```
GET  /api/dsh-llm-mmsp/key/status?ref=A&ref=B   → 批量问配没配（不回传值）
POST /api/dsh-llm-mmsp/key/set    { ref, value } → 写密钥
POST /api/dsh-llm-mmsp/key/unset  { ref }        → 删密钥
```

写的是凭据服务正式的那一半（`CredentialRef` → provider-managed 存储），所以优先级
高于环境变量，且**热生效**——下一次请求就重读，不必重启。

三点约束：

- **只接受本机来源**（`127.0.0.1` / `::1` / `::ffff:127.0.0.1`）。这个路由能改凭据，
  不能暴露到局域网；非本机一律 403。
- `webServer` 是**可选**依赖：headless 部署没有它时路由静默不注册，设置页自动退回
  「改文件」的说明，而不是留一个存不进去的输入框。
- 输入框**只写不读**：`describe()` 只回答配没配，服务端不回传值，所以框里永远是空的，
  占位符提示「已保存（留空表示不修改）」。

### 插件自己的设置页是怎么挂上去的

本插件带一个客户端半边（`lib/client.js`），往 `settings.section` 注册一页
（id `mmsp`，order 60）。配置读写走 `configForms`：

```js
const form = ctx.configForms.get('mmsp');
form.store;              // 快照：{ status, value, writable, revision, … }
await form.set('baseURL', 'https://…');   // 写单字段，内部走 settings.mutate
```

字段落进 `cordis.patch.yml` 的对应条目，**热生效**。

### ⚠️ 四个会让插件"看起来没装上"的坑

症状都是**「插件装了、路由注册了，但界面上找不到 / 页面空白」**：

**1. 没有 `export const Config` → 「设置 → 模型」整行消失**

DSH 的「设置 → 模型 → 提供商」只渲染**有 Config schema** 的条目
（`ctx.settings.describe()` 对每个注册项调 `schema.toJSON()`，没 schema 的
条目直接被跳过）。所以本插件**必须**导出 `Config`——否则它不在那一页里。

`Config` 的 `status` 可以用 `Config.listConfigs` 自查：`"schema"` = 有，
`"absent"` = 没有。

**2. 这个 schemastery 版本没有 `.optional()`、也没有 `z.null()`**

```js
z.string().optional()                    // TypeError: … .optional is not a function
z.union([z.string(), z.null()])           // TypeError: z.null is not a function
```

两种写法都会让**整个条目不激活**（DSH 启动报 `1 entry did not activate`）。
这个版本表达"可为 null"只能用 `z.union([..., z.const(null)])`。

**3. volatile 字段在 `config` 里是**引用**，不是裸值**

标了 `.volatile()` 的字段，`config.baseURL` 拿到的是 `Volatile<T>` 对象
（`cosmokit` 的 `{ get(): T }`），不是字符串。于是
`typeof config.baseURL === 'string'` 为 false → 字段被当成"没配"；
`apiKeyEnv` 同理变成 undefined → 密钥解析不到 → `MISSING_CREDENTIAL` →
`listModels()` 抛错 → **整组模型从目录里消失**（路由还在，但一个模型都列不出来）。

正确读法是 `config.baseURL.get()`。本插件用 `valueOf()` 统一处理（普通值
原样返回，引用则取当前快照），且**每次请求都重读**——改了设置页的上游地址
或密钥引用名，下一次请求就用新值，不必重启。

**4. 客户端半边（`lib/client.js`）的两个致命细节**

写 UI 插件的坑比 Host 侧更难查，因为失败**没有任何报错**——界面上只是什么都
不显示。槽位注册对象会显示 `active: false`，可以用
`cordis_inspect_query`（platform `client`，provider `Slots`，
`listSubTree`）直接查。

- **`inject` 只能列真实存在的 cordis 服务**。客户端服务是
  `slots` / `locale` / `layout` / `sessions` / `theme` / `timer` /
  `workspaces` / `uiWorkspace` / `configForms` 这些。写
  `remote`、`remote.credentials`（那不是 cordis 服务，是页面插件的私有面）
  会让 `apply` **永远等不到依赖、静默不执行**。

  同理，**不要把注册整体包在 `ctx.inject(['configForms'], cb)` 里**——可选
  依赖没就绪时回调根本不跑，表现出来就是"注册了但没内容"。正确做法是把
  `form` 取成可能为 `undefined` 的值，页面主体无条件渲染。

- **`t` 必须显式注入**。槽位选项 `locale: NS` 只对**编译期**登记在
  `LocaleNamespaceMap` 里的命名空间注入 `t`；运行时注册的命名空间不在那张
  表里，拿到的 `t` 是 `undefined`，组件第一句 `t(...)` 就抛 `TypeError`，
  槽位 occupant 随即变 `active: false`。要自己
  `const t = ctx.locale.bind(NS)` 再通过 `inject: () => ({ t })` 传进去。

另外，`__ModuleLoader__` 的 `factory` 只拿到 `require`，**没有 `module`**，
所以导出形态必须是 `return { apply, inject }`，不能写 `module.exports`。

---

## MMSP 协议要点（**全部对 go.penguin.ooo 实测确认**，2026-10-30）

### 线格式

```
端点   POST {baseURL}/api/v1/stream
鉴权   Authorization: Bearer <key>（x-api-key 同时接受）
请求体 {"model": str, "messages": [...], "config": {...}}
响应   SSE，每行 "data: {json}"，以 "data: [DONE]" 结束
事件   delta（带恰好一个 content_item）/ stop（带 usage_metadata + finish_reason）
目录   GET  {baseURL}/api/v1/models  → 任何账号都可列（12 个模型）
```

### config 白名单

只下发这些：`max_tokens` / `system_prompt` / `tools` / `tool_choice` /
`thinking_level` / `thinking_summary` / `prompt_caching` / `fast_mode`。

**实测被拒的**（本插件一律不下发）：

| 键 | 实测结果 |
|---|---|
| `temperature` | 400 `Model request failed` |
| `stop` / `top_p` | 400（relay 转成 `trace_id` 后报「不支持该 config 字段」） |
| `prompt_caching` | 400 `Invalid prompt_caching`（true/false/对象/字符串全拒） |
| `fast_mode: true` | 400（只有 `false` 可用） |
| `thinking_summary: "auto"` | 400（**只接受布尔值**；`true` 被全部 12 个模型接受） |

`thinking_level` 的取值**不被拒**（六档全通），唯一例外是
`gemini-4-argon` + `none` → 400，见上文「思考等级」。

### ⚠️ 实测纠正了三处流传的说法

有资料写"tool_call_id 必须是 provider 签发的 37 字符长格式，短 id 被拒"。
**实测不成立**——真实规则是**按模型家族**分的：

| tool_call_id | deepseek 系 | gemini 系 |
|---|---|---|
| `call_00_ET_` + 任意后缀（含空前缀） | ✅ | ✅ |
| `call_t1` / `t1` / `call_anything_at_all` | ❌ | ✅ |
| `toolu_01…` / uuid / 200 个 a | ❌ | ✅ |
| 空串 | ❌ | ❌ |

⇒ deepseek 系要求 id **以 `call_00_ET_` 开头**（长度无关）。本插件因此把所有
tool-call id 统一归一化成 `call_00_ET_` + 26 位十六进制摘要，对两个家族都安全。
归一化是**幂等**的（已带前缀的原样返回），所以工具结果一定能对上对应的调用。

另两处纠正：

- **"tool_result 必须在同一条 user 消息里带后续文本，否则 Model request failed"**
  —— 不成立。id 合规时，`tool_result` 单独成一条 user 消息，deepseek 与 gemini
  **都接受**。
- **"tool_result 不是首个 item → 报错"** —— **成立**。前面放文本 → 400。
  这条本插件遵守：工具结果消息与紧随其后的用户消息合并，`tool_result` 放在最前。

还有一条实测确认的约束：**对话不能以一条带 tool_call 的 assistant 消息结尾**
→ 400。本插件在请求侧清理这种悬挂调用并补一句继续提示。

### 其它

- **relay 不抓远程图片 URL** → 带 `https://` 的 `image_url.done` 直接 400。
  本插件把 harness 的本地附件读出来内联成 `data:` URI。
- **usage 换算**：`input = cached_tokens + prompt_tokens`，
  `output = thoughts_tokens + response_tokens`。
- **relay 把上游错误一律压成 400 `Model request failed`**，客户端无法区分
  429 限流 / 上下文超长 / 配额耗尽。
- **deepseek 即使发起了工具调用，`finish_reason` 也是 `stop`**。本插件以
  "是否出现过 tool_call" 为准覆写成 `tool-calls`（与官方 `anthropic_official`
  client 一致）。

---

## 验证

### 单元测试（80 例）

```bash
cd <本包目录>
node --test "tests/*.test.js" "tests/*.test.mjs"
```

> `tests/` 不在发布包里（`files` 白名单不含它）。要跑测试请用源码目录。

- `protocol.test.js`（46 例）覆盖请求映射（system / tools / tool_choice / thinking /
  图片 / tool_use / tool_result / id 归一化 / 位置约束 / 悬挂调用清理）与响应解码
  （文本 / 思考 / 工具分片归属 / done 与 delta 去重 / usage / finish 顺序）。
  思考相关的一组专盯**档位不被压平**（`max` 原样发）、**argon 不声明/不发 `none`**、
  以及**摘要只在开了思考时才带**。
- `key-pool.test.js`（25 例）覆盖密钥池：保序规范化、脏数据容错、priority 与
  round-robin 的次序、`enabled:false` 跳过、冷却生效与到期复活、`isKeyFault` 判据，
  以及 `snapshot()` 暴露的使用统计（次数 / 冷却剩余 / 下一条 / 最近使用）。
- `render.test.mjs`（9 例）**用最小 React 替身真实渲染设置页组件**。

> ⚠️ 最后这一组不是可选装饰。本插件的配置表单**两次**出现「界面上完全看不到」，
> 根因都是**组件渲染时抛错**：槽位 occupant 变成 `active: false`，界面什么都不
> 显示，且**没有任何报错**。`node --check` 只查语法，查不出这类问题——最近一次
> 就是 `effective.apiKeyEnv` 被误删后仍被读 `.length`，抛 TypeError 把整页打死。
>
> 所以这组测试专门覆盖「缺字段 / 空列表 / 脏数据 / 只读 / 无表单」这些降级路径。
> 改 UI 代码后先跑它，能第一时间发现「表单又消失了」。

### 多密钥轮询（真实上游，5 项）

```bash
node tests/e2e-rotation.mjs   # 需要 _tmp/mmsp-keys.json 里有两个真实密钥
```

用两个**真实有效**的密钥打真实上游，靠「记录每个 key 被用了几次」而不是看回复
来证明切换发生：

| 检查 | 结果 |
|---|---|
| 两个 key 单独可用 | ✅ |
| `round-robin` 4 次 → `A→B→A→B`，各 2 次 | ✅ |
| `priority` 4 次 → 全用 A | ✅ |
| 首条是坏 key → 自动降级到 B | ✅ |
| 坏 key 进冷却后被跳过 | ✅ |

### 端到端（真实上游，8 例）

```bash
node --import ./tests/stubs/register.mjs tests/e2e-live.mjs
```

`tests/stubs/` 里的替身用 `module.registerHooks()`（**内联**钩子）把
`@deepseek-ai/dsh-llm` 指向本地最小实现，于是**适配器的真实代码**能在普通
node 进程里跑到真实的 go.penguin.ooo 上。

> ⚠️ **为什么不用包的 `node_modules/` shim**：shim 会**遮蔽**真正的
> `@deepseek-ai/dsh-llm`（Node 的解析先找最近的 `node_modules`）——那等于让装进
> DSH 的包带一份假的服务实现。本插件的一次线上验证就是因为它而必须重跑一遍。
> `registerHooks()` 只在本次进程生效，不落盘、不进包。
>
> （Windows 上 `register()` + loader 文件也走不通：相对路径被当成裸路径、
> `file://` URL 被 Node 内部转回裸路径，两者都报
> `ERR_UNSUPPORTED_ESM_URL_SCHEME`。内联钩子没有这一步路径转换。）

```
✅ 模型目录（GET /api/v1/models） — 12 个模型
✅ 简单文本（流式） — finish=stop
✅ system 提示词生效 — text="Ada"
✅ 推理档位 medium 产出 reasoning 块
✅ 工具调用（stop_reason=tool-calls） — get_weather({"location":"Paris"})
✅ 工具结果回灌（多轮工具链）
✅ token 用量上报 — in=31 out=32
✅ 缺密钥时报 MISSING_CREDENTIAL
```

### 思考等级（真实上游，逐档实测）

对每个模型把六档各打一次，看 `thoughts_tokens` 与 `reasoning` 字符数。结论：

| 检查 | 结果 |
|---|---|
| deepseek 系六档全通 | ✅ `none` 真关（0 token），其余档位在 13–30 之间随机浮动 |
| Gemini 六档全通 | ✅ 且**强度真分层**（3.8-flash 的 high=201 / xhigh=204；argon 的 high=135 / xhigh=187） |
| `argon` + `none` | ❌ 稳定 400 ⇒ 已改为不声明该档 + 兜到 `low` |
| `argon` 的 `none` 兜底 | ✅ 现在成功（走 `low`，thoughts=0） |
| 开摘要有无额外 token | ✅ 无显著差异（266 vs 261），只是把已计费的思考显示出来 |
| 关摘要时 Gemini 的思考文本 | ✅ 0 字符（与预期一致，证明该开关真的生效） |
| `thinking.done` 无签名回灌多轮 | ✅ deepseek 与 gemini 都接受；带不带回灌结果一致 |

> 该脚本需要一个真实密钥：设 `MMSP_API_KEY` 环境变量即可。

### DSH 内验证

插件装进 profile 后，用看板执行服务起一个**固定模型**为 `mmsp/deepseek-flash`
的会话，走 DSH 自己的 agent loop：

```
会话日志：assistant/message × 6 · tool/call × 6 · tool/result × 6
消息来源：{"kind":"model","provider":"mmsp","model":"deepseek-flash"}
```

即模型回复、工具调用、工具结果往返**全部经由本插件的协议转换**。

> 另有一个**对照实验**证明路由确实注册到了 `ctx.llm`：用不存在的 provider 名
> 建任务会被拒，报错里列出的可用路由包含 `mmsp`。

---

## 已知限制

1. **relay 把上游错误压成 400**，无法区分 429 / 上下文超长 / 配额耗尽。
2. **`temperature` / `stop` / `top_p` 无法透传**（上游拒绝），这些控制项在本路由上无效。
3. **模型目录没有窗口大小**：`GET /api/v1/models` 只给 id 与 `owned_by`。本插件
   **不编造** `contextWindow`（编一个会让自动压缩在错误阈值触发），交给 harness
   的默认值。
4. **图片必须内联**：relay 不抓远程 URL，所以远程图片这条路径不可用。
5. **vision 模型**：上游目录里有 `gemini-*` 系，实测 `gemini-3.8-flash` 能看图
   （data URI 正常）；但 deepseek 系的 vision 变体未验证。
6. **embedding 模型**（`gemini-embedding-*`）在目录里，但本插件是聊天路由，未适配。

---

## 文件

| 文件 | 作用 |
|---|---|
| `lib/index.js` | 插件入口：读配置、密钥池接线、注册路由、声明可配置 provider、loopback 密钥路由 |
| `lib/client.js` | 浏览器半边：设置页 + 插件页配置卡片（含多密钥拖拽列表） |
| `lib/mmsp-adapter.js` | 适配器：请求组装、SSE 读取、错误映射、逐密钥尝试与故障切换 |
| `lib/mmsp-protocol.js` | **纯函数**协议层：消息 ↔ MMSP、事件 → chunk |
| `lib/key-pool.js` | **纯逻辑**密钥池：优先级排序、轮询游标、60 秒冷却、使用统计 |
| `tests/protocol.test.js` | 协议层单元测试（34 例） |
| `tests/key-pool.test.js` | 密钥池单元测试（25 例） |
| `tests/render.test.mjs` | **渲染冒烟测试**（9 例）：真实执行设置页组件，防「表单消失」 |
| `tests/e2e-live.mjs` | 端到端验证（打真实上游，8 项） |
| `tests/e2e-rotation.mjs` | 多密钥轮询验证（打真实上游，5 项） |
| `tests/stubs/` | `dsh-llm` 的测试替身（`registerHooks` 内联钩子，不进包、不落盘） |

---

## 参考

- MMSP 规范站：<https://mmsp.penguin.ooo/>
- RFC-0002 消息协议：<https://mmsp.penguin.ooo/rfcs/mmsp-rfc-0002-message-protocol/>
- RFC-0009 协议转换：<https://mmsp.penguin.ooo/rfcs/mmsp-rfc-0009-protocol-conversion/>
- 官方 SDK（Apache-2.0）：<https://github.com/Prism-Shadow/model-message-stream-protocol>
