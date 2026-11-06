/**
 * QQ 皮肤 token 覆盖层(light/dark 双色值,按色板变体生成)。
 *
 * 每个条目覆盖一个 `--dsw-*` 语义 token:`light` 在浅色基座上生效,
 * `dark` 在深色基座上生效(`body[data-ds-dark-theme]`)。皮肤通过
 * `ctx.theme.overrideTokens('dsh-qq-skin', …)` 叠加,移除即还原;
 * 不在此清单中的 token 保持产品默认。
 *
 * classic/vivid/clean/green 共享同一套中性蓝灰骨架(文字、边框、
 * 状态色、Markdown),仅在「人格 token」上分化;black 深空黑另起近黑
 * 基底,亮暗基座均保持深黑观感:
 * - **classic 经典蓝**(默认)——QQ 天蓝 #12B7F5 + 实色蓝气泡(白字),
 *   亮色白净克制、暗色沉稳蓝灰 #101822;
 * - **vivid 炫彩紫**——QQ 炫彩紫 #8A5CF5 + 实色紫气泡,暗色紫调深底,
 *   蓝紫刻度整体重映射;
 * - **clean 简洁白**——表面纯白、分割更淡,蓝只做点缀,暗色更中性的
 *   蓝灰 #0F1622;
 * - **green 经典绿气泡**——实色绿气泡 #07C160,品牌仍为 QQ 蓝;
 * - **black 深空黑**——基座 #05070B 起近黑,亮暗同值,蓝只做点缀。
 *
 * 状态色(QQ 绿 #07C160 / 红 #FA5151 / 琥珀 #FFC300)为 QQ 识别色,
 * 各色板保持一致。几何与结构(圆角、头像、气泡尾巴、输入区胶囊)
 * 由 qq-layout.ts 负责。
 */
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { QQSkinPalette } from './config.ts'

/** overrideTokens 层来源标识(即本插件包名)。 */
export const QQ_SKIN_SOURCE = 'dsh-qq-skin'

/**
 * classic 经典蓝色板的全量覆盖集(也是向后兼容导出的基准全集;
 * 其余色板在此之上叠加增量)。
 */
