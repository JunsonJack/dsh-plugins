/**
 * QQ 经典蓝布局层:以 CSS 注入方式把 harness 三栏客户端改造成经典 QQ 的
 * 会话窗口观感——聊天流居中收窄、用户气泡实色主色 + 白字带"尾巴"、助手
 * 消息左侧头像圆标 + 白色卡片、输入区胶囊化、会话头部细分割线、消息
 * 时间戳与滚动条 QQ 化。与 token 层分工:本层只管几何与结构(圆角、间距、
 * 伪元素头像、卡片描边、尾巴、白字),颜色一律经 `--dsw-*` token
 * (qq-tokens.ts),跟随当前色板(经典蓝/炫彩紫/简洁白/经典绿/深空黑/QQ蓝)在
 * 亮暗两态下的高辨识度色板。
 *
 * 样式按配置生成(`buildQQLayoutCss`):气泡尾巴、企鹅头像、聊天流宽度
 * 均可开关/调整,未配置字段回落 `QQ_SKIN_DEFAULT_CONFIG`。
 *
 * 选择器策略:优先使用组件源码里的 `data-*` 属性(`data-chat-flow`、
 * `data-composer-card`、`data-chat-flow-kind`、`data-time-hover-root`、
 * `data-conversation-scroll`、`data-message-bubble` 等),它们与 hash 无关。
 * CSS Modules 类名有两种形态:多数是 `[hash]_[local]`(本地名在尾部,
 * `[class$='_localName']` 可稳定命中),但用户消息气泡所在的
 * @deepseek-ai/dsh-client-ui-primitives 模块是 `_[local]_[hash]`
 * (本地名在开头,如 `_bubble_1sgyj_1`),因此气泡一律走
 * `data-message-bubble` 属性锚点。会话头部是
 * ConversationSession 的 `<header>` 元素(同列各面板的 header 均为 div,
 * 用 `header[class$='_header']` 唯一命中,不误伤 DetailsPanel/TodoPanel)。
 * 暗色变体统一由 `body[data-ds-dark-theme]`(ui-theme 呈现器写入)门控。
 */
import type { Context } from '@deepseek-ai/cordis'
import { getAvatarBackgroundImage } from './qq-avatar.ts'
import { QQ_SKIN_DEFAULT_CONFIG, type QQAvatarStyle, type QQSkinConfig } from './config.ts'
import { parseHexColor } from './qq-tokens.ts'

/** 注入的 <style> 标签归属标识(便于排查与测试断言)。 */
export const QQ_LAYOUT_PLUGIN = 'dsh-qq-skin/layout'

/**
 * 用户消息气泡的稳定选择器。
 *
 * harness 的 CSS Modules 类名形如 `_bubble_1sgyj_1`(本地名在**开头**),
 * 与 `[data-message-bubble][data-message-bubble]`(本地名在结尾)的假设相反——早期版本因此从未命中
 * 真正的用户气泡。UserMessageBubble 组件会把 `data-message-bubble` 属性
 * 透传到该 <div> 上,这是与 hash 无关的稳定锚点,故以它为准。
 *
 * 写法上重复一次属性选择器(`[data-message-bubble][data-message-bubble]`)
 * 以把特异度提到 (0,2,0),稳定压过 harness 的 `.\_bubble_1sgyj_1`
 * (0,1,0)——后者声明 `color: var(--dsw-alias-label-primary)`,正是气泡
 * 文字发黑的根因。
 */
export const QQ_USER_BUBBLE_SELECTOR = '[data-message-bubble][data-message-bubble]'

/** 企鹅头像圆标(默认开启时注入;关闭后无头像,也不占左侧空间;支持墨镜/围巾装扮)。
 * glow 为头像投影的主色 RGB:custom 色板跟随自定义主色,其余色板保持经典 QQ 蓝。 */
function avatarRule(style: QQAvatarStyle = 'classic', glow: [number, number, number] = [18, 183, 245]): string {
  const bgImage = getAvatarBackgroundImage(style)
  const [gr, gg, gb] = glow
  return `
[data-chat-flow-kind='assistant-step'] {
  position: relative;
  margin-left: 36px;
}
[data-chat-flow-kind='assistant-step']::before {
  content: '';
  position: absolute;
  top: 13px;
  left: -36px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background-color: var(--dsw-alias-bg-layer-1);
  background-image: ${bgImage};
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  box-shadow: 0 1px 3px rgba(${gr}, ${gg}, ${gb}, 0.35);
}
`
}

