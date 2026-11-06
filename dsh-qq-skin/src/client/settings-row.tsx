/**
 * QQ 皮肤设置行(注册进设置 General 区的 item 槽):色板七选一、气泡
 * 尾巴/企鹅头像开关、会话宽度输入。
 *
 * 视觉语言与宿主设置行对齐:
 * - 色板用 ui-theme AppearanceRow 同款 16px 圆角卡片(flex 布局 + hover
 *   底色 + 选中态 `bg-module-platform`/bluish-400 描边),卡片内以
 *   渐变色块预览该色板,文案在下;
 * - 开关用 QQ NT 风格圆角 switch(非原生 checkbox),轨道/滑块走
 *   `--dsw-*` token;
 * - 标题与「标题+控件左右排布」对齐 locale LanguageRow 的 14px 行。
 *
 * 样式用内联 style 直读 `--dsw-*` token(跟随色板与亮暗),不依赖构建期
 * CSS Modules 管线——本插件的客户端 bundle 无 CSS 处理步骤。
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-settings 的 SlotMap 声明合并(声明 settings.general.item
// 槽),与 ui-theme 的 AppearanceRow 同款——交叉插件协作始终走类型引用,
// 客户端 bundle 纯净性门禁不允许 value import。
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  CHAT_MAX_WIDTH_MAX,
  CHAT_MAX_WIDTH_MIN,
  QQ_AVATAR_STYLES,
  QQ_SKIN_PALETTES,
  QQ_SKIN_SOUND_VARIANTS,
  type QQAvatarStyle,
  type QQSkinPalette,
  type QQSkinSoundVariant,
} from './config.ts'
import type { createQQSkinRowStore } from './settings-store.ts'
import type { QQSkinSettingsKey } from './settings-locales.ts'

/** 注入的业务面:各字段的持久化写入口(经 SettingsScope.set 排队)。 */
export interface QQSkinRowInjected {
  /** 切换色板变体。 */
  setPalette: (palette: QQSkinPalette) => void
  /** 设置自定义主色。 */
  setCustomColor: (color: string) => void
  /** 切换企鹅头像装扮。 */
  setAvatarStyle: (style: QQAvatarStyle) => void
  /** 开关用户气泡尾巴。 */
  setBubbleTail: (value: boolean) => void
  /** 开关助手企鹅头像。 */
  setAssistantAvatar: (value: boolean) => void
  /** 设置会话最大宽度(px)。 */
  setChatMaxWidth: (width: number) => void
  /** 开关消息提示音。 */
  setMessageSound: (value: boolean) => void
  /** 开关发送消息反馈音。 */
  setSendSound: (value: boolean) => void
  /** 切换提示声音色。 */
  setSoundVariant: (variant: QQSkinSoundVariant) => void
  /** 开关窗口抖动提醒。 */
  setWindowShake: (value: boolean) => void
  /** 开关毛玻璃质感。 */
  setFrostedGlass: (value: boolean) => void
  /** 开关打字机揭示动效。 */
  setTyping: (value: boolean) => void
}

/** 完整组件 props:运行时份额 + store 份额 + locale 座 + 注入面。 */
export type QQSkinRowComponentProps =
  PropsRuntime<'settings.general.item'>
  & PropsStore<ReturnType<typeof createQQSkinRowStore>>
  & PropsLocale<'dsh-qq-skin.settings'>
  & QQSkinRowInjected

/** 色板选项文案键。 */
const PALETTE_LABEL_KEYS: Record<QQSkinPalette, QQSkinSettingsKey> = {
  classic: 'palette.classic',
  vivid: 'palette.vivid',
  clean: 'palette.clean',
  green: 'palette.green',
  black: 'palette.black',
  qqblue: 'palette.qqblue',
  custom: 'palette.custom',
}

/** 提示声音色选项文案键。 */
const SOUND_VARIANT_LABEL_KEYS: Record<QQSkinSoundVariant, QQSkinSettingsKey> = {
  beep: 'sound.beep',
  waterdrop: 'sound.waterdrop',
  knock: 'sound.knock',
}

