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
  /** 新助手消息提示音开关(默认关,避免打扰)。 */
  messageSound: boolean
  /** 用户发送消息提示音开关(默认关)。 */
  sendSound: boolean
  /** 提示声音色(beep=经典寻呼机, waterdrop=灵动水滴, knock=清脆敲门)。 */
  soundVariant: QQSkinSoundVariant
  /** 提示音音量(0~1,1=原始合成音量;仅影响本插件的音效,默认 1)。 */
  soundVolume: number
  /** 仅在窗口失焦/最小化时发声与抖动(QQ 习惯;前台新消息保持安静,默认关)。 */
  remindOnlyWhenUnfocused: boolean
  /** 免打扰时段起点(HH:mm,24 小时制;为空表示不启用。支持跨午夜区间)。 */
  quietHoursStart: string
  /** 免打扰时段终点(HH:mm,24 小时制;为空表示不启用。支持跨午夜区间)。 */
  quietHoursEnd: string
  /** 助手消息到达时窗口抖动提醒(默认关)。 */
  windowShake: boolean
  /** 侧边栏/顶栏毛玻璃亚克力通透质感(默认关)。 */
  frostedGlass: boolean
  /** 助手消息打字机揭示动效开关(默认开)。 */
  typing: boolean
  /** 消息时间分隔条开关:跨天消息前插入 QQ 风格日期条(默认开)。 */
  timeDivider: boolean
  /** 聊天区壁纸(https URL 或 data:image/* URI;空串 = 关闭,默认关)。 */
  chatWallpaper: string
  /** 壁纸暗化程度 0~1(0=原亮度,1=全黑;便于阅读消息文字,默认 0)。 */
  chatWallpaperDim: number
  /** 壁纸模糊 0~20px(0=清晰;QQ NT 风格的轻磨砂默认 0)。 */
  chatWallpaperBlur: number
  /** 自定义消息提示音(data:audio/* URI;空串 = 用内置音色 soundVariant)。 */
  customSound: string
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

/** 音量边界:0(静音)~1(原始合成音量)。 */
export const SOUND_VOLUME_MIN = 0
export const SOUND_VOLUME_MAX = 1

/** 免打扰时段默认值:空串 = 不启用。 */
export const DEFAULT_QUIET_HOURS = ''

/** 壁纸暗化边界:0(原亮度)~1(全黑)。 */
export const WALLPAPER_DIM_MIN = 0
export const WALLPAPER_DIM_MAX = 1
/** 壁纸模糊边界(px):0(清晰)~20。 */
export const WALLPAPER_BLUR_MIN = 0
export const WALLPAPER_BLUR_MAX = 20

/**
 * 自定义提示音可接受的来源:
 * - data:audio/* URI(内联,零网络依赖,推荐);
 * - https:// 音频 URL(http:// 不收,避免混合内容与降级风险)。
 */
const CUSTOM_SOUND_DATA_URI = /^data:audio\//i
const CUSTOM_SOUND_HTTPS = /^https:\/\/\S+$/i
/** 自定义提示音数据上限(data URI 体积 512KB,对应原始音频约 384KB:base64 有 4/3 膨胀)。 */
export const CUSTOM_SOUND_MAX_LENGTH = 512 * 1024

/** HH:mm 时间格式(24 小时制,分钟允许 00/15/30/45 等任意 0~59)。 */
const HHMM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * 自定义头像可接受的图片来源:
 * - data:image/* URI(内联,零网络依赖,推荐);
 * - https:// 图片 URL(http:// 不收,避免混合内容与降级风险)。
 */
const AVATAR_IMAGE_DATA_URI = /^data:image\/(png|jpeg|gif|webp|svg\+xml|avif);/i
const AVATAR_IMAGE_HTTPS = /^https:\/\/\S+$/i

/** 默认配置(经典蓝、气泡尾巴、企鹅头像、880px 宽、经典音色)。 */
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
  messageSound: false,
  sendSound: false,
  soundVariant: 'beep',
  soundVolume: 1,
  remindOnlyWhenUnfocused: false,
  quietHoursStart: DEFAULT_QUIET_HOURS,
  quietHoursEnd: DEFAULT_QUIET_HOURS,
  windowShake: false,
  frostedGlass: false,
  typing: true,
  timeDivider: true,
  chatWallpaper: '',
  chatWallpaperDim: 0,
  chatWallpaperBlur: 0,
  customSound: '',
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

/** 规范化提示音音量:非法值回落默认 1,合法值钳制在 [0,1](允许小数)。 */
export function normalizeSoundVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return QQ_SKIN_DEFAULT_CONFIG.soundVolume
  }
  return Math.min(SOUND_VOLUME_MAX, Math.max(SOUND_VOLUME_MIN, value))
}

/** 规范化 HH:mm 时段:空/非串/格式非法回落空串(不启用);合法值原样返回。 */
export function normalizeQuietTime(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_QUIET_HOURS
  const trimmed = value.trim()
  return HHMM_PATTERN.test(trimmed) ? trimmed : DEFAULT_QUIET_HOURS
}