export const QQ_TOKEN_OVERRIDES: ThemeTokenOverrides = {
  // ── 品牌(亮暗同源,蓝色只做点缀) ──────────────────────────────────────
  '--dsw-alias-brand-primary': { light: '#12B7F5', dark: '#4CB8FF' },
  '--dsw-alias-brand-primary-invert': { light: '#FFFFFF', dark: '#101822' },
  '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: '#12B7F5', dark: '#4CB8FF' },
  '--dsw-alias-brand-text': { light: '#0A8FD9', dark: '#7CD4FF' },
  '--dsw-alias-state-business-primary': { light: '#12B7F5', dark: '#4CB8FF' },
  '--dsw-alias-state-business-tertiary': { light: '#E8F4FB', dark: '#1E2A38' },
  '--dsw-alias-button-info-fill': { light: '#12B7F5', dark: '#2AA8E8' },
  '--dsw-alias-button-info-hover': { light: '#0FA3DC', dark: '#4CB8FF' },

  // ── 背景层级(亮色白净 / 暗色沉稳蓝灰) ─────────────────────────────
  '--dsw-alias-bg-base': { light: '#F7F9FB', dark: '#101822' },
  '--dsw-alias-bg-layer-1': { light: '#FFFFFF', dark: '#18222E' },
  '--dsw-alias-bg-layer-2': { light: '#FAFBFC', dark: '#1D2937' },
  '--dsw-alias-bg-layer-3': { light: '#F1F4F7', dark: '#243244' },
  '--dsw-alias-bg-overlay': { light: '#FFFFFF', dark: '#1D2937' },
  '--dsw-alias-bg-module-platform': { light: '#F2F5F8', dark: '#141E2A' },
  '--dsw-alias-bg-multi-select': { light: '#EDF1F5', dark: '#243244' },
  '--dsw-alias-bg-skeleton': { light: 'rgba(15, 23, 42, 0.06)', dark: 'rgba(148, 163, 184, 0.08)' },
  '--dsw-alias-bg-mask-drop': { light: 'rgba(255, 255, 255, 0.72)', dark: 'rgba(6, 10, 16, 0.72)' },
  // 遮罩层保持产品默认(黑色半透明,非蓝色系),仅纳入覆盖集保证完整。
  '--dsw-alias-bg-mask-1': { light: 'rgba(0, 0, 0, 0.24)', dark: 'rgba(0, 0, 0, 0.5)' },
  '--dsw-alias-bg-mask-2': { light: 'rgba(0, 0, 0, 0.12)', dark: 'rgba(0, 0, 0, 0.2)' },
  '--dsw-alias-bg-mask-3': { light: 'rgba(0, 0, 0, 0.48)', dark: 'rgba(0, 0, 0, 0.48)' },
  '--dsw-alias-bg-mask-photo': { light: 'rgba(0, 0, 0, 0.88)', dark: 'rgba(0, 0, 0, 0.88)' },

  // ── 边框(亮色中性细分割 / 暗色中性弱分割) ─────────────────────────────
  '--dsw-alias-border-l1': { light: 'rgba(15, 23, 42, 0.08)', dark: 'rgba(255, 255, 255, 0.08)' },
  '--dsw-alias-border-l2': { light: 'rgba(15, 23, 42, 0.12)', dark: 'rgba(255, 255, 255, 0.12)' },
  '--dsw-alias-border-l2-darkmode-thin': { light: 'rgba(15, 23, 42, 0.08)', dark: 'rgba(255, 255, 255, 0.08)' },
  '--dsw-alias-border-l3': { light: 'rgba(15, 23, 42, 0.16)', dark: 'rgba(255, 255, 255, 0.16)' },
  '--dsw-alias-border-l4': { light: 'rgba(15, 23, 42, 0.20)', dark: 'rgba(255, 255, 255, 0.20)' },
  '--dsw-alias-border-inverted': { light: 'rgba(255, 255, 255, 0.10)', dark: 'rgba(18, 122, 175, 0.20)' },
  '--dsw-alias-border-inverted2': { light: 'rgba(255, 255, 255, 0.12)', dark: 'rgba(18, 122, 175, 0.26)' },

  // ── 文字 ─────────────────────────────────────────────────────────────
  '--dsw-alias-label-primary': { light: '#1F2A35', dark: '#E6EDF4' },
  '--dsw-alias-label-primary-bluish': { light: '#0A6FB8', dark: '#8ED4FF' },
  '--dsw-alias-label-primary-dimmed': { light: '#3A4A59', dark: '#C3D0DE' },
  '--dsw-alias-label-primary-foreground': { light: '#FFFFFF', dark: '#101822' },
  '--dsw-alias-label-primary-inverted': { light: '#FFFFFF', dark: '#1B2632' },
  '--dsw-alias-label-secondary': { light: '#5A6B7A', dark: '#9FB4C6' },
  '--dsw-alias-label-tertiary': { light: '#7A8A97', dark: '#7E93A5' },
  '--dsw-alias-label-caption': { light: '#96A5B1', dark: '#5E7286' },
  '--dsw-alias-label-dimmed': { light: '#B4C0C9', dark: '#46586A' },

  // ── 交互 hover/active(亮色中性 / 暗色中性,选中态保留一点蓝) ──────────
  '--dsw-alias-interactive-bg-hover': { light: 'rgba(15, 23, 42, 0.05)', dark: 'rgba(255, 255, 255, 0.08)' },
  '--dsw-alias-interactive-bg-active': { light: 'rgba(15, 23, 42, 0.09)', dark: 'rgba(255, 255, 255, 0.14)' },
  '--dsw-alias-interactive-bg-hover-accent': { light: 'rgba(18, 183, 245, 0.10)', dark: 'rgba(255, 255, 255, 0.20)' },
  '--dsw-alias-interactive-bg-hover-solid': { light: '#F1F4F7', dark: '#243244' },
  '--dsw-alias-interactive-bg-hover-danger': { light: 'rgba(250, 81, 81, 0.06)', dark: 'rgba(250, 81, 81, 0.12)' },

  // ── 按钮(QQ 蓝主操作,蓝色仅点缀主按钮/选中态) ────────────────────────
  '--dsw-alias-button-primary-fill': { light: '#12B7F5', dark: '#2AA8E8' },
  '--dsw-alias-button-primary-hover': { light: '#0FA3DC', dark: '#4CB8FF' },
  '--dsw-alias-button-primary-dimmed': { light: '#BFE9FB', dark: '#1C3040' },
  '--dsw-alias-button-elevated-fill': { light: '#FFFFFF', dark: '#243244' },
  '--dsw-alias-button-floating-fill': { light: '#FFFFFF', dark: '#1D2937' },
  '--dsw-alias-button-floating-hover': { light: '#F1F4F7', dark: '#243244' },
  '--dsw-alias-button-contrast-fill': { light: '#12B7F5', dark: '#4CB8FF' },
  '--dsw-alias-button-ghost-active-fill': { light: '#E8F4FB', dark: '#243244' },
  '--dsw-alias-button-ghost-active-hover': { light: '#D9EDF9', dark: '#2A3A4C' },
  '--dsw-alias-button-ghost-active-border': { light: '#12B7F5', dark: '#4CB8FF' },
  '--dsw-alias-button-tool-bar-fill': { light: 'rgba(15, 23, 42, 0.28)', dark: 'rgba(76, 184, 255, 0.45)' },
  '--dsw-alias-button-tool-bar-fill-invisible': { light: 'rgba(15, 23, 42, 0.18)', dark: 'rgba(76, 184, 255, 0.30)' },
  '--dsw-alias-button-tool-bar-hover': { light: 'rgba(15, 23, 42, 0.36)', dark: 'rgba(76, 184, 255, 0.55)' },

  // ── 状态色(QQ 绿/红/琥珀,三色板一致) ──────────────────────────────────
  '--dsw-alias-state-success-primary': { light: '#07C160', dark: '#2FD57F' },
  '--dsw-alias-state-success-secondary': { light: '#3CD98C', dark: '#3CD98C' },
  '--dsw-alias-state-success-tertiary': { light: '#E0F8EC', dark: '#14352A' },
  '--dsw-alias-state-error-primary': { light: '#FA5151', dark: '#FF6B6B' },
  '--dsw-alias-state-error-secondary': { light: '#FF8080', dark: '#E04848' },
  '--dsw-alias-state-warn-primary': { light: '#FFC300', dark: '#FFCC33' },
  '--dsw-alias-state-warn-secondary': { light: '#FFD84D', dark: '#C99A00' },
  '--dsw-alias-state-warn-tertiary': { light: '#FFF4CC', dark: '#3A2F0A' },
  '--dsw-alias-state-warn-label': { light: '#B8860B', dark: '#FFCC33' },

  // ── Markdown 渲染(亮色中性 / 暗色蓝灰) ─────────────────────────────────
  '--dsw-alias-markdown-inline-code': { light: '#EEF1F5', dark: '#1E2A38' },
  '--dsw-alias-markdown-code-block': { light: '#F6F8FA', dark: '#0E1622' },
  '--dsw-alias-markdown-code-block-banner': { light: '#F1F4F7', dark: '#1A2634' },
  '--dsw-alias-markdown-code-segment-selected': { light: '#FFFFFF', dark: '#243244' },
  '--dsw-alias-markdown-code-segment-unselected': { light: '#F1F4F7', dark: '#18222E' },
  '--dsw-alias-markdown-citation': { light: '#EEF1F5', dark: '#1E2A38' },
  '--dsw-alias-markdown-tag': { light: '#EEF1F5', dark: '#1E2A38' },
  '--dsw-alias-markdown-placeholder': { light: '#F1F4F7', dark: '#18222E' },

  // ── 浮层与提示(亮暗都保持深底,文字用浅色,避免暗色下发白) ────────────
  '--dsw-alias-toast-bg': { light: '#1B2A38', dark: '#1B2634' },
  '--dsw-alias-tooltip-bg': { light: '#20364F', dark: '#1B2634' },

  // ── 滚动条(亮色中性灰 / 暗色蓝灰) ──────────────────────────────────────
  '--dsw-alias-scrollbar-bg-l1': { light: '#D9DFE6', dark: '#2A3646' },
  '--dsw-alias-scrollbar-bg-l2': { light: '#D9DFE6', dark: '#2A3646' },
  '--dsw-alias-scrollbar-hover-l1': { light: '#B4BEC8', dark: '#3A4A5C' },
  '--dsw-alias-scrollbar-hover-l2': { light: '#B4BEC8', dark: '#3A4A5C' },

  // ── 会话专属(实色气泡为 QQ 辨识度点缀,白字由布局层统一指定) ──────────
  '--dsw-specific-bubble': { light: '#12B7F5', dark: '#1D4E6E' },
  '--dsw-specific-bubble-highlight': { light: '#11A8E1', dark: '#2A6A92' },
  '--dsw-specific-input-major': { light: '#FFFFFF', dark: '#18222E' },
  '--dsw-specific-login-input': { light: '#FFFFFF', dark: '#18222E' },
  '--dsw-specific-menu': { light: '#FFFFFF', dark: '#1D2937' },
  '--dsw-specific-selector': { light: '#F1F4F7', dark: '#18222E' },
  '--dsw-specific-tip': { light: '#F1F4F7', dark: '#18222E' },

  // ── 侧边栏(亮色白净 / 暗色蓝灰,选中项蓝 accent 点缀) ──────────────────
  '--dsw-specific-sidebar-fill': { light: '#F2F5F8', dark: '#0D141D' },
  '--dsw-specific-sidebar-nav-item-active': { light: '#FFFFFF', dark: '#1D2937' },
  '--dsw-specific-sidebar-nav-item-active-accent': { light: '#12B7F5', dark: '#4CB8FF' },
  '--dsw-specific-sidebar-nav-item-hover': { light: '#E9EEF3', dark: '#1A2634' },

  // ── 静态色板(组件直引,统一为 QQ 天蓝刻度) ─────────────────────────────
  // 部分组件(ChatView 渐变、StateDot、TrajectoryTable、ContextMeter 等)
  // 直接引用 --dsw-static-* 常量而非 alias token,默认值是 deepseek 蓝紫
  // #416EE6。这里把 deepseek/blue 两条蓝色刻度整体重映射为基于 #12B7F5
  // 的 QQ 天蓝刻度,使全界面蓝色统一(亮暗同值,与设计平台一致)。
  '--dsw-static-deepseek-50': { light: '#F0FAFF', dark: '#F0FAFF' },
  '--dsw-static-deepseek-100': { light: '#D6F0FD', dark: '#D6F0FD' },
  '--dsw-static-deepseek-200': { light: '#B2E4FC', dark: '#B2E4FC' },
  '--dsw-static-deepseek-300': { light: '#84D4F9', dark: '#84D4F9' },
  '--dsw-static-deepseek-400': { light: '#50C6F7', dark: '#50C6F7' },
  '--dsw-static-deepseek-450': { light: '#31BEF6', dark: '#31BEF6' },
  '--dsw-static-deepseek-500': { light: '#12B7F5', dark: '#12B7F5' },
  '--dsw-static-deepseek-600': { light: '#0D9BD1', dark: '#0D9BD1' },
  '--dsw-static-deepseek-700-delete': { light: '#0A7EAA', dark: '#0A7EAA' },
  '--dsw-static-deepseek-800': { light: '#09658A', dark: '#09658A' },
  '--dsw-static-deepseek-900': { light: '#074B67', dark: '#074B67' },
  '--dsw-static-blue-50': { light: '#F0FAFF', dark: '#F0FAFF' },
  '--dsw-static-blue-50p': { light: '#EAF8FF', dark: '#EAF8FF' },
  '--dsw-static-blue-75': { light: '#E6F5FE', dark: '#E6F5FE' },
  '--dsw-static-blue-100': { light: '#D6F0FD', dark: '#D6F0FD' },
  '--dsw-static-blue-300': { light: '#84D4F9', dark: '#84D4F9' },
  '--dsw-static-blue-400': { light: '#50C6F7', dark: '#50C6F7' },
  '--dsw-static-blue-450': { light: '#31BEF6', dark: '#31BEF6' },
  '--dsw-static-blue-500': { light: '#12B7F5', dark: '#12B7F5' },
  '--dsw-static-blue-600': { light: '#0D9BD1', dark: '#0D9BD1' },
  '--dsw-static-blue-800': { light: '#09658A', dark: '#09658A' },
  '--dsw-static-blue-900': { light: '#074B67', dark: '#074B67' },
  '--dsw-static-blue-950': { light: '#05374B', dark: '#05374B' },
}

