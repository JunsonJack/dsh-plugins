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
  type QQSkinConfig,
} from './client/config.ts'

/**
 * 设置字段的运行时形状:volatile 字段在 Live 配置里以 ref 形式存在。
 * 字段清单从 config.ts 的 QQSkinConfig 派生,与皮肤配置形状单一真源对齐;
 * 新增字段只需改 config.ts + 下方 z.object 校验器两处。
 */
export type Config = { [K in keyof QQSkinConfig]: Volatile<QQSkinConfig[K]> }

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
  frostedGlass: z.boolean().default(false).volatile(),
  typing: z.boolean().default(true).volatile(),
  timeDivider: z.boolean().default(true).volatile(),
})
