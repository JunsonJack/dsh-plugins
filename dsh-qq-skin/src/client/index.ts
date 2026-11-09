/**
 * QQ 皮肤浏览器半区:激活时把 QQ NT 视觉叠加到当前主题上,卸载时由
 * effect 清除。皮肤由两层可逆贡献组成——token 层(qq-tokens.ts,经
 * `ctx.theme.overrideTokens` 叠加 `--dsw-*` 双色值,按配置选色板)与
 * 布局层(qq-layout.ts,注入 QQ NT 会话窗口样式,按配置生成气泡尾巴/
 * 企鹅头像/聊天宽度)。两层由 QQSkinRuntime 统一管理,支持热更新:
 * 配置变更时重挂两层而不重启插件。皮肤不注册新主题 id,也不改用户
 * 偏好;两层都随 effect 清理而完整还原。
 *
 * 设置来源(dsh 0.2):设置命名空间即 profile 条目 id(`qq-skin`),客户端
 * 经 `ctx.configForms.get(...)` 读宿主解析后的条目配置(默认值 → profile
 * 配置 → 用户改写)。0.2 的客户端条目不再收到 config 参数,故出厂默认值
 * 只作首帧兜底:配置未到达(status 仍为 loading)时先按默认值上皮肤,
 * 到达后热更新切到真实色板。写路径:插件页卡片保存时经宿主表单的
 * `mutate(ops, revision)` 原子提交(见 plugin-page.tsx)。
 *
 * 配置入口:插件管理页的「QQ 皮肤」配置卡片(本插件自绘的
 * plugins.row.config 条目,key = `dsh-qq-skin#qq-skin`),读写走宿主
 * `configForms` 的同名命名空间。0.4.7 曾尝试只依赖宿主 schema 表单,
 * 但桌面端并未实现插件页自动表单 UI,配置一度不可见;0.4.8 起以自绘
 * 卡片补上(视觉沿用 0.4.7 下线的旧设置 General 行组件)。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls ui-theme 的 ctx.theme 服务声明。
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: pulls ui-settings 的 ctx.configForms 服务声明(命名空间配置表单)。
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ui-renderer 的 ctx.slots 声明(SlotRegistry + SlotMap 容器)。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls locale 服务的 ctx.locale 声明与 LocaleNamespaceMap 合并。
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: 合并 ui-plugin-manager 的 plugins.row.config 槽声明。
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { QQ_SKIN_DEFAULT_CONFIG, type QQSkinConfig } from './config.ts'
import { QQ_SKIN_SETTINGS_NS, settingsToConfig, type QQSkinSettings } from './settings.ts'
import { QQSkinRuntime } from './runtime.ts'
import { QQSoundRuntime } from './qq-sound.ts'
import { QQTimeDividerRuntime, setTodayLabel } from './qq-time-divider.ts'
import { QQ_SKIN_PLUGIN_NS, zh, en } from './plugin-locales.ts'
import { QQSkinPluginCard } from './plugin-page.tsx'

/**
 * 依赖的服务:主题运行时 + 设置表单 + 槽位 + 文案。`configForms` 的读
 * 路径随宿主设置描述镜像刷新,故 `remote` 必须一并注入(与 ui-theme
 * 同款),否则跨设备/跨标签的设置变更不会推到这个上下文;`slots` 提供
 * 插件管理页配置卡片的注册面,`locale` 注册卡片的双语字典。
 *
 * 注:package.json 的 dsh.client.inject 里列了 @deepseek-ai/dsh-client-
 * connection,那是 `remote` 服务的宿主模块(与官方 ui-theme 的声明
 * 一致);本插件的运行时服务列表(上表)不直接消费 connection。
 */
export const inject = ['theme', 'remote', 'configForms', 'slots', 'locale'] as const

/** 用户可调配置(由插件页配置卡片读写,缺省回落默认)。 */
export type SkinConfig = QQSkinConfig

/** 默认配置(经典蓝色板、气泡尾巴、企鹅头像、880px 宽)。 */
export { QQ_SKIN_DEFAULT_CONFIG }

/** 设置命名空间(== profile 条目 id,跨模块共享)。 */
export { QQ_SKIN_SETTINGS_NS }

/** 插件页配置卡片的槽位 key(`<package name>#<row id>`,row id 与 cordis.patch.yml 声明一致)。 */
export const QQ_SKIN_CONFIG_ROW_KEY = 'dsh-qq-skin#qq-skin'

