/**
 * QQ 皮肤配置:色板变体与布局开关。
 *
 * cordis 函数插件以 `(ctx, config)` 调用,`apply` 收到的第二参即为配置。
 * 为避免引入 schemastery 依赖(workspace 内不可用),这里用纯 TS 类型 +
 * 默认值合并实现:未提供的字段回落到 `QQ_SKIN_DEFAULT_CONFIG`,非法值在
 * 合并时兜底为默认值,保证任何畸形输入都不会让皮肤挂掉。
 */

/** 可选色板:经典蓝(默认)/ 炫彩紫 / 简洁白 / 经典绿气泡 / 深空黑 / QQ蓝 / 自定义主色。 */
export const QQ_SKIN_PALETTES = ['classic', 'vivid', 'clean', 'green', 'black', 'qqblue', 'custom'] as const

/** 色板标识。 */
export type QQSkinPalette = (typeof QQ_SKIN_PALETTES)[number]

/** 可选企鹅头像装扮:经典官方企鹅(默认)/ 酷黑墨镜企鹅 / 温暖围巾冬日企鹅。 */
export const QQ_AVATAR_STYLES = ['classic', 'sunglasses', 'scarf'] as const

/** 企鹅头像装扮标识。 */
export type QQAvatarStyle = (typeof QQ_AVATAR_STYLES)[number]

/** 消息密度档位:normal=标准呼吸感,compact=紧凑(收紧行距与内边距)。 */
export const QQ_SKIN_DENSITIES = ['normal', 'compact'] as const

/** 消息密度档位标识。 */
export type QQSkinDensity = (typeof QQ_SKIN_DENSITIES)[number]

/** 用户可调配置。 */
export interface QQSkinConfig {
  /** 色板变体。 */
  palette: QQSkinPalette
  /** 自定义主色十六进制色值(当 palette 为 custom 时生效,如 #12B7F5)。 */
  customColor: string
  /** 消息密度:normal=标准,compact=紧凑单屏更多消息(默认 normal)。 */
  density: QQSkinDensity
  /** 企鹅头像装扮(classic=经典, sunglasses=墨镜, scarf=围巾)。 */
  avatarStyle: QQAvatarStyle
  /** 自定义助手头像图片(URL 或 data:image/* URI;空串 = 用官方企鹅)。 */
  avatarCustomImage: string
  /** 用户气泡右侧"尾巴"伪元素开关。 */
  bubbleTail: boolean
  /** 助手消息左侧官方 QQ 企鹅头像开关。 */
  assistantAvatar: boolean
  /** 助手头像尺寸(px,16~40;气泡左缘偏移随尺寸自动换算)。 */
  avatarSize: number
  /** 聊天流最大宽度(px)。 */
  chatMaxWidth: number
  /** 侧边栏/顶栏毛玻璃亚克力通透质感(默认关)。 */
  frostedGlass: boolean
  /** 助手消息打字机揭示动效开关(默认开)。 */
  typing: boolean
}

/** 聊天流最大宽度边界限制(px),与宿主 schema 对齐。 */
export const CHAT_MAX_WIDTH_MIN = 480
export const CHAT_MAX_WIDTH_MAX = 1600

/** 助手头像尺寸边界(px):QQ 桌面端观感约 20~24,留出两端余量。 */
export const AVATAR_SIZE_MIN = 16
export const AVATAR_SIZE_MAX = 40
/** 默认头像尺寸(px),与历史版本的写死值一致。 */
export const DEFAULT_AVATAR_SIZE = 22

/** 默认主色十六进制。 */
export const DEFAULT_CUSTOM_COLOR = '#12B7F5'

/**
 * 自定义头像可接受的图片来源:
 * - data:image/* URI(内联,零网络依赖,推荐);
 * - https:// 图片 URL(http:// 不收,避免混合内容与降级风险)。
 */
const AVATAR_IMAGE_DATA_URI = /^data:image\/(png|jpeg|gif|webp|svg\+xml|avif);/i
const AVATAR_IMAGE_HTTPS = /^https:\/\/\S+$/i

/** 默认配置(经典蓝、气泡尾巴、企鹅头像、880px 宽)。 */
export const QQ_SKIN_DEFAULT_CONFIG: QQSkinConfig = {
  palette: 'classic',
  customColor: DEFAULT_CUSTOM_COLOR,
  density: 'normal',
  avatarStyle: 'classic',
  avatarCustomImage: '',
  bubbleTail: true,
  assistantAvatar: true,
  avatarSize: DEFAULT_AVATAR_SIZE,
  chatMaxWidth: 880,
  frostedGlass: false,
  typing: true,
}