/** 企鹅头像装扮选项文案键。 */
const AVATAR_STYLE_LABEL_KEYS: Record<QQAvatarStyle, QQSkinSettingsKey> = {
  classic: 'avatar.classic',
  sunglasses: 'avatar.sunglasses',
  scarf: 'avatar.scarf',
}

/** 色板卡片的渐变色块预览(实色气泡代表色,纯辨识度点缀,不参与主题)。 */
const PALETTE_PREVIEW: Record<QQSkinPalette, string> = {
  classic: 'linear-gradient(135deg, #12B7F5 0%, #11A8E1 100%)',
  vivid: 'linear-gradient(135deg, #8A5CF5 0%, #7F55E1 100%)',
  clean: 'linear-gradient(135deg, #FFFFFF 0%, #E6EEF6 100%)',
  green: 'linear-gradient(135deg, #07C160 0%, #06B258 100%)',
  black: 'linear-gradient(135deg, #0B0F16 0%, #1D2937 100%)',
  qqblue: 'linear-gradient(135deg, #2D73D7 0%, #3059CD 100%)',
  custom: 'linear-gradient(135deg, #FF5722 0%, #12B7F5 50%, #9C27B0 100%)',
}

/** 行容器/标题:与宿主 AppearanceRow/LanguageRow 的 group+title 一致。 */
const groupStyle = {
  display: 'flex', flexDirection: 'column', gap: '8px',
  padding: '16px 0', borderBottom: '1px solid var(--dsw-alias-border-l2)',
} satisfies CSSProperties

const titleStyle = {
  fontSize: '14px', fontWeight: 400, lineHeight: '22px',
  color: 'var(--dsw-alias-label-primary)',
} satisfies CSSProperties

/** 色板卡片行:flex 换行,与 AppearanceRow 的 cubeRow 同构。 */
const cardRowStyle = {
  display: 'flex', gap: '8px', flexWrap: 'wrap',
} satisfies CSSProperties

/** 标题+控件行(开关/宽度):左标题右控件,对齐 LanguageRow。 */
const fieldRowStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: '8px',
} satisfies CSSProperties

/** 开关网格:2 列紧凑布局,4 个开关占两行而非四行,节省垂直空间。 */
const toggleGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '4px 16px',
} satisfies CSSProperties

const fieldLabelStyle = {
  fontSize: '14px', lineHeight: '22px',
  color: 'var(--dsw-alias-label-primary)',
} satisfies CSSProperties

/** QQ NT 风格 switch 轨道(选中品牌色,未选平台底色 + 细描边)。 */
const switchTrack = (checked: boolean): CSSProperties => ({
  flex: 'none',
  width: '36px', height: '20px',
  padding: 0,
  border: 'none',
  borderRadius: '999px',
  background: checked
    ? 'var(--dsw-alias-brand-primary)'
    : 'var(--dsw-alias-bg-module-platform)',
  boxShadow: checked ? 'none' : 'inset 0 0 0 1px var(--dsw-alias-border-l3)',
  cursor: 'pointer',
  position: 'relative',
  transition: 'background 0.15s ease',
})

const switchThumb = (checked: boolean): CSSProperties => ({
  position: 'absolute',
  top: '2px',
  left: checked ? '18px' : '2px',
  width: '16px', height: '16px',
  borderRadius: '50%',
  background: '#FFFFFF',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
  transition: 'left 0.15s ease',
})

/** 单个色板卡片:渐变色块在上、文案在下,与 AppearanceRow 的 cube 同款。 */
function PaletteCard({ palette, label, selected, onSelect }: {
  palette: QQSkinPalette
  label: string
  selected: boolean
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      onMouseEnter={() => { setHovered(true) }}
      onMouseLeave={() => { setHovered(false) }}
      style={{
        boxSizing: 'border-box',
        flex: '1 1 104px',
        minWidth: '104px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '6px',
        padding: '12px 8px',
        border: `1px solid ${selected ? 'var(--dsw-static-neutral-bluish-400)' : 'var(--dsw-alias-border-l2)'}`,
        borderRadius: '16px',
        background: selected
          ? 'var(--dsw-alias-bg-module-platform)'
          : hovered ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
        font: 'inherit',
        fontSize: '13px', lineHeight: '20px',
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
        transition: 'background 0.12s ease, border-color 0.12s ease',
      }}
    >
      <span style={{
        width: '28px', height: '28px', borderRadius: '10px',
        background: PALETTE_PREVIEW[palette],
        border: '1px solid var(--dsw-alias-border-l2)',
      }} />
      {label}
    </button>
  )
}

