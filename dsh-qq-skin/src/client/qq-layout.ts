/**
 * QQ 经典蓝布局层:以 CSS 注入方式把 harness 三栏客户端改造成经典 QQ 的
 * 会话窗口观感——聊天流居中收窄、用户气泡实色主色 + 白字带"尾巴"、助手
 * 消息左侧头像圆标 + 白色卡片、输入区胶囊化、会话头部细分割线、消息
 * 时间戳与滚动条 QQ 化。与 token 层分工:本层只管几何与结构(圆角、间距、
 * 伪元素头像、卡片描边、尾巴、白字),颜色一律经 `--dsw-*` token
 * (qq-tokens.ts),跟随当前色板(经典蓝/炫彩紫/简洁白/经典绿/深空黑)在
 * 亮暗两态下的高辨识度色板。
 *
 * 样式按配置生成(`buildQQLayoutCss`):气泡尾巴、企鹅头像、聊天流宽度
 * 均可开关/调整,未配置字段回落 `QQ_SKIN_DEFAULT_CONFIG`。
 *
 * 选择器策略:客户端 CSS Modules 的类名模式为 `[hash]_[local]`(本地名
 * 保留在类名尾部),因此 `[class$="_localName"]` 可稳定命中组件内部节点;
 * 结构钩子优先使用组件源码里的 `data-*` 属性(`data-chat-flow`、
 * `data-composer-card`、`data-chat-flow-kind`、`data-time-hover-root`、
 * `data-conversation-scroll` 等),两者均不依赖 hash。会话头部是
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

/** 用户气泡"尾巴"(默认开启时注入,QQ 右侧指向头像的小三角)。 */
function bubbleTailRule(): string {
  return `
[class$='_bubble']::after {
  content: '';
  position: absolute;
  right: -5px;
  bottom: 8px;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--dsw-specific-bubble);
  transform: rotate(45deg);
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

/**
 * 按配置生成 QQ 布局层 CSS。颜色一律走 `--dsw-*` token,几何/开关随
 * 配置变化;所有规则随 <style> 标签移除而还原。
 * @param config - 用户配置(可缺省,回落默认)。
 */
export function buildQQLayoutCss(config: QQSkinConfig = QQ_SKIN_DEFAULT_CONFIG): string {
  const { bubbleTail, assistantAvatar, chatMaxWidth, typing, windowShake, frostedGlass } = config
  // 头像光晕与气泡阴影的主色:custom 色板跟随自定义主色,其余色板保持经典 QQ 蓝。
  const isCustom = config.palette === 'custom'
  const customRgb = isCustom ? parseHexColor(config.customColor) : null
  const glow: [number, number, number] = customRgb ?? [18, 183, 245]
  const shadow: [number, number, number] = customRgb ?? [18, 122, 175]
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
    链接继承白字,避免蓝链接融进蓝底。 */
[class$='_bubble'] {
  position: relative;
  border-radius: 16px 6px 16px 16px;
  color: rgb(255, 255, 255);
  box-shadow: 0 1px 2px rgba(${shadow[0]}, ${shadow[1]}, ${shadow[2]}, 0.12);
}
[class$='_bubble'] a {
  color: inherit;
}
${bubbleTail ? bubbleTailRule() : ''}

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
body[data-ds-dark-theme] [class$='_bubble'] {
  box-shadow: none;
}
${bubbleTail ? `body[data-ds-dark-theme] [class$='_bubble']::after {
  box-shadow: none;
}
` : ''}body[data-ds-dark-theme] [data-composer-card] {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}
/* 暗色下助手卡片背景收暗(bg-layer-1 偏亮),避免整片发白。 */
body[data-ds-dark-theme] [data-chat-flow-kind='assistant-step'] > [data-slot] > [class$='_root'] {
  background: var(--dsw-alias-bg-module-platform);
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