/** vivid 炫彩紫增量(覆盖人格 token,其余继承 classic 中性骨架)。 */
const VIVID_TOKEN_DELTAS: ThemeTokenOverrides = {
  // 品牌:QQ 炫彩紫 #8A5CF5
  '--dsw-alias-brand-primary': { light: '#8A5CF5', dark: '#A78BFA' },
  '--dsw-alias-brand-primary-invert': { light: '#FFFFFF', dark: '#141024' },
  '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: '#8A5CF5', dark: '#A78BFA' },
  '--dsw-alias-brand-text': { light: '#6D28D9', dark: '#C4B5FD' },
  '--dsw-alias-state-business-primary': { light: '#8A5CF5', dark: '#A78BFA' },
  '--dsw-alias-state-business-tertiary': { light: '#EFE9FE', dark: '#241D3D' },
  '--dsw-alias-button-info-fill': { light: '#8A5CF5', dark: '#7C5CE0' },
  '--dsw-alias-button-info-hover': { light: '#7C4DE0', dark: '#A78BFA' },
  '--dsw-alias-label-primary-bluish': { light: '#6D28D9', dark: '#C4B5FD' },
  '--dsw-alias-interactive-bg-hover-accent': { light: 'rgba(138, 92, 245, 0.10)', dark: 'rgba(255, 255, 255, 0.20)' },

  // 背景:紫调深底
  '--dsw-alias-bg-base': { light: '#F7F5FC', dark: '#141024' },
  '--dsw-alias-bg-layer-1': { light: '#FFFFFF', dark: '#1D1830' },
  '--dsw-alias-bg-layer-2': { light: '#FAF8FE', dark: '#231D3A' },
  '--dsw-alias-bg-layer-3': { light: '#F1EDFA', dark: '#2B2447' },
  '--dsw-alias-bg-overlay': { light: '#FFFFFF', dark: '#1D1830' },
  '--dsw-alias-bg-module-platform': { light: '#F3F0FA', dark: '#171229' },
  '--dsw-alias-bg-multi-select': { light: '#EDE8F8', dark: '#2B2447' },
  '--dsw-alias-bg-skeleton': { light: 'rgba(88, 54, 175, 0.06)', dark: 'rgba(167, 139, 250, 0.08)' },

  // 边框:暗色紫调描边
  '--dsw-alias-border-inverted': { light: 'rgba(255, 255, 255, 0.10)', dark: 'rgba(122, 68, 224, 0.20)' },
  '--dsw-alias-border-inverted2': { light: 'rgba(255, 255, 255, 0.12)', dark: 'rgba(122, 68, 224, 0.26)' },

  // 按钮:紫主操作
  '--dsw-alias-button-primary-fill': { light: '#8A5CF5', dark: '#7C5CE0' },
  '--dsw-alias-button-primary-hover': { light: '#7C4DE0', dark: '#A78BFA' },
  '--dsw-alias-button-primary-dimmed': { light: '#DDD3FB', dark: '#2A2347' },
  '--dsw-alias-button-contrast-fill': { light: '#8A5CF5', dark: '#A78BFA' },
  '--dsw-alias-button-ghost-active-fill': { light: '#EFE9FE', dark: '#2B2447' },
  '--dsw-alias-button-ghost-active-hover': { light: '#E4DBFC', dark: '#332B55' },
  '--dsw-alias-button-ghost-active-border': { light: '#8A5CF5', dark: '#A78BFA' },
  '--dsw-alias-button-tool-bar-fill': { light: 'rgba(138, 92, 245, 0.28)', dark: 'rgba(167, 139, 250, 0.45)' },
  '--dsw-alias-button-tool-bar-fill-invisible': { light: 'rgba(138, 92, 245, 0.18)', dark: 'rgba(167, 139, 250, 0.30)' },
  '--dsw-alias-button-tool-bar-hover': { light: 'rgba(138, 92, 245, 0.36)', dark: 'rgba(167, 139, 250, 0.55)' },

  // Markdown:紫调渲染
  '--dsw-alias-markdown-inline-code': { light: '#F0ECFA', dark: '#241D3D' },
  '--dsw-alias-markdown-code-block': { light: '#F8F6FD', dark: '#0F0B1E' },
  '--dsw-alias-markdown-code-block-banner': { light: '#F1EDFA', dark: '#1B1530' },
  '--dsw-alias-markdown-code-segment-selected': { light: '#FFFFFF', dark: '#2B2447' },
  '--dsw-alias-markdown-code-segment-unselected': { light: '#F3F0FA', dark: '#1D1830' },
  '--dsw-alias-markdown-citation': { light: '#F0ECFA', dark: '#241D3D' },
  '--dsw-alias-markdown-tag': { light: '#F0ECFA', dark: '#241D3D' },
  '--dsw-alias-markdown-placeholder': { light: '#F3F0FA', dark: '#1D1830' },

  // 浮层与提示:紫调深底
  '--dsw-alias-toast-bg': { light: '#241C3F', dark: '#241C3F' },
  '--dsw-alias-tooltip-bg': { light: '#2A2150', dark: '#1F1A38' },

  // 滚动条:紫调
  '--dsw-alias-scrollbar-bg-l1': { light: '#D9D2F2', dark: '#2E2850' },
  '--dsw-alias-scrollbar-bg-l2': { light: '#D9D2F2', dark: '#2E2850' },
  '--dsw-alias-scrollbar-hover-l1': { light: '#BCB0E8', dark: '#3E3870' },
  '--dsw-alias-scrollbar-hover-l2': { light: '#BCB0E8', dark: '#3E3870' },

  // 会话专属:实色紫气泡
  '--dsw-specific-bubble': { light: '#8A5CF5', dark: '#322A55' },
  '--dsw-specific-bubble-highlight': { light: '#7F55E1', dark: '#3E3470' },
  '--dsw-specific-input-major': { light: '#FFFFFF', dark: '#1D1830' },
  '--dsw-specific-login-input': { light: '#FFFFFF', dark: '#1D1830' },
  '--dsw-specific-menu': { light: '#FFFFFF', dark: '#1D1830' },
  '--dsw-specific-selector': { light: '#F3F0FA', dark: '#1D1830' },
  '--dsw-specific-tip': { light: '#F3F0FA', dark: '#1D1830' },

  // 侧边栏:紫调
  '--dsw-specific-sidebar-fill': { light: '#F3F0FA', dark: '#100C1E' },
  '--dsw-specific-sidebar-nav-item-active': { light: '#FFFFFF', dark: '#1D1830' },
  '--dsw-specific-sidebar-nav-item-active-accent': { light: '#8A5CF5', dark: '#A78BFA' },
  '--dsw-specific-sidebar-nav-item-hover': { light: '#EAE4F9', dark: '#1B1630' },

  // 静态色板:整体重映射为 QQ 炫彩紫刻度(亮暗同值)
  '--dsw-static-deepseek-50': { light: '#F6F3FE', dark: '#F6F3FE' },
  '--dsw-static-deepseek-100': { light: '#EAE3FD', dark: '#EAE3FD' },
  '--dsw-static-deepseek-200': { light: '#D6C8FB', dark: '#D6C8FB' },
  '--dsw-static-deepseek-300': { light: '#B8A2F7', dark: '#B8A2F7' },
  '--dsw-static-deepseek-400': { light: '#9B7DF3', dark: '#9B7DF3' },
  '--dsw-static-deepseek-450': { light: '#8F6DF1', dark: '#8F6DF1' },
  '--dsw-static-deepseek-500': { light: '#8A5CF5', dark: '#8A5CF5' },
  '--dsw-static-deepseek-600': { light: '#7346E0', dark: '#7346E0' },
  '--dsw-static-deepseek-700-delete': { light: '#5E37BC', dark: '#5E37BC' },
  '--dsw-static-deepseek-800': { light: '#4C2E99', dark: '#4C2E99' },
  '--dsw-static-deepseek-900': { light: '#3A2477', dark: '#3A2477' },
  '--dsw-static-blue-50': { light: '#F6F3FE', dark: '#F6F3FE' },
  '--dsw-static-blue-50p': { light: '#F0EBFE', dark: '#F0EBFE' },
  '--dsw-static-blue-75': { light: '#ECE5FD', dark: '#ECE5FD' },
  '--dsw-static-blue-100': { light: '#EAE3FD', dark: '#EAE3FD' },
  '--dsw-static-blue-300': { light: '#B8A2F7', dark: '#B8A2F7' },
  '--dsw-static-blue-400': { light: '#9B7DF3', dark: '#9B7DF3' },
  '--dsw-static-blue-450': { light: '#8F6DF1', dark: '#8F6DF1' },
  '--dsw-static-blue-500': { light: '#8A5CF5', dark: '#8A5CF5' },
  '--dsw-static-blue-600': { light: '#7346E0', dark: '#7346E0' },
  '--dsw-static-blue-800': { light: '#4C2E99', dark: '#4C2E99' },
  '--dsw-static-blue-900': { light: '#3A2477', dark: '#3A2477' },
  '--dsw-static-blue-950': { light: '#2A1A5C', dark: '#2A1A5C' },
}

