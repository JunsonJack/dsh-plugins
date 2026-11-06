/**
 * QQ 皮肤设置命名空间与类型:dsh 0.2 起设置命名空间就是 profile 条目 id,
 * 客户端经 `ctx.configForms.get(QQ_SKIN_SETTINGS_NS)` 读写宿主条目配置里
 * 的持久化字段(宿主 schema 见 settings-schema.ts,条目声明见 cordis.patch.yml)。
 *
 * 与 `config.ts` 的分工:config.ts 是皮肤自身的配置形状与出厂默认值;
 * settings 形状与之一致(都是 QQSkinConfig 的字段,全部可缺省),
 * 通过 settingsToConfig 合并:设置字段优先,未设置字段回落默认。
 * 0.2 下宿主会把 schema 默认值一并解析进条目配置,故客户端通常拿到完整
 * 分节,合并在缺省/读不到时兜底。
 *
 * ⚠ 本文件保持零运行时依赖(不 import schemastery/react),客户端 bundle
 * 与宿主 schema 均可安全引用;schema 本体放宿主侧(settings-schema.ts)。
 */
import { resolveQQSkinConfig, type QQSkinConfig, type QQSkinPalette } from './config.ts'

/** 设置命名空间 == profile 条目 id(cordis.patch.yml 的 `id`)。 */
export const QQ_SKIN_SETTINGS_NS = 'qq-skin'

/** 设置分节里的持久化字段:形状与 QQSkinConfig 一致,全部可缺省。 */
export interface QQSkinSettings {
  palette?: QQSkinPalette
  bubbleTail?: boolean
  assistantAvatar?: boolean
  chatMaxWidth?: number
  messageSound?: boolean
  typing?: boolean
}

/**
 * 把设置分节合并为完整配置(设置字段优先,缺省回落默认)。
 * @param section - 设置文档分节;undefined 视为未设置。
 * @param fallback - 插件自身配置(apply 第二参),作为设置未覆盖时的底座。
 * @returns 合并后的完整配置。
 */
export function settingsToConfig(
  section: QQSkinSettings | undefined,
  fallback?: Partial<QQSkinConfig>,
): QQSkinConfig {
  const s = section ?? {}
  return resolveQQSkinConfig({
    palette: s.palette ?? fallback?.palette,
    bubbleTail: s.bubbleTail ?? fallback?.bubbleTail,
    assistantAvatar: s.assistantAvatar ?? fallback?.assistantAvatar,
    chatMaxWidth: s.chatMaxWidth ?? fallback?.chatMaxWidth,
    messageSound: s.messageSound ?? fallback?.messageSound,
    typing: s.typing ?? fallback?.typing,
  })
}