/** 规范化自定义头像图片:仅接受 data:image/* URI 或 https:// URL,其余回落空串(用官方企鹅)。 */
export function normalizeAvatarImage(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  return AVATAR_IMAGE_DATA_URI.test(trimmed) || AVATAR_IMAGE_HTTPS.test(trimmed) ? trimmed : ''
}

/** 规范化聊天壁纸:与头像同规则(https 或 data:image/*),空串 = 关闭。 */
export function normalizeWallpaperImage(value: unknown): string {
  return normalizeAvatarImage(value)
}

/** 规范化壁纸暗化:非法回落 0,合法值钳制在 [0,1]。 */
export function normalizeWallpaperDim(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(WALLPAPER_DIM_MAX, Math.max(WALLPAPER_DIM_MIN, value))
}

/** 规范化壁纸模糊(px):非法回落 0,合法值钳制在 [0,20] 整数。 */
export function normalizeWallpaperBlur(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(WALLPAPER_BLUR_MAX, Math.max(WALLPAPER_BLUR_MIN, Math.round(value)))
}

/** 规范化自定义提示音:仅接受 data:audio/* URI 或 https:// URL,其余回落空串(用内置音色)。 */
export function normalizeCustomSound(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length > CUSTOM_SOUND_MAX_LENGTH) return ''
  return CUSTOM_SOUND_DATA_URI.test(trimmed) || CUSTOM_SOUND_HTTPS.test(trimmed) ? trimmed : ''
}

/**
 * 判定"当前时刻"是否落在免打扰时段内(支持跨午夜,如 22:00→08:00)。
 * 起点或终点任一为空 = 功能未启用,返回 false。
 * @param nowMinutes - 当前时刻(自当日 0 点起的分钟数,便于测试注入)。
 * @param start - 起点 HH:mm。
 * @param end - 终点 HH:mm。
 */
export function isWithinQuietHours(nowMinutes: number, start: string, end: string): boolean {
  const s = normalizeQuietTime(start)
  const e = normalizeQuietTime(end)
  if (!s || !e) return false
  const parse = (t: string): number => {
    const [h, m] = t.split(':')
    return Number(h) * 60 + Number(m)
  }
  const startM = parse(s)
  const endM = parse(e)
  if (startM === endM) return true // 起止相同视为全天免打扰
  // 普通区间(如 09:00→12:00)与跨午夜区间(如 22:00→08:00)分别判定。
  return startM < endM
    ? nowMinutes >= startM && nowMinutes < endM
    : nowMinutes >= startM || nowMinutes < endM
}

/** 当前本地时刻的自 0 点起分钟数(测试可注入 Date,运行时用真实时钟)。 */
export function currentLocalMinutes(date: Date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes()
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
    density: QQ_SKIN_DENSITIES.includes(raw.density as QQSkinDensity)
      ? (raw.density as QQSkinDensity)
      : QQ_SKIN_DEFAULT_CONFIG.density,
    avatarStyle: QQ_AVATAR_STYLES.includes(raw.avatarStyle as QQAvatarStyle)
      ? (raw.avatarStyle as QQAvatarStyle)
      : QQ_SKIN_DEFAULT_CONFIG.avatarStyle,
    avatarCustomImage: normalizeAvatarImage(raw.avatarCustomImage),
    bubbleTail: typeof raw.bubbleTail === 'boolean'
      ? raw.bubbleTail
      : QQ_SKIN_DEFAULT_CONFIG.bubbleTail,
    assistantAvatar: typeof raw.assistantAvatar === 'boolean'
      ? raw.assistantAvatar
      : QQ_SKIN_DEFAULT_CONFIG.assistantAvatar,
    avatarSize: normalizeAvatarSize(raw.avatarSize),
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
    soundVolume: normalizeSoundVolume(raw.soundVolume),
    remindOnlyWhenUnfocused: typeof raw.remindOnlyWhenUnfocused === 'boolean'
      ? raw.remindOnlyWhenUnfocused
      : QQ_SKIN_DEFAULT_CONFIG.remindOnlyWhenUnfocused,
    quietHoursStart: normalizeQuietTime(raw.quietHoursStart),
    quietHoursEnd: normalizeQuietTime(raw.quietHoursEnd),
    windowShake: typeof raw.windowShake === 'boolean'
      ? raw.windowShake
      : QQ_SKIN_DEFAULT_CONFIG.windowShake,
    frostedGlass: typeof raw.frostedGlass === 'boolean'
      ? raw.frostedGlass
      : QQ_SKIN_DEFAULT_CONFIG.frostedGlass,
    typing: typeof raw.typing === 'boolean'
      ? raw.typing
      : QQ_SKIN_DEFAULT_CONFIG.typing,
    timeDivider: typeof raw.timeDivider === 'boolean'
      ? raw.timeDivider
      : QQ_SKIN_DEFAULT_CONFIG.timeDivider,
    chatWallpaper: normalizeWallpaperImage(raw.chatWallpaper),
    chatWallpaperDim: normalizeWallpaperDim(raw.chatWallpaperDim),
    chatWallpaperBlur: normalizeWallpaperBlur(raw.chatWallpaperBlur),
    customSound: normalizeCustomSound(raw.customSound),
  }
}