/** clean 简洁白增量(表面更白、分割更淡,蓝只做点缀,暗色中性化)。 */
const CLEAN_TOKEN_DELTAS: ThemeTokenOverrides = {
  // 品牌:保持 QQ 天蓝点缀(与 classic 一致,仅暗色亮一档)
  '--dsw-alias-brand-primary-invert': { light: '#FFFFFF', dark: '#0F1622' },
  '--dsw-alias-label-primary-foreground': { light: '#FFFFFF', dark: '#0F1622' },
  '--dsw-alias-label-primary-inverted': { light: '#FFFFFF', dark: '#16202C' },

  // 背景:表面纯白 / 更中性的暗色蓝灰
  '--dsw-alias-bg-base': { light: '#FFFFFF', dark: '#0F1622' },
  '--dsw-alias-bg-layer-1': { light: '#FFFFFF', dark: '#16202C' },
  '--dsw-alias-bg-layer-2': { light: '#FAFBFC', dark: '#1B2735' },
  '--dsw-alias-bg-layer-3': { light: '#F2F4F7', dark: '#223043' },
  '--dsw-alias-bg-overlay': { light: '#FFFFFF', dark: '#1B2735' },
  '--dsw-alias-bg-module-platform': { light: '#F6F8FA', dark: '#121A26' },
  '--dsw-alias-bg-multi-select': { light: '#EDF1F5', dark: '#223043' },
  '--dsw-alias-bg-skeleton': { light: 'rgba(15, 23, 42, 0.04)', dark: 'rgba(148, 163, 184, 0.07)' },

  // 边框:更淡的分割
  '--dsw-alias-border-l1': { light: 'rgba(15, 23, 42, 0.06)', dark: 'rgba(255, 255, 255, 0.07)' },
  '--dsw-alias-border-l2': { light: 'rgba(15, 23, 42, 0.10)', dark: 'rgba(255, 255, 255, 0.10)' },
  '--dsw-alias-border-l2-darkmode-thin': { light: 'rgba(15, 23, 42, 0.06)', dark: 'rgba(255, 255, 255, 0.07)' },
  '--dsw-alias-border-l3': { light: 'rgba(15, 23, 42, 0.14)', dark: 'rgba(255, 255, 255, 0.14)' },
  '--dsw-alias-border-l4': { light: 'rgba(15, 23, 42, 0.18)', dark: 'rgba(255, 255, 255, 0.18)' },

  // 交互:更轻的 hover
  '--dsw-alias-interactive-bg-hover': { light: 'rgba(15, 23, 42, 0.04)', dark: 'rgba(255, 255, 255, 0.07)' },
  '--dsw-alias-interactive-bg-active': { light: 'rgba(15, 23, 42, 0.08)', dark: 'rgba(255, 255, 255, 0.12)' },
  '--dsw-alias-interactive-bg-hover-accent': { light: 'rgba(18, 183, 245, 0.08)', dark: 'rgba(255, 255, 255, 0.18)' },
  '--dsw-alias-interactive-bg-hover-solid': { light: '#F6F8FA', dark: '#223043' },

  // 按钮:浮动/幽灵底色更白
  '--dsw-alias-button-elevated-fill': { light: '#FFFFFF', dark: '#223043' },
  '--dsw-alias-button-floating-fill': { light: '#FFFFFF', dark: '#1B2735' },
  '--dsw-alias-button-floating-hover': { light: '#F6F8FA', dark: '#223043' },
  '--dsw-alias-button-ghost-active-fill': { light: '#F4F8FB', dark: '#223043' },
  '--dsw-alias-button-ghost-active-hover': { light: '#E9F2F8', dark: '#2A3A4C' },

  // 滚动条:更浅
  '--dsw-alias-scrollbar-bg-l1': { light: '#E2E6EB', dark: '#283445' },
  '--dsw-alias-scrollbar-bg-l2': { light: '#E2E6EB', dark: '#283445' },
  '--dsw-alias-scrollbar-hover-l1': { light: '#C0C7CF', dark: '#38495C' },
  '--dsw-alias-scrollbar-hover-l2': { light: '#C0C7CF', dark: '#38495C' },

  // 会话专属:实色中性深气泡(简洁白极简观感)
  '--dsw-specific-bubble': { light: '#1F2A35', dark: '#1A3A52' },
  '--dsw-specific-bubble-highlight': { light: '#3A4A59', dark: '#24517A' },
  '--dsw-specific-input-major': { light: '#FFFFFF', dark: '#16202C' },
  '--dsw-specific-login-input': { light: '#FFFFFF', dark: '#16202C' },
  '--dsw-specific-menu': { light: '#FFFFFF', dark: '#1B2735' },
  '--dsw-specific-selector': { light: '#F4F7FA', dark: '#16202C' },
  '--dsw-specific-tip': { light: '#F4F7FA', dark: '#16202C' },

  // 侧边栏:纯白侧栏,选中项淡灰底 + 蓝 accent
  '--dsw-specific-sidebar-fill': { light: '#FFFFFF', dark: '#0D141D' },
  '--dsw-specific-sidebar-nav-item-active': { light: '#F6F9FB', dark: '#1B2735' },
  '--dsw-specific-sidebar-nav-item-hover': { light: '#F2F6F9', dark: '#16202C' },
}

