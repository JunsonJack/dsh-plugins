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
import { DEFAULT_AVATAR_SIZE, QQ_SKIN_DEFAULT_CONFIG, type QQAvatarStyle, type QQSkinConfig } from './config.ts'
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

/**
 * 问题回执气泡(ask_user_question 已回答批次)的稳定选择器。
 *
 * QuestionReplyBubble 复用 UserMessageBubble 但**不透传** `data-message-bubble`
 * 属性(asar 反编译确证:lib/types/client/QuestionReplyView.js 中全 app 该属性
 * 只有 MessageItem 的普通用户消息一处),于是以 QQ_USER_BUBBLE_SELECTOR 为锚的
 * 白字/圆角/尾巴规则全部打不到回执气泡——气泡基元 `._bubble_1sgyj_1` 的
 * `color: var(--dsw-alias-label-primary)`(暗色)压在品牌色底上不可读。
 *
 * 回执气泡行节点带 `data-question-reply`(data.callId,组件内唯一),内部唯一的
 * CSS Modules 类是 `BfLV8a_bubble`——本地名 `bubble` 在**结尾**,与主气泡的
 * `_bubble_1sgyj_1`(本地名在开头)相反。`[class$='_bubble']` 因此只命中回执
 * 气泡,且始终以 `[data-question-reply]` 限定作用域,与 hash 无关。
 *
 * 命中依赖 harness 的类拼接顺序:UserMessageBubble 实现
 * `className: de(PI.bubble, e)`——harness 基元类在前、透传 className 在后,
 * 回执气泡 class 值 `_bubble_1sgyj_1 BfLV8a_bubble` 以 `_bubble` 结尾才命中;
 * 普通用户气泡无透传 className,值恰为 `_bubble_1sgyj_1`(结尾 `_1`),不命中。
 * 若 harness 改为 clsx(透传, 基元) 顺序,此选择器会静默失配,升级时留意。
 */
export const QQ_REPLY_BUBBLE_SELECTOR = "[data-question-reply] [class$='_bubble']"

/** 企鹅头像圆标(默认开启时注入;关闭后无头像,也不占左侧空间;支持墨镜/围巾装扮)。
 * glow 为头像投影的主色 RGB:custom 色板跟随自定义主色,其余色板保持经典 QQ 蓝。
 * avatarImage 为自定义头像图片(非空时优先于官方企鹅与装扮层)。 */
