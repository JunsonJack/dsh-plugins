/**
 * QQ 皮肤运行时:持有当前配置,管理 token 层与布局层的挂载/卸载,
 * 支持热更新——配置或设置变更时在不重启插件的前提下重挂两层。
 *
 * 生命周期与 cordis 一致:构造时挂载两层;`update` 原地更新两层(布局改写
 * 同一 `<style>` 标签、token 同源替换),不经中间裸态;插件 dispose 时通过
 * effect 清理完整还原。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls ui-theme 的 ctx.theme 服务声明。
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { resolveQQSkinConfig, type QQSkinConfig } from './config.ts'
import { buildTokenOverrides, QQ_SKIN_SOURCE } from './qq-tokens.ts'
import { createQQLayoutLayer, type QQLayoutLayer } from './qq-layout.ts'

/**
 * QQ 皮肤运行时。
 *
 * 热更新采用原地更新:布局层改写同一 `<style>` 标签内容,token 层以同源
 * `overrideTokens` 替换(ThemeRuntime 对同一 source 执行 Map.set 原地替换,
 * 旧 disposer 自动失效)——不经过"先卸载再挂载"的中间裸态,频繁调色时
 * 主题不会闪回默认色(展示抽搐)。
 */
export class QQSkinRuntime {
  private readonly ctx: ClientContext
  /** 当前生效配置(热更新后保持最新)。 */
  private config: QQSkinConfig
  /** 布局层句柄;未挂载时为 undefined。 */
  private layout: QQLayoutLayer | undefined
  /** token 层 override 清理函数;未挂载时为 undefined。 */
  private removeTokens: (() => void) | undefined

  /**
   * @param ctx - 客户端插件上下文(theme 服务已注入)。
   * @param config - 初始配置(可缺省,回落默认)。
   */
  constructor(ctx: ClientContext, config?: Partial<QQSkinConfig>) {
    this.ctx = ctx
    this.config = resolveQQSkinConfig(config)
    // 插件 dispose 时完整卸载两层;effect 清理即运行时 dispose。
    ctx.effect(() => () => this.dispose(), 'dsh-qq-skin: runtime dispose')
    this.applyLayers(this.config)
  }

  /** 当前生效配置。 */
  getConfig(): QQSkinConfig {
    return this.config
  }

  /**
   * 热更新:原地更新两层,不重启插件、无中间裸态。
   * @param config - 新配置(可缺省,回落默认)。
   */
  update(config?: Partial<QQSkinConfig>): void {
    this.config = resolveQQSkinConfig(config)
    this.applyLayers(this.config)
  }

  /** 卸载两层(插件 dispose 时调用)。 */
  dispose(): void {
    this.disposeLayers()
  }

  /** 挂载或原地更新两层:布局 `<style>` + token override。 */
  private applyLayers(config: QQSkinConfig): void {
    if (this.layout === undefined) {
      this.layout = createQQLayoutLayer(config)
    } else {
      this.layout.set(config)
    }
    this.removeTokens = this.ctx.theme.overrideTokens(QQ_SKIN_SOURCE, buildTokenOverrides(config.palette, config.customColor))
  }

  /** 卸载两层并清空句柄。 */
  private disposeLayers(): void {
    this.layout?.remove()
    this.layout = undefined
    this.removeTokens?.()
    this.removeTokens = undefined
  }
}