/** green 经典绿气泡增量(经典 QQ 实色绿气泡 #07C160,品牌仍为 QQ 蓝)。 */
const GREEN_TOKEN_DELTAS: ThemeTokenOverrides = {
  // 会话气泡:经典 QQ 实色绿
  '--dsw-specific-bubble': { light: '#07C160', dark: '#1E5C3C' },
  '--dsw-specific-bubble-highlight': { light: '#06B258', dark: '#2A7A4E' },

  // 交互 hover-accent:绿调点缀
  '--dsw-alias-interactive-bg-hover-accent': { light: 'rgba(149, 236, 105, 0.16)', dark: 'rgba(149, 236, 105, 0.18)' },

  // 按钮 ghost 选中:绿边点缀
  '--dsw-alias-button-ghost-active-fill': { light: '#F0F9E8', dark: '#1B3A28' },
  '--dsw-alias-button-ghost-active-hover': { light: '#E4F5D6', dark: '#224A33' },
  '--dsw-alias-button-ghost-active-border': { light: '#95EC69', dark: '#7CD46A' },

  // 静态色板:浅绿刻度(组件直引,整体重映射避免漏原厂蓝紫)
  '--dsw-static-deepseek-50': { light: '#F4FBEE', dark: '#F4FBEE' },
  '--dsw-static-deepseek-100': { light: '#E4F7D6', dark: '#E4F7D6' },
  '--dsw-static-deepseek-200': { light: '#CDF0AD', dark: '#CDF0AD' },
  '--dsw-static-deepseek-300': { light: '#AEE77F', dark: '#AEE77F' },
  '--dsw-static-deepseek-400': { light: '#9AE06A', dark: '#9AE06A' },
  '--dsw-static-deepseek-450': { light: '#95EC69', dark: '#95EC69' },
  '--dsw-static-deepseek-500': { light: '#95EC69', dark: '#95EC69' },
  '--dsw-static-deepseek-600': { light: '#6FC94A', dark: '#6FC94A' },
  '--dsw-static-deepseek-700-delete': { light: '#5BA63E', dark: '#5BA63E' },
  '--dsw-static-deepseek-800': { light: '#47852F', dark: '#47852F' },
  '--dsw-static-deepseek-900': { light: '#336221', dark: '#336221' },
  '--dsw-static-blue-50': { light: '#F4FBEE', dark: '#F4FBEE' },
  '--dsw-static-blue-50p': { light: '#F0FAE8', dark: '#F0FAE8' },
  '--dsw-static-blue-75': { light: '#ECF9E2', dark: '#ECF9E2' },
  '--dsw-static-blue-100': { light: '#E4F7D6', dark: '#E4F7D6' },
  '--dsw-static-blue-300': { light: '#AEE77F', dark: '#AEE77F' },
  '--dsw-static-blue-400': { light: '#9AE06A', dark: '#9AE06A' },
  '--dsw-static-blue-450': { light: '#95EC69', dark: '#95EC69' },
  '--dsw-static-blue-500': { light: '#95EC69', dark: '#95EC69' },
  '--dsw-static-blue-600': { light: '#6FC94A', dark: '#6FC94A' },
  '--dsw-static-blue-800': { light: '#47852F', dark: '#47852F' },
  '--dsw-static-blue-900': { light: '#336221', dark: '#336221' },
  '--dsw-static-blue-950': { light: '#1F3D13', dark: '#1F3D13' },
}

