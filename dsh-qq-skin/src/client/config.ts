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

/** 可选提示声音色:经典寻呼机 6-beep 方波(默认)/ 灵动水滴 / 清脆敲门。 */
export const QQ_SKIN_SOUND_VARIANTS = ['beep', 'waterdrop', 'knock'] as const

/** 提示声音色标识。 */
export type QQSkinSoundVariant = (typeof QQ_SKIN_SOUND_VARIANTS)[number]

/** 用户可调配置。 */
export interface QQSkinConfig {
  /** 色板变体。 */
  palette: QQSkinPalette
  /** 自定义主色十六进制色值(当 palette 为 custom 时生效,如 #12B7F5)。 */
  customColor: string
  /** 企鹅头像装扮(classic=经典, sunglasses=墨镜, scarf=围巾)。 */
  avatarStyle: QQAvatarStyle
  /** 用户气泡右侧"尾巴"伪元素开关。 */
  bubbleTail: boolean
  /** 助手消息左侧官方 QQ 企鹅头像开关。 */
  assistantAvatar: boolean
  /** 聊天流最大宽度(px)。 */
  chatMaxWidth: number
  /** 新助手消息提示音开关(默认关,避免打扰)。 */
  messageSound: boolean
  /** 用户发送消息提示音开关(默认关)。 */
  sendSound: boolean
  /** 提示声音色(beep=经典寻呼机, waterdrop=灵动水滴, knock=清脆敲门)。 */
  soundVariant: QQSkinSoundVariant
  /** 助手消息到达时窗口抖动提醒(默认关)。 */
  windowShake: boolean
  /** 侧边栏/顶栏毛玻璃亚克力通透质感(默认关)。 */
  frostedGlass: boolean
  /** 助手消息打字机揭示动效开关(默认开)。 */
  typing: boolean
}

/** 聊天流最大宽度边界限制(px),与宿主 schema 对齐。 */
export const CHAT_MAX_WIDTH_MIN = 480
export const CHAT_MAX_WIDTH_MAX = 1600

/** 默认主色十六进制。 */
export const DEFAULT_CUSTOM_COLOR = '#12B7F5'

/** 默认配置(经典蓝、气泡尾巴、企鹅头像、880px 宽、经典音色)。 */
export const QQ_SKIN_DEFAULT_CONFIG: QQSkinConfig = {
  palette: 'classic',
  customColor: DEFAULT_CUSTOM_COLOR,
  avatarStyle: 'classic',
  bubbleTail: true,
  assistantAvatar: true,
  chatMaxWidth: 880,
  messageSound: false,
  sendSound: false,
  soundVariant: 'beep',
  windowShake: false,
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

/** 规范化聊天流最大宽度(px):非法或<=0回落默认值,正数范围钳制在 480~1600。 */
function normalizeChatMaxWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return QQ_SKIN_DEFAULT_CONFIG.chatMaxWidth
  }
  return Math.min(CHAT_MAX_WIDTH_MAX, Math.max(CHAT_MAX_WIDTH_MIN, Math.round(value)))
}

/** 用户可调配置(可选/部分)。显式包含 undefined 以兼容 exactOptionalPropertyTypes。 */
export type PartialQQSkinConfig = {
  [K in keyof QQSkinConfig]?: QQSkinConfig[K] | undefined
}

/** 合并用户配置与默认值,非法字段回落默认。 */
export function resolveQQSkinConfig(config?: PartialQQSkinConfig): QQSkinConfig {
  const raw = config ?? {}
  return {
    palette: QQ_SKIN_PALETTES.includes(raw.palette as QQSkinPalette)
      ? (raw.palette as QQSkinPalette)
      : QQ_SKIN_DEFAULT_CONFIG.palette,
    customColor: normalizeHexColor(raw.customColor),
    avatarStyle: QQ_AVATAR_STYLES.includes(raw.avatarStyle as QQAvatarStyle)
      ? (raw.avatarStyle as QQAvatarStyle)
      : QQ_SKIN_DEFAULT_CONFIG.avatarStyle,
    bubbleTail: typeof raw.bubbleTail === 'boolean'
      ? raw.bubbleTail
      : QQ_SKIN_DEFAULT_CONFIG.bubbleTail,
    assistantAvatar: typeof raw.assistantAvatar === 'boolean'
      ? raw.assistantAvatar
      : QQ_SKIN_DEFAULT_CONFIG.assistantAvatar,
    chatMaxWidth: normalizeChatMaxWidth(raw.chatMaxWidth),
    messageSound: typeof raw.messageSound === 'boolean'
      ? raw.messageSound
      : QQ_SKIN_DEFAULT_CONFIG.messageSound,
    sendSound: typeof raw.sendSound === 'boolean'
      ? raw.sendSound
      : QQ_SKIN_DEFAULT_CONFIG.sendSound,
    soundVariant: QQ_SKIN_SOUND_VARIANTS.includes(raw.soundVariant as QQSkinSoundVariant)
      ? (raw.soundVariant as QQSkinSoundVariant)
      : QQ_SKIN_DEFAULT_CONFIG.soundVariant,
    windowShake: typeof raw.windowShake === 'boolean'
      ? raw.windowShake
      : QQ_SKIN_DEFAULT_CONFIG.windowShake,
    frostedGlass: typeof raw.frostedGlass === 'boolean'
      ? raw.frostedGlass
      : QQ_SKIN_DEFAULT_CONFIG.frostedGlass,
    typing: typeof raw.typing === 'boolean'
      ? raw.typing
      : QQ_SKIN_DEFAULT_CONFIG.typing,
  }
}