/** 规范化十六进制色值:格式错误回落默认 #12B7F5,3位扩展为6位。 */
export function normalizeHexColor(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_CUSTOM_COLOR
  const trimmed = value.trim()
  const match3 = /^#([0-9a-fA-F]{3})$/.exec(trimmed)
  if (match3) {
    const raw = match3[1] ?? ''
    const r = raw.charAt(0)
    const g = raw.charAt(1)
    const b = raw.charAt(2)
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  const match6 = /^#([0-9a-fA-F]{6})$/.exec(trimmed)
  if (match6) {
    return `#${match6[1] ?? ''}`.toUpperCase()
  }
  return DEFAULT_CUSTOM_COLOR
}

/** 规范化助手头像尺寸:非法或<=0回落默认 22,正数钳制在 16~40(px,整数)。 */
function normalizeAvatarSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_AVATAR_SIZE
  }
  return Math.min(AVATAR_SIZE_MAX, Math.max(AVATAR_SIZE_MIN, Math.round(value)))
}

/** 规范化聊天流最大宽度(px):非法或<=0回落默认值,正数范围钳制在 480~1600。 */
function normalizeChatMaxWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return QQ_SKIN_DEFAULT_CONFIG.chatMaxWidth
  }
  return Math.min(CHAT_MAX_WIDTH_MAX, Math.max(CHAT_MAX_WIDTH_MIN, Math.round(value)))
}

/** 规范化自定义头像图片:仅接受 data:image/* URI 或 https:// URL,其余回落空串(用官方企鹅)。 */
export function normalizeAvatarImage(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  return AVATAR_IMAGE_DATA_URI.test(trimmed) || AVATAR_IMAGE_HTTPS.test(trimmed) ? trimmed : ''
}

/** 枚举字段白名单校验:命中则原样采用,否则回落默认值。 */
function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** 布尔字段校验:命中则原样采用,否则回落默认值。 */
function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** 用户可调配置(可选/部分)。显式包含 undefined 以兼容 exactOptionalPropertyTypes。 */
export type PartialQQSkinConfig = {
  [K in keyof QQSkinConfig]?: QQSkinConfig[K] | undefined
}

/** 配置字段清单:两处配置比较(热更新判定)与字段遍历共用,新增字段只改这里。 */
export const QQ_SKIN_CONFIG_FIELDS = [
  'palette',
  'customColor',
  'density',
  'avatarStyle',
  'avatarCustomImage',
  'bubbleTail',
  'assistantAvatar',
  'avatarSize',
  'chatMaxWidth',
  'frostedGlass',
  'typing',
] as const satisfies ReadonlyArray<keyof QQSkinConfig>

/** 两份配置是否等价(逐字段比较以免无谓重挂皮肤层)。 */
export function sameQQSkinConfig(left: QQSkinConfig, right: QQSkinConfig): boolean {
  return QQ_SKIN_CONFIG_FIELDS.every(field => left[field] === right[field])
}

/** 合并用户配置与默认值,非法字段回落默认。 */
export function resolveQQSkinConfig(config?: PartialQQSkinConfig): QQSkinConfig {
  const raw = config ?? {}
  const def = QQ_SKIN_DEFAULT_CONFIG
  return {
    palette: pickEnum(raw.palette, QQ_SKIN_PALETTES, def.palette),
    customColor: normalizeHexColor(raw.customColor),
    density: pickEnum(raw.density, QQ_SKIN_DENSITIES, def.density),
    avatarStyle: pickEnum(raw.avatarStyle, QQ_AVATAR_STYLES, def.avatarStyle),
    avatarCustomImage: normalizeAvatarImage(raw.avatarCustomImage),
    bubbleTail: pickBool(raw.bubbleTail, def.bubbleTail),
    assistantAvatar: pickBool(raw.assistantAvatar, def.assistantAvatar),
    avatarSize: normalizeAvatarSize(raw.avatarSize),
    chatMaxWidth: normalizeChatMaxWidth(raw.chatMaxWidth),
    frostedGlass: pickBool(raw.frostedGlass, def.frostedGlass),
    typing: pickBool(raw.typing, def.typing),
  }
}