/**
 * black 深空黑增量(近黑基底,蓝只做点缀)。亮色基座同样近黑——亮色值
 * 与暗色同值,避免与 classic 的亮色白净骨架混淆。
 */
const BLACK_TOKEN_DELTAS: ThemeTokenOverrides = {
  // 背景:近黑基底(亮暗同值)
  '--dsw-alias-bg-base': { light: '#05070B', dark: '#05070B' },
  '--dsw-alias-bg-layer-1': { light: '#0B0F16', dark: '#0B0F16' },
  '--dsw-alias-bg-layer-2': { light: '#111722', dark: '#111722' },
  '--dsw-alias-bg-layer-3': { light: '#1B2432', dark: '#1B2432' },
  '--dsw-alias-bg-overlay': { light: '#111722', dark: '#111722' },
  '--dsw-alias-bg-module-platform': { light: '#090D13', dark: '#090D13' },
  '--dsw-alias-bg-multi-select': { light: '#1B2432', dark: '#1B2432' },
  '--dsw-alias-bg-skeleton': { light: 'rgba(148, 163, 184, 0.07)', dark: 'rgba(148, 163, 184, 0.07)' },

  // 边框:更弱的分割(亮暗同值)
  '--dsw-alias-border-l1': { light: 'rgba(255, 255, 255, 0.07)', dark: 'rgba(255, 255, 255, 0.07)' },
  '--dsw-alias-border-l2': { light: 'rgba(255, 255, 255, 0.10)', dark: 'rgba(255, 255, 255, 0.10)' },
  '--dsw-alias-border-l2-darkmode-thin': { light: 'rgba(255, 255, 255, 0.07)', dark: 'rgba(255, 255, 255, 0.07)' },
  '--dsw-alias-border-l3': { light: 'rgba(255, 255, 255, 0.14)', dark: 'rgba(255, 255, 255, 0.14)' },
  '--dsw-alias-border-l4': { light: 'rgba(255, 255, 255, 0.20)', dark: 'rgba(255, 255, 255, 0.20)' },

  // 文字:提亮(亮暗同值)
  '--dsw-alias-label-primary': { light: '#EAF1F8', dark: '#EAF1F8' },
  '--dsw-alias-label-secondary': { light: '#A6BACB', dark: '#A6BACB' },
  '--dsw-alias-label-tertiary': { light: '#8499AB', dark: '#8499AB' },
  '--dsw-alias-label-caption': { light: '#61758A', dark: '#61758A' },
  '--dsw-alias-label-dimmed': { light: '#4A5C6E', dark: '#4A5C6E' },

  // Markdown 更沉(亮暗同值)
  '--dsw-alias-markdown-inline-code': { light: '#111722', dark: '#111722' },
  '--dsw-alias-markdown-code-block': { light: '#04060A', dark: '#04060A' },
  '--dsw-alias-markdown-code-block-banner': { light: '#0B0F16', dark: '#0B0F16' },
  '--dsw-alias-markdown-code-segment-selected': { light: '#1B2432', dark: '#1B2432' },
  '--dsw-alias-markdown-code-segment-unselected': { light: '#0B0F16', dark: '#0B0F16' },
  '--dsw-alias-markdown-citation': { light: '#111722', dark: '#111722' },
  '--dsw-alias-markdown-tag': { light: '#111722', dark: '#111722' },
  '--dsw-alias-markdown-placeholder': { light: '#0B0F16', dark: '#0B0F16' },

  // 浮层与提示:更沉(亮暗同值)
  '--dsw-alias-toast-bg': { light: '#0B0F16', dark: '#0B0F16' },
  '--dsw-alias-tooltip-bg': { light: '#0B0F16', dark: '#0B0F16' },

  // 滚动条:更沉(亮暗同值)
  '--dsw-alias-scrollbar-bg-l1': { light: '#1B2432', dark: '#1B2432' },
  '--dsw-alias-scrollbar-bg-l2': { light: '#1B2432', dark: '#1B2432' },
  '--dsw-alias-scrollbar-hover-l1': { light: '#2A3A4C', dark: '#2A3A4C' },
  '--dsw-alias-scrollbar-hover-l2': { light: '#2A3A4C', dark: '#2A3A4C' },

  // 会话专属:暗色气泡(亮暗同值)
  '--dsw-specific-bubble': { light: '#0E2638', dark: '#0E2638' },
  '--dsw-specific-bubble-highlight': { light: '#16405C', dark: '#16405C' },
  '--dsw-specific-input-major': { light: '#0B0F16', dark: '#0B0F16' },
  '--dsw-specific-login-input': { light: '#0B0F16', dark: '#0B0F16' },
  '--dsw-specific-menu': { light: '#111722', dark: '#111722' },
  '--dsw-specific-selector': { light: '#0B0F16', dark: '#0B0F16' },
  '--dsw-specific-tip': { light: '#0B0F16', dark: '#0B0F16' },

  // 侧边栏:更沉(亮暗同值)
  '--dsw-specific-sidebar-fill': { light: '#03050A', dark: '#03050A' },
  '--dsw-specific-sidebar-nav-item-active': { light: '#111722', dark: '#111722' },
  '--dsw-specific-sidebar-nav-item-hover': { light: '#0B0F16', dark: '#0B0F16' },
}

