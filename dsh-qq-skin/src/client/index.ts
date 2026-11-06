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
 * 配置 → 用户改写),写回走同一实例的 `set(field, value)`。0.2 的客户端
 * 条目不再收到 config 参数,故出厂默认值只作首帧兜底:配置未到达
 * (status 仍为 loading)时先按默认值上皮肤,到达后热更新切到真实色板。
 *
 * 设置面板:皮肤在设置 General 区注册「QQ 皮肤」设置行(settings-store
 * + settings-row + settings-locales),色板/尾巴/头像/宽度可视化切换;
 * 变更经 ConfigForm 持久化并触发热更新。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls ui-theme 的 ctx.theme 服务声明。
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: pulls renderer 的 ctx.slots 服务声明。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-settings 的 ctx.configForms 服务声明(命名空间配置表单)。
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls locale 服务的 ctx.locale 声明与 LocaleNamespaceMap 合并。
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { QQ_SKIN_DEFAULT_CONFIG, type QQSkinConfig } from './config.ts'
import { QQ_SKIN_SETTINGS_NS, settingsToConfig, type QQSkinSettings } from './settings.ts'
import { createQQSkinRowStore } from './settings-store.ts'
import { zh, en } from './settings-locales.ts'
import type { QQSkinRowInjected } from './settings-row.tsx'
import { QQSkinSettingsRow } from './settings-row.tsx'
import { QQSkinRuntime } from './runtime.ts'
import { QQSoundRuntime } from './qq-sound.ts'

/**
 * 依赖的服务:主题运行时 + 槽位 + 文案 + 设置表单。
 * `configForms` 的读路径随宿主设置描述镜像刷新,故 `remote` 必须一并注入
 * (与 ui-theme 同款),否则跨设备/跨标签的设置变更不会推到这个上下文。
 */
export const inject = ['theme', 'slots', 'locale', 'remote', 'configForms'] as const

/** 用户可调配置(schema 由宿主侧 schema-form 呈现,缺省回落默认)。 */
export type SkinConfig = QQSkinConfig

/** 默认配置(经典蓝色板、气泡尾巴、企鹅头像、880px 宽)。 */
export { QQ_SKIN_DEFAULT_CONFIG }

/** 设置命名空间(== profile 条目 id,跨模块共享)。 */
export { QQ_SKIN_SETTINGS_NS }

/** 两份配置是否等价(字段固定,逐字段比较以免无谓重挂皮肤层)。 */
function sameConfig(left: QQSkinConfig, right: QQSkinConfig): boolean {
  return left.palette === right.palette
    && left.bubbleTail === right.bubbleTail
    && left.assistantAvatar === right.assistantAvatar
    && left.chatMaxWidth === right.chatMaxWidth
    && left.messageSound === right.messageSound
    && left.typing === right.typing
}

/**
 * 挂载 QQ NT 皮肤(布局层 + token 层,经 QQSkinRuntime 统一生命周期),
 * 并注册「QQ 皮肤」设置行 + 设置变更热更新。
 * @param ctx - 客户端插件上下文。
 */
export function apply(ctx: ClientContext): void {
  // 皮肤运行时:两层挂载 + 配置热更新,首帧按出厂默认值上皮肤。
  const runtime = new QQSkinRuntime(ctx, QQ_SKIN_DEFAULT_CONFIG)
  // 音效运行时:监听新增助手节点,按 messageSound 开关启停。
  const sound = new QQSoundRuntime(ctx, runtime.getConfig())

  // 设置表单:宿主条目配置的读写面(值 = 默认值 → profile 配置 → 用户改写)。
  const host = ctx.configForms.get<QQSkinSettings>(QQ_SKIN_SETTINGS_NS)

  // 设置行:store 镜像当前配置,订阅把配置写回 store 并热更新两层。
  const store = createQQSkinRowStore()
  let bound: BoundActions<typeof store> | undefined
  const syncRow = (): void => {
    bound?.sync(runtime.getConfig(), host.getSnapshot().revision ?? -1)
  }
  /** 采用宿主快照:配置未到达(loading/unavailable)时保持出厂默认值。 */
  const adopt = (): void => {
    const section = host.getSnapshot().value
    if (section === undefined) return
    const merged = settingsToConfig(section)
    // 快照在激活时已就绪(与首帧同值)则只同步 store,不重挂两层。
    if (!sameConfig(merged, runtime.getConfig())) {
      runtime.update(merged)
      sound.update(merged)
    }
    syncRow()
  }
  ctx.effect(() => host.subscribe(() => {
    // 首次快照可能在订阅前就已到达,主动 adopt 一次以免停在出厂默认值。
    adopt()
  }), 'dsh-qq-skin: settings adoption')
  adopt()

  // 文案:注册设置行字典。
  ctx.effect(() => ctx.locale.register('dsh-qq-skin.settings', { zh, en }), 'dsh-qq-skin: settings row dictionaries')

  const injected = (actions: BoundActions<typeof store>): QQSkinRowInjected => {
    bound = actions
    syncRow()
    const write = <K extends keyof QQSkinSettings>(field: K, value: QQSkinSettings[K]): void => {
      void host.set(field, value)
    }
    return {
      setPalette: (palette) => write('palette', palette),
      setBubbleTail: (value) => write('bubbleTail', value),
      setAssistantAvatar: (value) => write('assistantAvatar', value),
      setChatMaxWidth: (width) => write('chatMaxWidth', width),
      setMessageSound: (value) => write('messageSound', value),
      setTyping: (value) => write('typing', value),
    }
  }
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'qq-skin',
    order: 12,
    locale: 'dsh-qq-skin.settings',
    store,
    inject: injected,
  }, QQSkinSettingsRow))
}