/**
 * 尾巴形状:用二次贝塞尔采样出 QQ 经典"弧形小勾"的裁切多边形。
 * 左边缘贴着气泡(被气泡压住),顶边是一条内凹的弧线向右下延伸,
 * 尖端落在右下角 —— 与 QQ 桌面端"消息气泡右下角的小尾巴"一致。
 */
function tailClipPolygon(): string {
  const p0: [number, number] = [0, 0]
  const p1: [number, number] = [0.88, 0.16]
  const p2: [number, number] = [1, 1]
  const points: string[] = []
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    const inv = 1 - t
    const x = inv * inv * p0[0] + 2 * inv * t * p1[0] + t * t * p2[0]
    const y = inv * inv * p0[1] + 2 * inv * t * p1[1] + t * t * p2[1]
    points.push(`${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`)
  }
  points.push('0% 100%')
  return `polygon(${points.join(', ')})`
}

/**
 * 用户气泡"尾巴"(默认开启时注入,QQ 右侧指向头像的小三角)。
 * @param tailShadow - 尾巴投影的主色 RGB。
 * @param tailBackground - 尾巴底色(与气泡一致;QQ蓝为渐变)。
 * @param isClean - 简洁白色板:气泡有 1px 描边,尾巴需要补一道描边避免接缝。
 */
function bubbleTailRule(
  tailShadow: [number, number, number] = [18, 122, 175],
  tailBackground = 'var(--dsw-specific-bubble)',
  isClean = false,
): string {
  const shadow = `${tailShadow[0]}, ${tailShadow[1]}, ${tailShadow[2]}`
  // 尾巴尖端落在右下角;圆角一致时(QQ蓝)尾巴要下移一点才贴合圆弧。
  const offset = isClean ? 'bottom: 3px;' : 'bottom: 2px;'
  return `
/* ── 气泡尾巴:QQ 经典弧形小勾,贴在气泡右下角指向头像 ────────────────
   形状用 clip-path 画(而不是旋转 45° 的方块):方块尾巴与气泡圆角
   交界会出现硬接缝,弧形裁切则与气泡自然融为一体。
   clip-path 会裁掉 box-shadow,所以阴影改用 filter: drop-shadow。 */
[data-message-bubble][data-message-bubble]::after {
  content: '';
  position: absolute;
  right: -6px;
  ${offset}
  width: 16px;
  height: 16px;
  background: ${tailBackground};
  clip-path: ${tailClipPolygon()};
  filter: drop-shadow(1px 2px 3px rgba(${shadow}, 0.18))${
    isClean
      ? ' drop-shadow(0 0 0.5px var(--dsw-alias-border-l2))'
      : ''
  };
  pointer-events: none;
}
`
}

/** 助手消息打字机揭示(fade-in + 轻微上移,200ms)。 */
function typingRule(): string {
  return `
@keyframes dsh-qq-typing {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
[data-chat-flow-kind='assistant-step'] > [data-slot] > [class$='_root'] {
  animation: dsh-qq-typing 0.2s ease-out;
}
`
}

/** 窗口抖动动效(400ms 经典 QQ 窗口震颤)。 */
function shakeRule(): string {
  return `
@keyframes dsh-qq-shake {
  0%, 100% { transform: translate(0, 0); }
  15% { transform: translate(-3px, 1px); }
  30% { transform: translate(3px, -2px); }
  45% { transform: translate(-3px, -1px); }
  60% { transform: translate(2px, 1px); }
  75% { transform: translate(-1px, 2px); }
  90% { transform: translate(1px, -1px); }
}
.dsh-qq-shaking {
  animation: dsh-qq-shake 0.4s ease-in-out !important;
}
`
}

/** 侧边栏与顶栏毛玻璃亚克力通透质感。 */
function frostedGlassRule(): string {
  return `
[class$='_sidebarCol'],
[class$='_detailsCol'] {
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
body:not([data-ds-dark-theme]) [class$='_sidebarCol'],
body:not([data-ds-dark-theme]) [class$='_detailsCol'] {
  background-color: rgba(242, 245, 248, 0.78) !important;
}
body[data-ds-dark-theme] [class$='_sidebarCol'],
body[data-ds-dark-theme] [class$='_detailsCol'] {
  background-color: rgba(16, 24, 34, 0.78) !important;
}
[data-composer-card] {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: rgba(255, 255, 255, 0.85) !important;
}
body[data-ds-dark-theme] [data-composer-card] {
  background: rgba(20, 29, 41, 0.85) !important;
}
`
}