/** 解析 3 位或 6 位 hex 颜色为 [r, g, b] 整数元组。 */
export function parseHexColor(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string') return null
  const cleaned = hex.trim().replace(/^#/, '')
  if (cleaned.length === 3) {
    const r0 = cleaned.charAt(0)
    const g0 = cleaned.charAt(1)
    const b0 = cleaned.charAt(2)
    const r = parseInt(r0 + r0, 16)
    const g = parseInt(g0 + g0, 16)
    const b = parseInt(b0 + b0, 16)
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : [r, g, b]
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16)
    const g = parseInt(cleaned.slice(2, 4), 16)
    const b = parseInt(cleaned.slice(4, 6), 16)
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : [r, g, b]
  }
  return null
}

/** 将 [r, g, b] 格式化为标准大写 #RRGGBB。 */
export function formatHexColor([r, g, b]: [number, number, number]): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0').toUpperCase()
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** 两个颜色按比例线性混合(amount: 0 返回 c1, 1 返回 c2)。 */
export function mixColors(hex1: string, hex2: string, amount: number): string {
  const rgb1 = parseHexColor(hex1) ?? [18, 183, 245]
  const rgb2 = parseHexColor(hex2) ?? [255, 255, 255]
  const r = rgb1[0] + (rgb2[0] - rgb1[0]) * amount
  const g = rgb1[1] + (rgb2[1] - rgb1[1]) * amount
  const b = rgb1[2] + (rgb2[2] - rgb1[2]) * amount
  return formatHexColor([r, g, b])
}

/** 主色之上的反白文字:亮主色配深字、暗主色配白字(简化亮度判定)。 */
function invertLabelOn(hex: string): string {
  const [r = 0, g = 0, b = 0] = parseHexColor(hex) ?? [18, 183, 245]
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#101822' : '#FFFFFF'
}

/** 静态刻度浅端 stop → 主色向白混合比例(500 即主色本身,不含在内)。 */
const STATIC_TINT_STOPS: Record<string, number> = {
  '50': 0.94, '50p': 0.91, '75': 0.85, '100': 0.88, '200': 0.75,
  '300': 0.55, '400': 0.30, '450': 0.15,
}

/** 静态刻度深端 stop → 主色向黑混合比例。 */
const STATIC_SHADE_STOPS: Record<string, number> = {
  '600': 0.12, '700-delete': 0.25, '800': 0.40, '900': 0.55, '950': 0.70,
}

/** deepseek 刻度包含的 stop(与 classic 基准一致:无 50p/75/950)。 */
const DEEPSEEK_SCALE_STOPS = ['50', '100', '200', '300', '400', '450', '500', '600', '700-delete', '800', '900'] as const

/** blue 刻度包含的 stop(与 classic 基准一致:无 200/700-delete)。 */
const BLUE_SCALE_STOPS = ['50', '50p', '75', '100', '300', '400', '450', '500', '600', '800', '900', '950'] as const

/** 由主色生成一条静态刻度(亮暗同值,与 classic 的 QQ 天蓝刻度策略一致)。 */
function buildStaticScale(prefix: 'deepseek' | 'blue', stops: readonly string[], primary: string): ThemeTokenOverrides {
  const scale: ThemeTokenOverrides = {}
  for (const stop of stops) {
    if (stop === '500') {
      scale[`--dsw-static-${prefix}-${stop}`] = { light: primary, dark: primary }
      continue
    }
    const tint = STATIC_TINT_STOPS[stop]
    const shade = STATIC_SHADE_STOPS[stop]
    const value = tint !== undefined
      ? mixColors(primary, '#FFFFFF', tint)
      : mixColors(primary, '#000000', shade ?? 0.5)
    scale[`--dsw-static-${prefix}-${stop}`] = { light: value, dark: value }
  }
  return scale
}

/**
 * 根据自定义主色派生全套 light/dark 品牌/状态/按钮/选中态/静态刻度 token
 * 增量。除气泡外,classic 基准里所有写死 QQ 蓝的 token(主按钮填充/悬停、
 * 对比填充、ghost 选中描边、侧栏 accent、bluish 链接文字、hover 高亮、
 * static-deepseek/static-blue 两条刻度等)都从 customColor 重新推导,
 * 避免「只有部分带颜色的文字/链接/按钮跟随自定义主色」。
 * @param customColor - 十六进制主色(如 #12B7F5)。
 */
