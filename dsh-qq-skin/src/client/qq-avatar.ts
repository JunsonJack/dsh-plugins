import type { QQAvatarStyle } from './config.ts'

/**
 * 官方 QQ 企鹅图形标志（53×64 透明 PNG 的 data URI）。
 *
 * 来源：腾讯 QQ互联官方「视觉素材下载」页（wiki.connect.qq.com）提供的
 * 03_qq_symbol 图形标志，等比缩放到高 64px（保持官方 5:6 比例，不压扁）。
 * 版权归腾讯公司所有——仅供个人皮肤使用，不得用于商业分发或再修改传播。
 */
export const QQ_AVATAR_DATA_URI =
  'data:image/png;base64,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'

/** 墨镜装扮 SVG 蒙层(黑色圆角镜片、金属梁、双侧高光斜切)。 */
const SUNGLASSES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 53 64" width="53" height="64">
  <rect x="13" y="11" width="12" height="10" rx="2" fill="#181B22" stroke="#0D0E12" stroke-width="1"/>
  <rect x="28" y="11" width="12" height="10" rx="2" fill="#181B22" stroke="#0D0E12" stroke-width="1"/>
  <line x1="24" y1="15" x2="29" y2="15" stroke="#0D0E12" stroke-width="1.8"/>
  <line x1="13" y1="14" x2="8" y2="14" stroke="#0D0E12" stroke-width="1.5"/>
  <line x1="40" y1="14" x2="45" y2="14" stroke="#0D0E12" stroke-width="1.5"/>
  <line x1="16" y1="13" x2="21" y2="19" stroke="rgba(255,255,255,0.7)" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="31" y1="13" x2="36" y2="19" stroke="rgba(255,255,255,0.7)" stroke-width="1.2" stroke-linecap="round"/>
</svg>`

export const QQ_SUNGLASSES_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(SUNGLASSES_SVG)}`

/** 围巾装扮 SVG 蒙层(在企鹅红色围巾上叠加红白条纹与流苏)。 */
const SCARF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 53 64" width="53" height="64">
  <rect x="15" y="29" width="3" height="6" rx="1" fill="#FFFFFF" opacity="0.92"/>
  <rect x="22" y="30" width="3" height="6" rx="1" fill="#FFFFFF" opacity="0.92"/>
  <rect x="29" y="30" width="3" height="6" rx="1" fill="#FFFFFF" opacity="0.92"/>
  <rect x="36" y="29" width="3" height="6" rx="1" fill="#FFFFFF" opacity="0.92"/>
  <line x1="16" y1="36" x2="16" y2="43" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="18.5" y1="36" x2="18.5" y2="43" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="21" y1="36" x2="21" y2="43" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round"/>
</svg>`

export const QQ_SCARF_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(SCARF_SVG)}`

/**
 * 根据装扮模式返回对应的 CSS background-image 声明。
 * 墨镜和围巾装扮以 SVG 装饰层叠在官方企鹅 PNG 之上,保持像素级对齐。
 *
 * 自定义头像优先:avatarImage 非空时直接用它(装扮层是按企鹅几何绘制的,
 * 叠在任意图片上会错位,故整体跳过)。
 */
export function getAvatarBackgroundImage(style: QQAvatarStyle = 'classic', avatarImage = ''): string {
  if (avatarImage) {
    return `url("${avatarImage}")`
  }
  switch (style) {
    case 'sunglasses':
      return `url("${QQ_SUNGLASSES_DATA_URI}"), url("${QQ_AVATAR_DATA_URI}")`
    case 'scarf':
      return `url("${QQ_SCARF_DATA_URI}"), url("${QQ_AVATAR_DATA_URI}")`
    case 'classic':
    default:
      return `url("${QQ_AVATAR_DATA_URI}")`
  }
}