/* ── Markdown 表格:GitHub / Typora 式表格 UI ─────────────────────────
   背景(harness 自身的 Markdown 表格实现):
   - 每个 Markdown 表格外面都有一层滚动容器 div:
     · ≤3 列 → 类名 `tableFill`,表格 `width:100%`(铺满,随容器折行);
     · ≥4 列 → 类名 `tableScroll` + 字面类名 `md-table-wide`,
       表格 `width:max-content`(按内容撑开),容器 `overflow-x:auto`。
   - 宽表容器额外用容器查询单位算宽:
     `--dsh-table-lead = spare + min(content-width, 100cqw) - 100%`,
     `--dsh-table-spare = max(0, (100cqw - content-width) / 2)`,
     于是宽表容器被算成**比卡片还宽**(让它"溢出到气泡之外"),
     `margin-left:-lead` + `padding-left:lead` 把左边补回来。

   本插件的助手卡片与用户气泡都是 `overflow-x: hidden`(需求:普通文本块
   不出现滚动条),于是 harness 这套"故意超出卡片"的宽表容器被裁掉右侧 →
   用户看到的"少一列/少两列"(本轮要修的核心问题)。

   修复策略:
   1) 把 harness 的撑宽变量归零、宽度压回 100%、margin/padding 复位,
      容器保留 `overflow-x: auto` → 表格超出部分在容器内横向滚动,
      **一列都不少**,也不产生卡片级滚动条;
   2) 不再给 <table> 设 `display:block`——那会把表格盒拆成匿名盒,
      Chromium 直接裁掉右侧列(更早一版"少列"的成因);
   3) 宽度交给 harness 自己的 tableFill / tableScroll 机制决定;
   4) 视觉层做 GitHub/Typora 风:发丝线、圆角、表头浅色带、斑马纹、
      表格内代码渲染成 chip。 */
function markdownTableRule(scope: string, wideScope: string): string {
  return `
${scope} table {
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  font-size: 0.94em;
}
/* 宽表滚动容器去撑宽:宽度压回卡片内,列一个不少,超宽时容器内滚动。 */
${wideScope} .md-table-wide {
  --dsh-table-lead: 0px;
  --dsh-table-spare: 0px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  margin-left: 0;
  padding-left: 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}
${wideScope} .md-table-wide:hover,
${wideScope} .md-table-wide:focus-visible {
  overflow-x: auto;
}
${scope} table th,
${scope} table td {
  padding: 8px 14px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  border-right: 1px solid var(--dsw-alias-border-l1);
}
${scope} table tr > *:last-child {
  border-right: none;
}
${scope} table tbody tr:last-child > * {
  border-bottom: none;
}
${scope} table th {
  background: var(--dsw-alias-bg-layer-2);
  font-weight: 600;
}
${scope} table td {
  white-space: normal;
  overflow-wrap: break-word;
}
${scope} table tbody tr:nth-child(even) td {
  background: var(--dsw-alias-interactive-bg-hover);
}
${scope} table code,
${scope} table kbd,
${scope} table samp {
  display: inline-block;
  max-width: 100%;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  word-break: normal;
  overflow-wrap: normal;
}
`
}

/** 各色板气泡投影的主色(暗色描边层),与 token 层的品牌色保持一致。 */
const PALETTE_SHADOW_RGB: Record<string, [number, number, number]> = {
  classic: [18, 122, 175],
  vivid: [88, 47, 178],
  clean: [120, 137, 155],
  green: [5, 138, 76],
  black: [4, 20, 32],
  qqblue: [22, 60, 138],
}

/**
 * 按配置生成 QQ 布局层 CSS。颜色一律走 `--dsw-*` token,几何/开关随
 * 配置变化;所有规则随 <style> 标签移除而还原。
 * @param config - 用户配置(可缺省,回落默认)。
 */