export function buildCustomTokenDeltas(customColor: string = '#12B7F5'): ThemeTokenOverrides {
  const primary = formatHexColor(parseHexColor(customColor) ?? [18, 183, 245])
  const primaryDark = mixColors(primary, '#FFFFFF', 0.28)
  const brandTextLight = mixColors(primary, '#000000', 0.15)
  const brandTextDark = mixColors(primary, '#FFFFFF', 0.45)
  const bluishLight = mixColors(primary, '#000000', 0.30)
  const tertiaryLight = mixColors(primary, '#FFFFFF', 0.88)
  const tertiaryDark = mixColors(primary, '#101822', 0.82)
  const hoverLight = mixColors(primary, '#000000', 0.08)
  const hoverDark = mixColors(primary, '#FFFFFF', 0.20)
  const ghostActiveLight = mixColors(primary, '#FFFFFF', 0.90)
  const ghostActiveHoverLight = mixColors(primary, '#FFFFFF', 0.84)
  const dimmedLight = mixColors(primary, '#FFFFFF', 0.75)
  const dimmedDark = mixColors(primary, '#101822', 0.70)

  // 气泡颜色(QQ 用户发送气泡背景:实色主色 + 白字;暗色沿用深底策略)
  const bubbleLight = primary
  const bubbleLightHighlight = hoverLight
  const bubbleDark = mixColors(primary, '#101822', 0.68)
  const bubbleDarkHighlight = mixColors(primary, '#101822', 0.52)

  // 主色半透明(hover 高亮等);暗色沿用经典白叠加以保证深底可见。
  const [pr = 0, pg = 0, pb = 0] = parseHexColor(primary) ?? [18, 183, 245]
  const accentHoverLight = `rgba(${pr}, ${pg}, ${pb}, 0.10)`

  return {
    '--dsw-alias-brand-primary': { light: primary, dark: primaryDark },
    '--dsw-alias-brand-primary-invert': { light: invertLabelOn(primary), dark: invertLabelOn(primaryDark) },
    '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: primary, dark: primaryDark },
    '--dsw-alias-brand-text': { light: brandTextLight, dark: brandTextDark },
    '--dsw-alias-label-primary-bluish': { light: bluishLight, dark: brandTextDark },
    '--dsw-alias-state-business-primary': { light: primary, dark: primaryDark },
    '--dsw-alias-state-business-tertiary': { light: tertiaryLight, dark: tertiaryDark },
    '--dsw-alias-interactive-bg-hover-accent': { light: accentHoverLight, dark: 'rgba(255, 255, 255, 0.20)' },
    '--dsw-alias-button-info-fill': { light: primary, dark: primaryDark },
    '--dsw-alias-button-info-hover': { light: hoverLight, dark: hoverDark },
    '--dsw-alias-button-primary-fill': { light: primary, dark: primaryDark },
    '--dsw-alias-button-primary-hover': { light: hoverLight, dark: hoverDark },
    '--dsw-alias-button-primary-dimmed': { light: dimmedLight, dark: dimmedDark },
    '--dsw-alias-button-contrast-fill': { light: primary, dark: primaryDark },
    '--dsw-alias-button-ghost-active-fill': { light: ghostActiveLight, dark: dimmedDark },
    '--dsw-alias-button-ghost-active-hover': { light: ghostActiveHoverLight, dark: mixColors(primary, '#101822', 0.60) },
    '--dsw-alias-button-ghost-active-border': { light: primary, dark: primaryDark },
    '--dsw-specific-sidebar-nav-item-active-accent': { light: primary, dark: primaryDark },
    // 反白底边框与暗色工具条按钮:亮色保持基准(中性/白色),暗色从主色推导。
    '--dsw-alias-border-inverted': { light: 'rgba(255, 255, 255, 0.10)', dark: `rgba(${pr}, ${pg}, ${pb}, 0.20)` },
    '--dsw-alias-border-inverted2': { light: 'rgba(255, 255, 255, 0.12)', dark: `rgba(${pr}, ${pg}, ${pb}, 0.26)` },
    '--dsw-alias-button-tool-bar-fill': { light: 'rgba(15, 23, 42, 0.28)', dark: `rgba(${pr}, ${pg}, ${pb}, 0.45)` },
    '--dsw-alias-button-tool-bar-fill-invisible': { light: 'rgba(15, 23, 42, 0.18)', dark: `rgba(${pr}, ${pg}, ${pb}, 0.30)` },
    '--dsw-alias-button-tool-bar-hover': { light: 'rgba(15, 23, 42, 0.36)', dark: `rgba(${pr}, ${pg}, ${pb}, 0.55)` },
    '--dsw-specific-bubble': { light: bubbleLight, dark: bubbleDark },
    '--dsw-specific-bubble-highlight': { light: bubbleLightHighlight, dark: bubbleDarkHighlight },
    ...buildStaticScale('deepseek', DEEPSEEK_SCALE_STOPS, primary),
    ...buildStaticScale('blue', BLUE_SCALE_STOPS, primary),
  }
}

/** 各预设色板在 classic 基准上的增量映射。 */
const PALETTE_DELTAS: Record<Exclude<QQSkinPalette, 'custom'>, ThemeTokenOverrides> = {
  classic: {},
  vivid: VIVID_TOKEN_DELTAS,
  clean: CLEAN_TOKEN_DELTAS,
  green: GREEN_TOKEN_DELTAS,
  black: BLACK_TOKEN_DELTAS,
}

/**
 * 生成指定色板的完整 token 覆盖集(classic 全量 + 该色板增量)。
 * 当 palette 为 custom 时使用 customColor 动态派生品牌与气泡 token。
 * @param palette - 色板变体标识。
 * @param customColor - 自定义主色十六进制色值(可选)。
 */
export function buildTokenOverrides(palette: QQSkinPalette, customColor?: string): ThemeTokenOverrides {
  if (palette === 'custom') {
    return { ...QQ_TOKEN_OVERRIDES, ...buildCustomTokenDeltas(customColor) }
  }
  return { ...QQ_TOKEN_OVERRIDES, ...(PALETTE_DELTAS[palette] ?? {}) }
}