function avatarRule(style: QQAvatarStyle = 'classic', glow: [number, number, number] = [18, 183, 245], avatarImage = '', avatarSize: number = DEFAULT_AVATAR_SIZE): string {
  const bgImage = getAvatarBackgroundImage(style, avatarImage)
  const [gr, gg, gb] = glow
  // 尺寸联动:头像变大时气泡整体让出等宽空间,头像垂直位置锚定在
  // 气泡顶部对齐线附近(QQ 桌面端观感),避免大头像顶歪首行文字。
  const size = Math.round(avatarSize)
  const gap = 14 // 头像与气泡的间距(原 36px 偏移 = 22px 头像 + 14px 间距)
  const offset = size + gap
  const top = Math.round(13 + (size - 22) / 2)
  return `
[data-chat-flow-kind='assistant-step'] {
  position: relative;
  margin-left: ${offset}px;
}
[data-chat-flow-kind='assistant-step']::before {
  content: '';
  position: absolute;
  top: ${top}px;
  left: -${offset}px;
  width: ${size}px;
  height: ${size}px;
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
 * 尾巴形状的水平镜像:坐标 x → 100 - x,弧形小勾翻到左下角,
 * 尖端指向左侧头像 —— 助手消息卡片(QQ"对方消息")的左尾巴。
 */
function tailClipPolygonMirrored(): string {
  // ⚠ 末尾只切掉一个 ")" —— 字符串以 ")" 结尾,不是 "polygon)"。
  // 若按 -'polygon)'.length 切 8 个字符,恰好把整个收口点 "0% 100%)"
  // (正好 8 字符)一并切掉:镜像后多边形只剩弧线,首尾沿对角线直线闭合,
  // 填色区域塌成一条细缝,尾巴肉眼不可见(0.5.5 回归,修于 0.5.6)。
  const points = tailClipPolygon()
    .slice('polygon('.length, -1)
    .split(', ')
    .map(pair => {
      const [x, y] = pair.split(' ')
      return `${(100 - Number.parseFloat(x ?? '0')).toFixed(1)}% ${y ?? '0%'}`
    })
  return `polygon(${points.join(', ')})`
}

/**
 * 用户气泡"尾巴"(默认开启时注入,QQ 右侧指向头像的小三角)。
 * @param tailShadow - 尾巴投影的主色 RGB。
 * @param tailBackground - 尾巴底色(与气泡一致;QQ蓝为渐变)。
 * @param isClean - 简洁白色板:气泡有 1px 描边,尾巴需要补一道描边避免接缝。
 * @param selector - 尾巴宿主选择器(默认普通用户气泡;回执气泡传并列锚)。
 */
function bubbleTailRule(
  tailShadow: [number, number, number] = [18, 122, 175],
  tailBackground = 'var(--dsw-specific-bubble)',
  isClean = false,
  selector = QQ_USER_BUBBLE_SELECTOR,
): string {
  const shadow = `${tailShadow[0]}, ${tailShadow[1]}, ${tailShadow[2]}`
  // 尾巴尖端落在右下角;圆角一致时(QQ蓝)尾巴要下移一点才贴合圆弧。
  const offset = isClean ? 'bottom: 3px;' : 'bottom: 2px;'
  return `
/* ── 气泡尾巴:QQ 经典弧形小勾,贴在气泡右下角指向头像 ────────────────
   形状用 clip-path 画(而不是旋转 45° 的方块):方块尾巴与气泡圆角
   交界会出现硬接缝,弧形裁切则与气泡自然融为一体。
   clip-path 会裁掉 box-shadow,所以阴影改用 filter: drop-shadow。 */
${selector}::after {
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

/**
 * 紧凑密度:收紧消息流的垂直呼吸(行间距、卡片内边距、气泡间距),
 * 单屏容纳更多消息;normal 档不注入任何规则(宿主原样)。
 * 选择器只命中本插件已依赖的稳定锚点(data-chat-flow、data-chat-flow-key、
 * data-message-bubble、data-qq-time-divider 与助手卡片链路),不碰宿主
 * 未知的内部间距。
 */
function densityRule(): string {
  return `
[data-chat-flow] {
  padding-top: 8px;
  padding-bottom: 4px;
}
[data-chat-flow] > [data-chat-flow-key] + [data-chat-flow-key] {
  margin-top: 4px;
}
[data-chat-flow-kind='assistant-step'] > [data-slot] > [class$='_root'] {
  padding: 8px 12px;
}
[data-message-bubble][data-message-bubble] {
  padding-top: 6px;
  padding-bottom: 6px;
}
[data-qq-time-divider] {
  margin: 6px 0;
}
`
}

/**
 * 消息时间分隔条:跨天消息前的居中日期条(细线 + 说明文字,QQ NT 原味)。
 * 元素由 qq-time-divider.ts 注入(带 data-qq-time-divider 标记),这里只
 * 负责视觉;文本取自宿主时间 chip 的日期部分,与宿主本地化格式一致。
 */
function timeDividerRule(): string {
  return `
[data-qq-time-divider] {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
  line-height: 20px;
}
[data-qq-time-divider]::before,
[data-qq-time-divider]::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--dsw-alias-border-l1);
}
`
}


/**
 * 助手卡片左尾巴:QQ"对方消息"的弧形小勾,贴在卡片左下角指向头像。
 * 与用户气泡右尾巴同款形状(水平镜像);底色跟随卡片 token(bg-layer-1),
 * 投影取色板主色,与头像光晕同一色源。亮色主题下画布(bg-base)与卡片
 * (bg-layer-1)同为 #fff,白尾巴贴白画布会隐形 —— 追加一道与卡片描边
 * 同色的 0.5px 毛边(简洁白色板气泡尾巴的既有做法),让形状在白底上
 * 依然可辨。头像关闭时尾巴一并停用 —— 尾巴指向头像,没有头像的尾巴
 * 是断箭。
 */
function assistantTailRule(tailShadow: [number, number, number]): string {
  const shadow = `${tailShadow[0]}, ${tailShadow[1]}, ${tailShadow[2]}`
  return `
[data-chat-flow-kind='assistant-step'] > [data-slot] > [class$='_root']::after {
  content: '';
  position: absolute;
  left: -6px;
  bottom: 2px;
  width: 16px;
  height: 16px;
  background: var(--dsw-alias-bg-layer-1);
  clip-path: ${tailClipPolygonMirrored()};
  filter: drop-shadow(-1px 2px 3px rgba(${shadow}, 0.18)) drop-shadow(0 0 0.5px var(--dsw-alias-border-l2));
  pointer-events: none;
}
`
}

/**
 * 无障碍:系统开启"减弱动态效果"(prefers-reduced-motion: reduce)时,
 * 本插件注入的装饰动画(打字机揭示)一律停播,直接呈现最终状态。动画
 * 只是视觉点缀,停掉不影响任何功能;这是操作系统的用户偏好,插件应当尊重。
 */
function reducedMotionRule(): string {
  return `
@media (prefers-reduced-motion: reduce) {
  [data-chat-flow-kind='assistant-step'] > [data-slot] > [class$='_root'] {
    animation: none !important;
  }
}
`
}

/**
 * 毛玻璃亚克力质感:把侧边栏 / 右栏(详情面板) / 输入框做成"有色玻璃面板"。
 *
 * 实现说明(为什么不只是 blur):
 * 桌面端三栏布局里,这三块面板背后都是纯色窗口底,单独 backdrop-filter
 * 对纯色做模糊毫无可见变化(早期版本"开了没变化"的原因)。因此叠加
 * "品牌色晕染渐变(上浓下淡)+ 半透明底 + 顶部/侧缘 1px 内高光"三层,
 * 颜色走 --dsw-alias-brand-primary token,自动跟随色板/自定义主色,
 * 不硬编码任何色板色值(color-mix 与 harness 自身 CSS 同源,Chromium 已支持)。
 *
 * ⚠ 不要给 `_sidebarCol`/`_rightbarCol` 加 backdrop-filter:
 * 左栏折叠按钮(`.wtg9ga_toggle`,data-sidebar-toggle)是 position:fixed
 * 悬浮在窗口左上角标题栏条上的,DOM 上却是侧栏列的后代——backdrop-filter
 * 会把元素变成 fixed 后代的包含块(CSS 规范与 filter/transform 同类),
 * 按钮的定位基准从窗口变成侧栏列,再叠加列的 overflow:hidden,折叠按钮
 * 直接被移位/裁掉(0.3.16 引入的"折叠展开按钮消失"回归的根因)。玻璃观感
 * 由有色渐变底 + 内高光承担即可。
 *
 * ⚠ 输入卡(data-composer-card)同样禁止 backdrop-filter:「添加文件/调用
 * 指令」弹窗(ui-commands 的 PopupSelectView → MenuSurface)DOM 挂在卡内
 * data-composer-overlay 插槽、视觉浮在输入区上方,弹窗自身靠
 * --dsw-menu-surface-fill(约 70% 不透明)+ 自身 backdrop blur 实现玻璃。
 * 祖先卡片带 backdrop-filter 会成为 backdrop root,弹窗的 backdrop blur
 * 失去可模糊的背景 → 弹窗退化为 70% 半透明,直透下方聊天文字,文字重影
 * 看不清。故卡片只保留渐变 + 内高光(0.3.17 已证明玻璃观感由这两者承担)。
 *
 * ⚠ 右栏容器真实类名是 `_rightbarCol`(三栏 grid:sidebarCol=1/1,
 * centerCol=1/2, rightbarCol=1/3)。早期版本写的 `_detailsCol` 在 harness
 * 里不存在,是死选择器,详情栏从未参与毛玻璃。
 */
function frostedGlassRule(): string {
  return `
body:not([data-ds-dark-theme]) [class$='_sidebarCol'],
body:not([data-ds-dark-theme]) [class$='_rightbarCol'] {
  background: linear-gradient(168deg,
    color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, rgba(238, 243, 249, 0.72) 90%) 0%,
    color-mix(in srgb, var(--dsw-alias-brand-primary) 4%, rgba(238, 243, 249, 0.60) 96%) 42%,
    rgba(238, 243, 249, 0.50) 100%) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.65),
    inset 0 -1px 0 rgba(255, 255, 255, 0.28),
    inset 1px 0 0 rgba(255, 255, 255, 0.35);
}
body[data-ds-dark-theme] [class$='_sidebarCol'],
body[data-ds-dark-theme] [class$='_rightbarCol'] {
  background: linear-gradient(168deg,
    color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, rgba(15, 22, 32, 0.72) 84%) 0%,
    color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, rgba(15, 22, 32, 0.60) 93%) 42%,
    rgba(15, 22, 32, 0.50) 100%) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    inset 0 -1px 0 rgba(255, 255, 255, 0.05),
    inset 1px 0 0 rgba(255, 255, 255, 0.07);
}
[data-composer-card] {
  /* 不加 backdrop-filter:会成为 backdrop root,掐死卡内「添加文件/调用
     指令」弹窗自身的 backdrop blur,弹窗只剩 70% 半透明 → 文字重影。 */
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, rgba(255, 255, 255, 0.88) 94%) 0%,
    rgba(255, 255, 255, 0.78) 100%) !important;
  /* 本规则在样式表里先于输入框基础规则(同样声明 box-shadow),
     同特异度下后者会盖掉前者,故高光整条加 !important,
     并把基础外阴影一并并入,避免丢失投影。 */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    0 2px 10px rgba(14, 22, 32, 0.10) !important;
}
body[data-ds-dark-theme] [data-composer-card] {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, rgba(20, 29, 41, 0.88) 90%) 0%,
    rgba(20, 29, 41, 0.78) 100%) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 2px 10px rgba(0, 0, 0, 0.35) !important;
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

   本插件的助手卡片与用户气泡都不设 `overflow-x: hidden`——尾巴 ::after
   要伸出卡片/气泡外侧 6px,设了会连尾巴一起裁掉(0.5.6 的回归)。
   harness 这套"故意超出卡片"的宽表容器靠下面的变量归零 + width:100%
   压回卡片内,容器保留 `overflow-x:auto` 承担横向滚动,一列不少。

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
  const { bubbleTail, assistantAvatar, chatMaxWidth, typing, frostedGlass, timeDivider, density } = config
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
${frostedGlass ? frostedGlassRule() : ''}
${density === 'compact' ? densityRule() : ''}
${reducedMotionRule()}

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
${assistantAvatar ? avatarRule(config.avatarStyle, glow, config.avatarCustomImage, config.avatarSize) : ''}
[data-chat-flow-kind='assistant-step'] > [data-slot] > [class$='_root'] {
  position: relative;
  border-radius: 16px 16px 16px 6px;
  padding: 12px 16px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 4px 14px rgba(15, 23, 42, 0.05);
}
${assistantAvatar ? assistantTailRule(shadow) : ''}
${typing ? typingRule() : ''}
${timeDivider ? timeDividerRule() : ''}

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

/* ── 卡片兜底:宽度压回,不产生滚动条 ─────────────────────────────────
    需求:只有表格区域可以横向滚动;正常不溢出的文字块不应出现任何滚动条。
    ⚠ 卡片根不能设 overflow-x: hidden——尾巴 ::after 要伸出卡片左侧 6px,
    设了会连尾巴一起裁掉(0.5.6 引入、0.5.7 修复的回归)。宽表靠
    .md-table-wide 容器自身 overflow-x:auto 兜底;长文本按词换行
    (break-word)而不是靠滚动查看;代码块 pre 自带 overflow-x: auto,
    超长代码仍可在块内滚动。 */
[data-chat-flow-kind='assistant-step'] > [data-slot] > [class$='_root'] {
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
      // 尾巴底色一律跟随气泡 token:实色色板天然同色;QQ蓝的气泡是
      // 渐变,亮色由下方渐变块把尾巴同步到渐变终点色(尾巴贴合的
      // 右下角正是渐变 100% 处),暗色则回到与气泡相同的实色 token。
      'var(--dsw-specific-bubble)',
      isClean,
    ) + bubbleTailRule(
      shadow,
      'var(--dsw-specific-bubble)',
      isClean,
      QQ_REPLY_BUBBLE_SELECTOR,
    )
  : ''}
${isQqBlue ? `
/* QQ蓝色板:还原参考图的轻微 135° 渐变(仅亮色;暗色保持实色深底)。
   尾巴贴在气泡右下角,该处渐变已走到终点 → 尾巴取同终点实色,
   接缝处零色差(之前取渐变中点,亮绿偏多一眼可见)。 */
body:not([data-ds-dark-theme]) [data-message-bubble][data-message-bubble] {
  background-image: linear-gradient(135deg, rgb(${gradStart[0]}, ${gradStart[1]}, ${gradStart[2]}) 0%, rgb(${gradEnd[0]}, ${gradEnd[1]}, ${gradEnd[2]}) 100%);
}
body:not([data-ds-dark-theme]) [data-message-bubble][data-message-bubble]::after {
  background: rgb(${gradEnd[0]}, ${gradEnd[1]}, ${gradEnd[2]});
}
` : ''}
/* ── 问题回执气泡:与普通用户气泡同观感(全色板通用) ─────────────────
    ask_user_question 的已回答批次由 QuestionReplyBubble 渲染,复用
    UserMessageBubble 却不透传 data-message-bubble(全 asar 该属性仅
    MessageItem 普通用户消息一处)→ 上面的锚打不到它,品牌底上暗字
    不可读。这里以 [data-question-reply] 作用域并列补齐同一套圆角/
    白字/阴影;渐变与暗色回白分别跟随 qqblue/isClean。 */
${QQ_REPLY_BUBBLE_SELECTOR} {
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
${QQ_REPLY_BUBBLE_SELECTOR} :not(pre):not(pre *):not(code) {
  color: ${bubbleForeground};
}
${QQ_REPLY_BUBBLE_SELECTOR} a {
  color: inherit;
}
${isClean ? `/* 简洁白:暗色回执气泡同样回到白字。 */
body[data-ds-dark-theme] ${QQ_REPLY_BUBBLE_SELECTOR},
body[data-ds-dark-theme] ${QQ_REPLY_BUBBLE_SELECTOR} :not(pre):not(pre *):not(code) {
  color: rgb(255, 255, 255);
}
` : ''}
${isQqBlue ? `/* QQ蓝:回执气泡同步 135° 渐变(仅亮色),尾巴取渐变终点实色消接缝。 */
body:not([data-ds-dark-theme]) ${QQ_REPLY_BUBBLE_SELECTOR} {
  background-image: linear-gradient(135deg, rgb(${gradStart[0]}, ${gradStart[1]}, ${gradStart[2]}) 0%, rgb(${gradEnd[0]}, ${gradEnd[1]}, ${gradEnd[2]}) 100%);
}
body:not([data-ds-dark-theme]) ${QQ_REPLY_BUBBLE_SELECTOR}::after {
  background: rgb(${gradEnd[0]}, ${gradEnd[1]}, ${gradEnd[2]});
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
[class$='_rightbarCol'] {
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
body[data-ds-dark-theme] [data-message-bubble][data-message-bubble],
body[data-ds-dark-theme] ${QQ_REPLY_BUBBLE_SELECTOR} {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.35),
    0 4px 14px rgba(0, 0, 0, 0.30),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
${bubbleTail
  ? `/* 暗色下尾巴的投影改用中性黑,避免主色阴影在深底上发脏。 */
body[data-ds-dark-theme] [data-message-bubble][data-message-bubble]::after,
body[data-ds-dark-theme] ${QQ_REPLY_BUBBLE_SELECTOR}::after {
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