export function buildQQLayoutCss(config: QQSkinConfig = QQ_SKIN_DEFAULT_CONFIG): string {
  const { bubbleTail, assistantAvatar, chatMaxWidth, typing, windowShake, frostedGlass } = config
  // 头像光晕与气泡阴影的主色:custom 色板跟随自定义主色,其余色板各取本色。
  const isCustom = config.palette === 'custom'
  const customRgb = isCustom ? parseHexColor(config.customColor) : null
  const glow: [number, number, number] = customRgb ?? [18, 183, 245]
  const shadow: [number, number, number] = customRgb ?? PALETTE_SHADOW_RGB[config.palette] ?? [18, 122, 175]
  // QQ蓝色板:还原参考图的均匀圆角与轻微 135° 渐变(仅亮色;渐变起止色
  // 经 parseHexColor 输出 rgb(),遵守布局层不写十六进制色的护栏)。
  const isQqBlue = config.palette === 'qqblue'
  const gradStart: [number, number, number] = parseHexColor('#2C6ED6') ?? [44, 110, 214]
  const gradEnd: [number, number, number] = parseHexColor('#305FCC') ?? [48, 95, 204]
  const gradMid: [number, number, number] = [
    Math.round((gradStart[0] + gradEnd[0]) / 2),
    Math.round((gradStart[1] + gradEnd[1]) / 2),
    Math.round((gradStart[2] + gradEnd[2]) / 2),
  ]
  // 简洁白色板的亮色气泡是纯白底 → 文字改深色(暗色由下方暗色规则拉回白字)。
  const isClean = config.palette === 'clean'
  const bubbleForeground = isClean ? 'rgb(15, 40, 59)' : 'rgb(255, 255, 255)'
  return `
/* ── 消息流:居中收窄,像聊天窗口的画布 ─────────────────────────────── */
[data-chat-flow] {
  max-width: ${chatMaxWidth}px;
  margin: 0 auto;
  padding: 16px 24px 8px;
}
${windowShake ? shakeRule() : ''}
${frostedGlass ? frostedGlassRule() : ''}

/* ── 助手消息:左侧官方 QQ 企鹅头像 + 白色卡片(QQ"对方消息"观感) ──
   harness 的助手节点 kind 是 assistant-step(register-node-renderers
   注册为 'assistant-step'),不是 'assistant';flow item 的
   data-chat-flow-kind 跟随该值。头像为腾讯官方企鹅图形(qq-avatar.ts
   的 data URI,零网络依赖,暗色下同样清晰)。

   ⚠ 选择器必须穿透 renderSlot 的 [data-slot] wrapper(SlotOutlet 用
   display: contents 的锚点 div 包在内容外)——直接子选择器
   > [class$='_root'] 因此从不命中,卡片 padding 从未生效。改为
   > [data-slot] > [class$='_root'] 精确命中 AssistantMarkdown 的
   root(避免误伤嵌套的 ReasoningRow 等同名 root)。头像 top 按
   卡片 padding-top 12px + Think 行高 24px 垂直居中:12 + 12 - 11 = 13。 */
${assistantAvatar ? avatarRule(config.avatarStyle, glow) : ''}
[data-chat-flow-kind='assistant-step'] > [data-slot] > [class$='_root'] {
  border-radius: 16px 16px 16px 6px;
  padding: 12px 16px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 4px 14px rgba(15, 23, 42, 0.05);
}
${typing ? typingRule() : ''}

/* ── Markdown 引用块:主题主色竖条 + 柔和浅底 ───────────────────────── */
[data-chat-flow-kind='assistant-step'] blockquote {
  margin: 8px 0;
  padding: 6px 12px;
  border-left: 3px solid var(--dsw-alias-brand-primary);
  border-radius: 0 6px 6px 0;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}

/* ── Markdown 表格:GitHub / Typora 式表格 UI ────────────────────────
   见 markdownTableRule() 的设计说明:表格是唯一允许横向滚动的区域,
   行内代码整体不折行,避免"文字被折叠"的观感。 */
${markdownTableRule("[data-chat-flow-kind='assistant-step']", "[data-chat-flow-kind='assistant-step']")}
/* 用户气泡里的表格同样不得撑破气泡:表格由 harness 自己的滚动容器
   (tableScroll/.md-table-wide)承担横向滚动,宽度压回气泡内。
   ⚠ 气泡本身不能设 overflow-x: hidden——那会把伸出气泡外侧的
   尾巴(::after)一起裁掉,而且 overflow-x:hidden 会把 overflow-y
   隐式变成 auto,给气泡凭空加出纵向滚动条。 */
${markdownTableRule('[data-message-bubble][data-message-bubble]', '[data-message-bubble][data-message-bubble] .md-table-wide')}
/* 气泡内的表格 chip 底色改用气泡自身的深浅底,避免灰底压在蓝底上。
   简洁白色板的亮色气泡是白底(深字),沿用默认浅色表格样式即可。 */
${isClean ? '' : `
[data-message-bubble][data-message-bubble] table code,
[data-message-bubble][data-message-bubble] table kbd,
[data-message-bubble][data-message-bubble] table samp {
  background: rgba(0, 0, 0, 0.14);
  color: inherit;
}
[data-message-bubble][data-message-bubble] table th {
  background: rgba(0, 0, 0, 0.14);
}
[data-message-bubble][data-message-bubble] table tbody tr:nth-child(even) td {
  background: rgba(255, 255, 255, 0.10);
}
[data-message-bubble][data-message-bubble] table th,
[data-message-bubble][data-message-bubble] table td {
  border-color: rgba(255, 255, 255, 0.22);
}
[data-message-bubble][data-message-bubble] table {
  border-color: rgba(255, 255, 255, 0.22);
}
`}

/* ── 卡片兜底:只做"防外溢",不产生滚动条 ─────────────────────────────
    需求:只有表格区域可以横向滚动;正常不溢出的文字块不应出现任何滚动条。
    因此卡片用 overflow-x: hidden(裁掉溢出,不生成滚动条),而不是 auto;
    长文本改为按词换行(break-word)而不是靠滚动查看。
    代码块 pre 自带 overflow-x: auto,超长代码仍可在块内滚动。 */
[data-chat-flow-kind='assistant-step'] > [data-slot] > [class$='_root'] {
  overflow-x: hidden;
  max-width: 100%;
}
[data-chat-flow-kind='assistant-step'] > [data-slot] > [class$='_root'] :not(pre):not(pre *):not(table):not(table *) {
  overflow-wrap: break-word;
}

/* ── Markdown 代码块:QQ NT 仿窗口三色圆点装饰 ──────────────────────── */
[data-chat-flow-kind='assistant-step'] pre {
  position: relative;
  padding-top: 28px !important;
  border-radius: 8px;
}
[data-chat-flow-kind='assistant-step'] pre::before {
  content: '';
  position: absolute;
  top: 10px;
  left: 12px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 95, 86, 0.85);
  box-shadow: 14px 0 0 rgba(255, 189, 46, 0.85), 28px 0 0 rgba(39, 201, 63, 0.85);
}

/* ── 用户气泡:实色主色底 + 白字(QQ 发送气泡观感)、右上小圆角(尾巴朝
    右侧头像方向)。白字硬编码:实色气泡上深色字不可读;暗色气泡同为深色底,
    白字通用(用 rgb() 而非 #FFF,遵守布局层不写十六进制色的护栏)。气泡内
    链接继承白字,避免蓝链接融进蓝底。简洁白色板是唯一例外:亮色气泡为纯白
    底,必须配深字并描一道发丝边,否则白底白字(暗色仍为深底 → 仍用白字)。 */
[data-message-bubble][data-message-bubble] {
  position: relative;
  border-radius: ${isQqBlue ? '16px' : '16px 6px 16px 16px'};
  color: ${bubbleForeground};
  ${isClean ? 'border: 1px solid var(--dsw-alias-border-l2);' : ''}
  box-shadow:
    0 1px 2px rgba(${shadow[0]}, ${shadow[1]}, ${shadow[2]}, 0.22),
    0 4px 12px rgba(${shadow[0]}, ${shadow[1]}, ${shadow[2]}, 0.18),
    0 8px 20px rgba(${shadow[0]}, ${shadow[1]}, ${shadow[2]}, 0.10),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
}
/* 气泡内文字一律跟随气泡前景色:气泡里的 markdown 正文各元素会从
   --dsw-alias-label-* 取自己的深色,只给气泡容器上色会被子元素覆盖,
   所以逐元素覆盖(:not(pre)/:not(pre *)/:not(code) 排除代码块,
   避免白字压在浅色代码底上)。 */
[data-message-bubble][data-message-bubble] :not(pre):not(pre *):not(code) {
  color: ${bubbleForeground};
}
[data-message-bubble][data-message-bubble] a {
  color: inherit;
}
${isClean ? `/* 简洁白:暗色气泡回到深底,文字回到白字。 */
body[data-ds-dark-theme] [data-message-bubble][data-message-bubble],
body[data-ds-dark-theme] [data-message-bubble][data-message-bubble] :not(pre):not(pre *):not(code) {
  color: rgb(255, 255, 255);
}
` : ''}
${bubbleTail
  ? bubbleTailRule(
      shadow,
      // QQ蓝色板的气泡是 135° 渐变,尾巴只有 16px,直接套同一条渐变会
      // 与气泡里的色块对不上 → 取渐变中点的实色,接缝最自然。
      isQqBlue
        ? `rgb(${gradMid[0]}, ${gradMid[1]}, ${gradMid[2]})`
        : 'var(--dsw-specific-bubble)',
      isClean,
    )
  : ''}
${isQqBlue ? `
/* QQ蓝色板:还原参考图的轻微 135° 渐变(仅亮色;暗色保持实色深底)。 */
body:not([data-ds-dark-theme]) [data-message-bubble][data-message-bubble] {
  background-image: linear-gradient(135deg, rgb(${gradStart[0]}, ${gradStart[1]}, ${gradStart[2]}) 0%, rgb(${gradEnd[0]}, ${gradEnd[1]}, ${gradEnd[2]}) 100%);
}
` : ''}

/* ── 会话头部:QQ 会话窗口顶部的细分割条 ─────────────────────────────
   只命中 ConversationSession 的 <header>(同列面板 header 均为 div,
   header[class$='_header'] 唯一),不误伤 DetailsPanel/TodoPanel。 */
header[class$='_header'] {
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

/* ── 消息时间戳:QQ 风格灰色小圆片(跟随 hover 显隐,只改观感) ─────── */
[data-time-hover-root] [class$='_timeStart'],
[data-time-hover-root] [class$='_timeEnd'] {
  border-radius: 8px;
  padding: 0 8px;
  color: var(--dsw-alias-label-caption);
  background: var(--dsw-alias-bg-module-platform);
}

/* ── 输入区:胶囊化浮层 + 工具栏按钮圆角(QQ 底部输入条) ───────────── */
[data-composer-card] {
  border-radius: 18px;
  box-shadow: 0 2px 10px rgba(14, 22, 32, 0.08);
}
[data-composer-card] [class$='_tools'] button {
  border-radius: 8px;
}
[data-composer-card] [class$='_tools'] button:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

/* ── 滚动条:加宽 + 圆角,QQ NT 手感 ───────────────────────────────── */
[data-conversation-scroll]::-webkit-scrollbar {
  width: 10px;
}
[data-conversation-scroll]::-webkit-scrollbar-thumb {
  border-radius: 6px;
  background: var(--dsw-alias-scrollbar-bg-l1);
}
[data-conversation-scroll]::-webkit-scrollbar-thumb:hover {
  background: var(--dsw-alias-scrollbar-hover-l1);
}

/* ── 侧边栏:会话列表观感——去掉重边框,留一像素淡分割 ──────────────── */
[class$='_sidebarCol'] {
  border-right: 1px solid var(--dsw-alias-border-l1);
}
[class$='_detailsCol'] {
  border-left: 1px solid var(--dsw-alias-border-l2);
}

/* ── 会话列表项:QQ NT 会话行观感 ────────────────────────────────────
   ui-workspace 的行节点是 _sessionRow/_projectRow(CSS Modules 尾部
   匹配),选中态追加 _selected。QQ NT 的会话行是圆角悬停块 + 选中
   浅蓝底,行内状态点(StateDot)已由静态 token 色板接管。 */
[class$='_sessionRow'],
[class$='_projectRow'] {
  border-radius: 8px;
}
[class$='_sessionRow']:hover,
[class$='_projectRow']:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
[class$='_sessionRow'][class$='_selected'],
[class$='_projectRow'][class$='_selected'] {
  background: var(--dsw-specific-sidebar-nav-item-active);
  box-shadow: inset 2px 0 0 var(--dsw-specific-sidebar-nav-item-active-accent);
}
/* 选中会话行右侧小红点角标(QQ NT 会话选中态的视觉点缀;非未读语义)。 */
[class$='_sessionRow'][class$='_selected']::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary);
  transform: translateY(-50%);
}
[class$='_sessionRow'] {
  position: relative;
}
/* 行内状态点:QQ 风格小圆点(色板经 StateDot 的静态 token 已接管)。 */
[class$='_sessionRow'] [class$='_dot'],
[class$='_projectRow'] [class$='_dot'],
[class$='_searchResultRow'] [class$='_dot'] {
  border-radius: 50%;
}

/* ── 品牌区:保持产品原样 ────────────────────────────────────────────
   不隐藏鲸鱼图标、不改字标、不注入 QQ 伪元素——品牌区(sidebar.brand
   的 mark/name 插槽)原样呈现,QQ 感完全由蓝色 token 层体现。 */

/* ── 暗色微调:阴影与伪元素在深底上降噪 ────────────────────────────── */
body[data-ds-dark-theme] [data-message-bubble][data-message-bubble] {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.35),
    0 4px 14px rgba(0, 0, 0, 0.30),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
${bubbleTail
  ? `/* 暗色下尾巴的投影改用中性黑,避免主色阴影在深底上发脏。 */
body[data-ds-dark-theme] [data-message-bubble][data-message-bubble]::after {
  filter: drop-shadow(1px 2px 3px rgba(0, 0, 0, 0.30));
}
`
  : ''}body[data-ds-dark-theme] [data-composer-card] {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}
/* 暗色下助手卡片背景收暗(bg-layer-1 偏亮),避免整片发白。 */
body[data-ds-dark-theme] [data-chat-flow-kind='assistant-step'] > [data-slot] > [class$='_root'] {
  background: var(--dsw-alias-bg-module-platform);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.30),
    0 4px 14px rgba(0, 0, 0, 0.25);
}
/* 暗色下时间戳圆片与头部分割线同样收暗(token 已随暗色变体生效)。 */
body[data-ds-dark-theme] [data-time-hover-root] [class$='_timeStart'],
body[data-ds-dark-theme] [data-time-hover-root] [class$='_timeEnd'] {
  background: var(--dsw-alias-bg-layer-3);
}
`
}

