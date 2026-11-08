/**
 * QQ 皮肤设置 schema —— 插件自身的 cordis `Config`(schemastery)。
 *
 * dsh 0.2 起设置命名空间不再由插件注册任意字符串:命名空间就是 profile
 * 条目 id(本插件为 `qq-skin`,见 cordis.patch.yml),schema 由 Loader 从宿主
 * 入口模块的 `Config` 导出读取。设置面板只投影 volatile 字段——非 volatile
 * 字段既不出现在描述里也不可写(settings 的 `volatileForm` 直接返回
 * undefined),故每个字段都必须 `.volatile()`。
 *
 * 仅宿主进程引用,客户端 bundle 不 import 本文件(schemastery 是宿主侧依赖,
 * 不进浏览器);浏览器半区经 `ctx.configForms` 读写同一份配置。
 */
import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  QQ_AVATAR_STYLES,
  QQ_SKIN_DENSITIES,
  QQ_SKIN_PALETTES,
  QQ_SKIN_SOUND_VARIANTS,
  type QQAvatarStyle,
  type QQSkinDensity,
  type QQSkinPalette,
  type QQSkinSoundVariant,
} from './client/config.ts'

/** 设置字段的运行时形状:volatile 字段在 Live 配置里以 ref 形式存在。 */
export interface Config {
  /** 色板变体。 */
  palette: Volatile<QQSkinPalette>
  /** 自定义主色十六进制色值(如 #12B7F5)。 */
  customColor: Volatile<string>
  /** 消息密度:normal=标准,compact=紧凑(默认 normal)。 */
  density: Volatile<QQSkinDensity>
  /** 企鹅头像装扮(classic=经典, sunglasses=墨镜, scarf=围巾)。 */
  avatarStyle: Volatile<QQAvatarStyle>
  /** 自定义助手头像图片(URL 或 data:image/* URI;空 = 官方企鹅)。 */
  avatarCustomImage: Volatile<string>
  /** 用户气泡右侧"尾巴"伪元素开关。 */
  bubbleTail: Volatile<boolean>
  /** 助手消息左侧官方 QQ 企鹅头像开关。 */
  assistantAvatar: Volatile<boolean>
  /** 助手头像尺寸(px,16~40)。 */
  avatarSize: Volatile<number>
  /** 聊天流最大宽度(px)。 */
  chatMaxWidth: Volatile<number>
  /** 新助手消息提示音开关(默认关,避免打扰)。 */
  messageSound: Volatile<boolean>
  /** 用户发送消息提示音开关(默认关)。 */
  sendSound: Volatile<boolean>
  /** 提示声音色(beep=经典寻呼机, waterdrop=灵动水滴, knock=清脆敲门)。 */
  soundVariant: Volatile<QQSkinSoundVariant>
  /** 提示音音量(0~1,1=原始合成音量)。 */
  soundVolume: Volatile<number>
  /** 仅在窗口失焦/最小化时发声与抖动(默认关)。 */
  remindOnlyWhenUnfocused: Volatile<boolean>
  /** 免打扰时段起点(HH:mm,空 = 不启用)。 */
  quietHoursStart: Volatile<string>
  /** 免打扰时段终点(HH:mm,空 = 不启用)。 */
  quietHoursEnd: Volatile<string>
  /** 助手消息到达时窗口抖动提醒(默认关)。 */
  windowShake: Volatile<boolean>
  /** 侧边栏/顶栏毛玻璃亚克力通透质感(默认关)。 */
  frostedGlass: Volatile<boolean>
  /** 助手消息打字机揭示动效开关(默认开)。 */
  typing: Volatile<boolean>
  /** 消息时间分隔条开关:跨天消息前插入 QQ 风格日期条(默认开)。 */
  timeDivider: Volatile<boolean>
  /** 聊天区壁纸(https URL 或 data:image/* URI;空 = 关闭)。 */
  chatWallpaper: Volatile<string>
  /** 壁纸暗化程度 0~1(0=原亮度,1=全黑)。 */
  chatWallpaperDim: Volatile<number>
  /** 壁纸模糊 0~20px(0=清晰)。 */
  chatWallpaperBlur: Volatile<number>
  /** 自定义消息提示音(data:audio/* URI 或 https URL;空 = 内置音色)。 */
  customSound: Volatile<string>
}

/** 设置分节 schema:宿主校验条目配置、设置面板渲染表单共用。 */
export const Config = z.object({
  palette: z.union([...QQ_SKIN_PALETTES]).default('classic').volatile(),
  customColor: z.string().default('#12B7F5').volatile(),
  density: z.union([...QQ_SKIN_DENSITIES]).default('normal').volatile(),
  avatarStyle: z.union([...QQ_AVATAR_STYLES]).default('classic').volatile(),
  avatarCustomImage: z.string().default('').volatile(),
  bubbleTail: z.boolean().default(true).volatile(),
  assistantAvatar: z.boolean().default(true).volatile(),
  avatarSize: z.number().min(16).max(40).default(22).volatile(),
  chatMaxWidth: z.number().min(480).max(1600).default(880).volatile(),
  messageSound: z.boolean().default(false).volatile(),
  sendSound: z.boolean().default(false).volatile(),
  soundVariant: z.union([...QQ_SKIN_SOUND_VARIANTS]).default('beep').volatile(),
  soundVolume: z.number().min(0).max(1).default(1).volatile(),
  remindOnlyWhenUnfocused: z.boolean().default(false).volatile(),
  quietHoursStart: z.string().default('').volatile(),
  quietHoursEnd: z.string().default('').volatile(),
  windowShake: z.boolean().default(false).volatile(),
  frostedGlass: z.boolean().default(false).volatile(),
  typing: z.boolean().default(true).volatile(),
  timeDivider: z.boolean().default(true).volatile(),
  chatWallpaper: z.string().default('').volatile(),
  chatWallpaperDim: z.number().min(0).max(1).default(0).volatile(),
  chatWallpaperBlur: z.number().min(0).max(20).default(0).volatile(),
  customSound: z.string().default('').volatile(),
})