/** 开关行:左标题右 switch(QQ NT 观感,role=switch 保可访问性)。 */
function ToggleRow({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div style={fieldRowStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => { onChange(!checked) }}
        style={switchTrack(checked)}
      >
        <span style={switchThumb(checked)} />
      </button>
    </div>
  )
}

/**
 * 渲染 QQ 皮肤设置行。
 * @param props - 组合后的槽位 props。
 * @returns 行元素树。
 */
export function QQSkinSettingsRow({
  t, useStore, setPalette, setCustomColor, setAvatarStyle, setBubbleTail, setAssistantAvatar, setChatMaxWidth,
  setMessageSound, setSendSound, setSoundVariant, setWindowShake, setFrostedGlass, setTyping,
}: QQSkinRowComponentProps) {
  const config = useStore(s => s.config)
  const [widthDraft, setWidthDraft] = useState(String(config.chatMaxWidth))
  const [widthFocused, setWidthFocused] = useState(false)

  // 自定义主色:草稿态即时回显 + 40ms 防抖提交。拖拽拾色时输入框不被
  // 宿主快照的异步回写跳变;主题层由运行时原地热更新(无闪屏),提交只
  // 负责把最终色持久化。
  const [colorDraft, setColorDraft] = useState(config.customColor)
  const colorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => { setColorDraft(config.customColor) }, [config.customColor])
  useEffect(() => () => { if (colorTimer.current) window.clearTimeout(colorTimer.current) }, [])
  const pickColor = (value: string): void => {
    setColorDraft(value)
    if (colorTimer.current) window.clearTimeout(colorTimer.current)
    colorTimer.current = setTimeout(() => { setCustomColor(value) }, 40)
  }

  useEffect(() => {
    if (!widthFocused) {
      setWidthDraft(String(config.chatMaxWidth))
    }
  }, [config.chatMaxWidth, widthFocused])

  const commitWidth = (): void => {
    const parsed = Number(widthDraft)
    if (Number.isFinite(parsed) && parsed > 0) {
      const clamped = Math.min(CHAT_MAX_WIDTH_MAX, Math.max(CHAT_MAX_WIDTH_MIN, Math.round(parsed)))
      if (clamped !== config.chatMaxWidth) {
        setChatMaxWidth(clamped)
      }
      setWidthDraft(String(clamped))
    } else {
      setWidthDraft(String(config.chatMaxWidth))
    }
  }

  return (
    <div style={groupStyle}>
      <div style={titleStyle}>{t('row.title')}</div>

      {/* 色板:六选一卡片(渐变色块 + 文案,选中描边对齐宿主 cube) */}
      <div role="radiogroup" style={cardRowStyle}>
        {QQ_SKIN_PALETTES.map(palette => (
          <PaletteCard
            key={palette}
            palette={palette}
            label={t(PALETTE_LABEL_KEYS[palette])}
            selected={config.palette === palette}
            onSelect={() => { setPalette(palette) }}
          />
        ))}
      </div>

      {/* 自定义主色调色盘:选中使用自定义主色板时展开 */}
      {config.palette === 'custom' && (
        <div style={fieldRowStyle}>
          <span style={fieldLabelStyle}>{t('row.customColor')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="color"
              value={colorDraft}
              onChange={event => { pickColor(event.currentTarget.value) }}
              style={{
                width: '32px', height: '28px', padding: 0, border: 'none',
                borderRadius: '6px', background: 'transparent', cursor: 'pointer',
              }}
            />
            <span style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--dsw-alias-label-secondary)' }}>
              {colorDraft.toUpperCase()}
            </span>
          </span>
        </div>
      )}

      {/* 企鹅头像装扮:开启企鹅头像时展开装扮药丸组 */}
      {config.assistantAvatar && (
        <div style={fieldRowStyle}>
          <span style={fieldLabelStyle}>{t('row.avatarStyle')}</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {QQ_AVATAR_STYLES.map(style => {
              const selected = config.avatarStyle === style
              return (
                <button
                  key={style}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => { setAvatarStyle(style) }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: `1px solid ${selected ? 'var(--dsw-static-neutral-bluish-400)' : 'var(--dsw-alias-border-l2)'}`,
                    background: selected ? 'var(--dsw-alias-bg-module-platform)' : 'transparent',
                    color: selected ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: selected ? 500 : 400,
                    transition: 'all 0.12s ease',
                  }}
                >
                  {t(AVATAR_STYLE_LABEL_KEYS[style])}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 开关网格:2 列紧凑布局(气泡尾巴/头像/提示音/抖动/毛玻璃/打字机) */}
      <div style={toggleGridStyle}>
        <ToggleRow
          label={t('row.bubbleTail')}
          checked={config.bubbleTail}
          onChange={setBubbleTail}
        />
        <ToggleRow
          label={t('row.assistantAvatar')}
          checked={config.assistantAvatar}
          onChange={setAssistantAvatar}
        />
        <ToggleRow
          label={t('row.messageSound')}
          checked={config.messageSound}
          onChange={setMessageSound}
        />
        <ToggleRow
          label={t('row.sendSound')}
          checked={config.sendSound}
          onChange={setSendSound}
        />
        <ToggleRow
          label={t('row.windowShake')}
          checked={config.windowShake}
          onChange={setWindowShake}
        />
        <ToggleRow
          label={t('row.frostedGlass')}
          checked={config.frostedGlass}
          onChange={setFrostedGlass}
        />
        <ToggleRow
          label={t('row.typing')}
          checked={config.typing}
          onChange={setTyping}
        />
      </div>

      {/* 提示声音色:在开启消息提示音时展开音色选择药丸组 */}
      {config.messageSound && (
        <div style={fieldRowStyle}>
          <span style={fieldLabelStyle}>{t('row.soundVariant')}</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {QQ_SKIN_SOUND_VARIANTS.map(variant => {
              const selected = config.soundVariant === variant
              return (
                <button
                  key={variant}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => { setSoundVariant(variant) }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: `1px solid ${selected ? 'var(--dsw-static-neutral-bluish-400)' : 'var(--dsw-alias-border-l2)'}`,
                    background: selected ? 'var(--dsw-alias-bg-module-platform)' : 'transparent',
                    color: selected ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: selected ? 500 : 400,
                    transition: 'all 0.12s ease',
                  }}
                >
                  {t(SOUND_VARIANT_LABEL_KEYS[variant])}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 会话宽度:暂存草稿,失焦/回车提交(与插件卡片相同的 staged 哲学) */}
      <div style={fieldRowStyle}>
        <span style={fieldLabelStyle}>{t('row.chatMaxWidth')}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="number"
            min={CHAT_MAX_WIDTH_MIN}
            max={CHAT_MAX_WIDTH_MAX}
            step={20}
            value={widthDraft}
            onChange={event => { setWidthDraft(event.currentTarget.value) }}
            onFocus={() => { setWidthFocused(true) }}
            onBlur={() => { setWidthFocused(false); commitWidth() }}
            onKeyDown={event => { if (event.key === 'Enter') commitWidth() }}
            style={{
              width: '96px', height: '32px', padding: '0 10px',
              boxSizing: 'border-box',
              border: `1px solid ${widthFocused ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l2)'}`,
              borderRadius: '10px',
              background: 'var(--dsw-specific-input-major)',
              color: 'var(--dsw-alias-label-primary)',
              fontSize: '13px',
              outline: 'none',
            }}
          />
          <span style={{ fontSize: '12px', color: 'var(--dsw-alias-label-caption)' }}>px</span>
        </span>
      </div>
    </div>
  )
}