/** 两份配置是否等价(字段固定,逐字段比较以免无谓重挂皮肤层)。 */
function sameConfig(left: QQSkinConfig, right: QQSkinConfig): boolean {
  return left.palette === right.palette
    && left.customColor === right.customColor
    && left.density === right.density
    && left.avatarStyle === right.avatarStyle
    && left.avatarCustomImage === right.avatarCustomImage
    && left.bubbleTail === right.bubbleTail
    && left.assistantAvatar === right.assistantAvatar
    && left.avatarSize === right.avatarSize
    && left.chatMaxWidth === right.chatMaxWidth
    && left.messageSound === right.messageSound
    && left.sendSound === right.sendSound
    && left.soundVariant === right.soundVariant
    && left.soundVolume === right.soundVolume
    && left.remindOnlyWhenUnfocused === right.remindOnlyWhenUnfocused
    && left.quietHoursStart === right.quietHoursStart
    && left.quietHoursEnd === right.quietHoursEnd
    && left.windowShake === right.windowShake
    && left.frostedGlass === right.frostedGlass
    && left.typing === right.typing
    && left.timeDivider === right.timeDivider
    && left.chatWallpaper === right.chatWallpaper
    && left.chatWallpaperDim === right.chatWallpaperDim
    && left.chatWallpaperBlur === right.chatWallpaperBlur
    && left.wallpaperFull === right.wallpaperFull
}

/** 音效运行时消费的字段:其余字段(色板/宽度/尾巴…)变更不必重建观察链。 */
const SOUND_CONFIG_FIELDS = ['messageSound', 'sendSound', 'soundVariant', 'soundVolume', 'remindOnlyWhenUnfocused', 'quietHoursStart', 'quietHoursEnd', 'windowShake', 'customSound'] as const

/** 两份配置的音效相关字段是否等价(等价时跳过音效链重建)。 */
function sameSoundConfig(left: QQSkinConfig, right: QQSkinConfig): boolean {
  return SOUND_CONFIG_FIELDS.every(field => left[field] === right[field])
}

/**
 * 挂载 QQ NT 皮肤(布局层 + token 层,经 QQSkinRuntime 统一生命周期),
 * 并向插件管理页注册配置卡片 + 设置变更热更新。
 * @param ctx - 客户端插件上下文。
 */
export function apply(ctx: ClientContext): void {
  // 文案字典:插件页卡片与时间分隔条共用的双语键(typed register,缺键编译期报错)。
  ctx.effect(() => ctx.locale.register(QQ_SKIN_PLUGIN_NS, { zh, en }), 'dsh-qq-skin: plugin card dictionaries')
  // 「今天」文案:时间分隔条用;bind 返回活翻译函数,语言切换后跟随。
  const t = ctx.locale.bind(QQ_SKIN_PLUGIN_NS)
  setTodayLabel(() => t('divider.today'))

  // 皮肤运行时:两层挂载 + 配置热更新,首帧按出厂默认值上皮肤。
  const runtime = new QQSkinRuntime(ctx, QQ_SKIN_DEFAULT_CONFIG)
  // 音效运行时:监听新增助手节点,按 messageSound 开关启停。
  const sound = new QQSoundRuntime(ctx, runtime.getConfig())
  // 时间分隔条运行时:跨天消息前插入 QQ 风格日期条,按 timeDivider 启停。
  const divider = new QQTimeDividerRuntime(ctx, runtime.getConfig())

  // 设置表单:宿主条目配置的读写面(值 = 默认值 → profile 配置 → 用户改写)。
  const host = ctx.configForms.get<QQSkinSettings>(QQ_SKIN_SETTINGS_NS)

  /** 上次采用后的完整配置:音效/分隔条各自比较旧值,最后整体刷新。 */
  let lastMerged = runtime.getConfig()
  /** 采用宿主快照:配置未到达(loading/unavailable)时保持出厂默认值。 */
  const adopt = (): void => {
    const section = host.getSnapshot().value
    if (section === undefined) return
    const merged = settingsToConfig(section)
    // 快照在激活时已就绪(与首帧同值)则不重挂两层。
    if (!sameConfig(merged, runtime.getConfig())) {
      runtime.update(merged)
    }
    // 调色等纯视觉变更不重建音效观察链,避免拖拽拾色时反复拆装 observer。
    if (!sameSoundConfig(merged, lastMerged)) {
      sound.update(merged)
    }
    // 分隔条开关变化才重建观察链(日期文案不随配置变,无需比较)。
    if (lastMerged.timeDivider !== merged.timeDivider) {
      divider.update(merged)
    }
    lastMerged = merged
  }
  ctx.effect(() => host.subscribe(() => {
    // 首次快照可能在订阅前就已到达,主动 adopt 一次以免停在出厂默认值。
    adopt()
  }), 'dsh-qq-skin: settings adoption')
  adopt()

  // 插件页配置卡片:keyed 槽位,key = `<package name>#<row id>`;ctx.slots.inject
  // 在宿主页面声明 `plugins.row.config` 时自动提交注册(页面卸载随 effect 清理)。
  ctx.effect(() => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
    name: 'plugins.row.config',
    key: QQ_SKIN_CONFIG_ROW_KEY,
    locale: QQ_SKIN_PLUGIN_NS,
  }, QQSkinPluginCard)), 'dsh-qq-skin: plugin page card')
}