/** 默认配置下的布局 CSS(向后兼容导出,测试与文档沿用)。 */
export const QQ_LAYOUT_CSS = buildQQLayoutCss(QQ_SKIN_DEFAULT_CONFIG)

/**
 * 布局层句柄:持有注入的 `<style>` 标签。热更新走 `set` 原地改写标签
 * 内容(不移除不重建),避免"先拆后建"的中间裸态造成主题闪回默认色
 * 的展示抽搐;`remove` 仅在插件卸载时调用。
 */
export interface QQLayoutLayer {
  /** 原地替换样式内容(同一 `<style>` 标签,无闪屏)。 */
  set: (config?: QQSkinConfig) => void
  /** 移除样式标签。 */
  remove: () => void
}

/**
 * 创建并注入布局层:一个全局 `<style>` 标签 + 原地更新/移除句柄。
 * @param config - 用户配置(气泡尾巴/头像/宽度等,可缺省)。
 * @returns 布局层句柄。
 */
export function createQQLayoutLayer(config?: QQSkinConfig): QQLayoutLayer {
  if (typeof document === 'undefined') return { set: () => {}, remove: () => {} }
  const tag = document.createElement('style')
  tag.dataset.plugin = QQ_LAYOUT_PLUGIN
  tag.textContent = buildQQLayoutCss(config)
  document.head.appendChild(tag)
  return {
    set: (next?: QQSkinConfig) => { tag.textContent = buildQQLayoutCss(next) },
    remove: () => { tag.remove() },
  }
}

/**
 * 创建并注入一个全局 `<style>` 标签,返回移除函数(一次性安装用)。
 * 热更新请走 {@link createQQLayoutLayer} 的原地 `set`。
 * @param config - 用户配置(气泡尾巴/头像/宽度等,可缺省)。
 * @returns 移除该样式标签的清理函数。
 */
export function createQQLayoutTag(config?: QQSkinConfig): () => void {
  return createQQLayoutLayer(config).remove
}

/**
 * 挂载 QQ NT 布局层:注入一个全局 <style> 标签,卸载时随 effect 移除。
 * 注入方式与 ui-theme 的 installThemeStyles 一致(document + ctx.effect),
 * 不依赖任何构建期 CSS 管线——样式以内联字符串打进客户端 bundle。
 * @param ctx - 客户端插件上下文(effect 生命周期)。
 * @param config - 用户配置(气泡尾巴/头像/宽度等,可缺省)。
 */
export function installQQLayout(ctx: Context, config?: QQSkinConfig): void {
  ctx.effect(() => createQQLayoutTag(config), `${QQ_LAYOUT_PLUGIN}: stylesheet`)
}
