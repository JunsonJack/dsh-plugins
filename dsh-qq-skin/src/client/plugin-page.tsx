/**
 * 插件管理页配置卡片(注册进 `plugins.row.config` 槽,key =
 * `dsh-qq-skin#qq-skin`):QQ 皮肤全部外观配置的可视化表单。
 *
 * 页面语义(宿主契约,ui-plugin-manager slot-contract.d.ts):
 * - `view: 'summary'` 渲染一句话摘要(行描述缺省时宿主的回退);
 *   `view: 'page'` 渲染完整表单,标题与保存控件由本页自绘;
 * - 「只有保存才写入」:编辑期间只改本地草稿,点保存才经宿主
 *   `form.mutate` 一次原子提交全部差异字段;放弃则还原草稿。
 *
 * 读写通道:宿主传入 `props.form = { state, mutate }`——state 是宿主
 * 页面在每次变化时刷新的一次性快照(ConfigFormSnapshot),mutate 与
 * ctx.configForms.get(ns).mutate 同一实现(revision fence + 恢复读)。
 * 皮肤本体经 index.ts 的既有 configForms 订阅热更新,本卡片不再另开
 * 订阅通道,避免双真相源。
 *
 * 视觉沿用 0.4.7 下线的设置 General 行(仓库 backups/ 里的
 * settings-row.tsx):色板用渐变色块卡片、开关用 QQ NT 风格 switch、
 * 样式内联直读 `--dsw-*` token(跟随色板与亮暗),不依赖构建期 CSS
 * 管线。
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: 合并 ui-plugin-manager 的 SlotMap 声明(声明 plugins.row.config
// 槽)。契约要求注册方只做类型引用,永不在运行时 import 该包。
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
// Type-only: ConfigForm 类型面来自 ui-settings 客户端契约。
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: SettingsPathOpView 形状照抄 api-remotes 的远程契约(宿主
// mutate 的 op 形状:{ op:'set', path, value } | { op:'unset', path })。
// 本地声明避免为纯类型引入运行时依赖(宿主 mutate 只接受这两形状)。
type SettingsPathOpView =
  | { readonly op: 'set'; readonly path: readonly string[]; readonly value: unknown }
  | { readonly op: 'unset'; readonly path: readonly string[] }
import {
  AVATAR_SIZE_MAX,
  AVATAR_SIZE_MIN,
  CHAT_MAX_WIDTH_MAX,
  CHAT_MAX_WIDTH_MIN,
  DEFAULT_AVATAR_SIZE,
  DEFAULT_CUSTOM_COLOR,
  QQ_AVATAR_STYLES,
  QQ_SKIN_DENSITIES,
  QQ_SKIN_PALETTES,
  QQ_SKIN_SOUND_VARIANTS,
  SOUND_VOLUME_MAX,
  SOUND_VOLUME_MIN,
  type QQAvatarStyle,
  type QQSkinDensity,
  type QQSkinPalette,
  type QQSkinSoundVariant,
} from './config.ts'
import type { QQSkinSettings } from './settings.ts'
import type { QQSkinPluginKey } from './plugin-locales.ts'

/** 宿主页面表单(见 ui-plugin-manager slot-contract.d.ts 的 ConfigPageForm)。 */
interface ConfigPageForm {
  /** 宿主刷新的只读快照(loading/ready/unavailable + value + revision + writable)。 */
  readonly state: ConfigFormSnapshot<Record<string, unknown>>
  /** 全部字段编辑一次原子提交(expectedRevision 用编辑器读到的 revision)。 */
  readonly mutate: (
    ops: readonly SettingsPathOpView[],
    expectedRevision?: number,
  ) => Promise<boolean>
}

/** 卡片组件的运行时 props:Owner 份额(view/form)+ locale 座。 */
export type QQSkinCardProps = PropsRuntime<'plugins.row.config'>
  & PropsLocale<'dsh-qq-skin.plugin'>
  & { form?: ConfigPageForm | undefined }

/** 色板选项文案键。 */
const PALETTE_LABEL_KEYS: Record<QQSkinPalette, QQSkinPluginKey> = {
  classic: 'palette.classic',
  vivid: 'palette.vivid',
  clean: 'palette.clean',
  green: 'palette.green',
  black: 'palette.black',
  qqblue: 'palette.qqblue',
  custom: 'palette.custom',
}

/** 提示声音色选项文案键。 */
const SOUND_VARIANT_LABEL_KEYS: Record<QQSkinSoundVariant, QQSkinPluginKey> = {
  beep: 'sound.beep',
  waterdrop: 'sound.waterdrop',
  knock: 'sound.knock',
}

/** 企鹅头像装扮选项文案键。 */
const AVATAR_STYLE_LABEL_KEYS: Record<QQAvatarStyle, QQSkinPluginKey> = {
  classic: 'avatar.classic',
  sunglasses: 'avatar.sunglasses',
  scarf: 'avatar.scarf',
}

/** 消息密度档位选项文案键。 */
const DENSITY_LABEL_KEYS: Record<QQSkinDensity, QQSkinPluginKey> = {
  normal: 'density.normal',
  compact: 'density.compact',
}

/** 色板卡片的渐变色块预览(与旧设置行一致,纯辨识度点缀)。 */
const PALETTE_PREVIEW: Record<QQSkinPalette, string> = {
  classic: 'linear-gradient(135deg, #12B7F5 0%, #11A8E1 100%)',
  vivid: 'linear-gradient(135deg, #8A5CF5 0%, #7F55E1 100%)',
  clean: 'linear-gradient(135deg, #FFFFFF 0%, #E6EEF6 100%)',
  green: 'linear-gradient(135deg, #07C160 0%, #06B258 100%)',
  black: 'linear-gradient(135deg, #0B0F16 0%, #1D2937 100%)',
  qqblue: 'linear-gradient(135deg, #2D73D7 0%, #3059CD 100%)',
  custom: 'linear-gradient(135deg, #FF5722 0%, #12B7F5 50%, #9C27B0 100%)',
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '16px',
}

const titleStyle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: '22px',
  color: 'var(--dsw-alias-label-primary)',
}

const noticeStyle: CSSProperties = {
  fontSize: '13px',
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-secondary)',
}

const captionStyle: CSSProperties = {
  fontSize: '12px',
  color: 'var(--dsw-alias-label-caption)',
}

/** 色板卡片行:flex 换行。 */
const cardRowStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
}

/** 标题+控件行:左标题右控件。 */
const fieldRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
}

/** 开关网格:2 列紧凑布局。 */
const toggleGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '4px 16px',
}

const fieldLabelStyle: CSSProperties = {
  fontSize: '14px',
  lineHeight: '22px',
  color: 'var(--dsw-alias-label-primary)',
}

/** 药丸组容器。 */
const pillRowStyle: CSSProperties = {
  display: 'flex',
  gap: '6px',
}

/** 药丸按钮(装扮/音色共用)。 */
const pillStyle = (selected: boolean): CSSProperties => ({
  padding: '4px 10px',
  borderRadius: '8px',
  border: `1px solid ${selected ? 'var(--dsw-static-neutral-bluish-400)' : 'var(--dsw-alias-border-l2)'}`,
  background: selected ? 'var(--dsw-alias-bg-module-platform)' : 'transparent',
  color: selected ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
  fontSize: '12px',
  cursor: 'pointer',
  fontWeight: selected ? 500 : 400,
  transition: 'all 0.12s ease',
})

/** QQ NT 风格 switch 轨道。 */
const switchTrack = (checked: boolean): CSSProperties => ({
  flex: 'none',
  width: '36px',
  height: '20px',
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
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  background: '#FFFFFF',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
  transition: 'left 0.15s ease',
})

const saveButtonStyle = (disabled: boolean): CSSProperties => ({
  padding: '5px 16px',
  border: 'none',
  borderRadius: '8px',
  background: 'var(--dsw-alias-brand-primary)',
  color: '#FFFFFF',
  fontSize: '13px',
  lineHeight: '20px',
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.5 : 1,
})

const discardButtonStyle: CSSProperties = {
  padding: '5px 16px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: '8px',
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: '13px',
  lineHeight: '20px',
  cursor: 'pointer',
}

/** 文本/数字/时间输入的统一外观(与旧设置行一致)。 */
const inputStyle = (focused: boolean): CSSProperties => ({
  boxSizing: 'border-box',
  height: '32px',
  padding: '0 10px',
  border: `1px solid ${focused ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l2)'}`,
  borderRadius: '10px',
  background: 'var(--dsw-specific-input-major)',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '13px',
  outline: 'none',
})

/** 保存/放弃按钮行。 */
const actionRowStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  justifyContent: 'flex-end',
  alignItems: 'center',
}

/** 单个色板卡片:渐变色块在上、文案在下,role=radio。 */
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
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        padding: '12px 8px',
        border: `1px solid ${selected ? 'var(--dsw-static-neutral-bluish-400)' : 'var(--dsw-alias-border-l2)'}`,
        borderRadius: '16px',
        background: selected
          ? 'var(--dsw-alias-bg-module-platform)'
          : hovered ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
        font: 'inherit',
        fontSize: '13px',
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
        transition: 'background 0.12s ease, border-color 0.12s ease',
      }}
    >
      <span style={{
        width: '28px',
        height: '28px',
        borderRadius: '10px',
        background: PALETTE_PREVIEW[palette],
        border: '1px solid var(--dsw-alias-border-l2)',
      }} />
      {label}
    </button>
  )
}

/** 开关行:左标题右 switch,role=switch 保可访问性。 */
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

/** 药丸选择组(装扮/音色共用),role=radiogroup。 */
function PillGroup({ value, options, onChange }: {
  value: string
  options: ReadonlyArray<{ id: string; label: string }>
  onChange: (id: string) => void
}) {
  return (
    <div role="radiogroup" style={pillRowStyle}>
      {options.map(option => {
        const selected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => { onChange(option.id) }}
            style={pillStyle(selected)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** 本地图片最长边(缩到该尺寸再存 data URI,控制配置文档体积)。 */
const AVATAR_IMAGE_MAX_EDGE = 128

/** data URI 体积上限(约 64 KB,超过说明缩图异常,拒绝写入)。 */
const AVATAR_IMAGE_DATA_MAX_LENGTH = 64 * 1024

/**
 * 本地图片文件 → 缩图后的 PNG data URI。走 canvas 等比缩放,成功
 * resolve、失败/取消 reject(取消不提示错误)。渲染层是浏览器沙箱,
 * file:// 路径无法直接显示,统一转 data URI 持久化。
 */
function readLocalAvatarImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => { reject(new Error('file read failed')) }
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => { reject(new Error('image decode failed')) }
      image.onload = () => {
        const scale = Math.min(1, AVATAR_IMAGE_MAX_EDGE / Math.max(image.width, image.height))
        const width = Math.max(1, Math.round(image.width * scale))
        const height = Math.max(1, Math.round(image.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (context === null) {
          reject(new Error('canvas unavailable'))
          return
        }
        context.drawImage(image, 0, 0, width, height)
        resolve(canvas.toDataURL('image/png'))
      }
      image.src = String(reader.result ?? '')
    }
    reader.readAsDataURL(file)
  })
}

/** 本地头像选择按钮(隐藏 file input + 按钮触发;选中即缩图落草稿)。 */
function AvatarImagePicker({ t, onPicked, onError, onClear, hasImage }: {
  t: (key: QQSkinPluginKey) => string
  onPicked: (dataUri: string) => void
  onError: () => void
  onClear: () => void
  hasImage: boolean
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif"
        style={{ display: 'none' }}
        onChange={event => {
          const file = event.currentTarget.files?.[0]
          // 先复位 input.value,同一文件可重复选择。
          event.currentTarget.value = ''
          if (file === undefined) return
          setBusy(true)
          readLocalAvatarImage(file).then(dataUri => {
            setBusy(false)
            if (dataUri.length > AVATAR_IMAGE_DATA_MAX_LENGTH) {
              onError()
              return
            }
            onPicked(dataUri)
          }).catch(() => {
            setBusy(false)
            onError()
          })
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => { inputRef.current?.click() }}
        style={discardButtonStyle}
      >
        {t('card.pickImage')}
      </button>
      {hasImage && (
        <button type="button" onClick={onClear} style={discardButtonStyle}>
          {t('card.imageClear')}
        </button>
      )}
    </span>
  )
}

/** 数值输入(失焦/回车提交,聚焦描边):值域钳制由调用方的 commit 完成。 */
function NumberField({ value, focused, onFocusChange, onChange, onCommit, width, min, max, step }: {
  value: string
  focused: boolean
  onFocusChange: (focused: boolean) => void
  onChange: (value: string) => void
  onCommit: () => void
  width: string
  min: number
  max: number
  step: number
}) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => { onChange(event.currentTarget.value) }}
        onFocus={() => { onFocusChange(true) }}
        onBlur={() => { onFocusChange(false); onCommit() }}
        onKeyDown={event => { if (event.key === 'Enter') onCommit() }}
        style={{ ...inputStyle(focused), width }}
      />
      <span style={captionStyle}>px</span>
    </span>
  )
}

/** 从宿主快照读出类型化的设置截面(字段缺失时 undefined)。 */
function sectionOf(state: ConfigFormSnapshot<Record<string, unknown>> | undefined): QQSkinSettings | undefined {
  const value = state?.value
  if (value === undefined || typeof value !== 'object') return undefined
  return value as unknown as QQSkinSettings
}

/** 宿主快照是否可渲染表单(ready + 有值)。 */
function isReady(state: ConfigFormSnapshot<Record<string, unknown>> | undefined): state is ConfigFormSnapshot<Record<string, unknown>> & { value: QQSkinSettings } {
  return state !== undefined
    && state.status === 'ready'
    && state.value !== undefined
    && typeof state.value === 'object'
}

/**
 * 渲染插件页配置卡片。组件顶层只做 view 分流与快照读取,表单本体在
 * QQSkinForm(仅在 ready 时挂载,草稿态生命周期与页面一致)。
 * @param props - 组合后的槽位 props。
 * @returns 卡片元素树。
 */
export function QQSkinPluginCard(props: QQSkinCardProps): React.ReactNode {
  const { t, view, form } = props

  // 摘要视图:行描述缺省时宿主的回退渲染(一段话,无表单、无 hooks)。
  if (view === 'summary') {
    return <span style={noticeStyle}>{t('card.summary')}</span>
  }

  return <QQSkinForm t={t} form={form} />
}

/** 完整表单(仅 page 视图挂载;保存前一切编辑停留在本地草稿)。 */
function QQSkinForm({ t, form }: {
  t: (key: QQSkinPluginKey) => string
  form: ConfigPageForm | undefined
}) {
  const state = form?.state
  const section = sectionOf(state)

  if (!isReady(state) || section === undefined || form === undefined) {
    return <div style={noticeStyle}>{t('card.loading')}</div>
  }

  return (
    <QQSkinEditor
      t={t}
      config={state.value}
      revision={state.revision}
      writable={state.writable}
      mutate={form.mutate}
    />
  )
}

/** 可编辑表单:草稿 → 保存时一次原子提交全部差异字段。 */
function QQSkinEditor({ t, config, revision, writable, mutate }: {
  t: (key: QQSkinPluginKey) => string
  config: QQSkinSettings
  revision: number | undefined
  writable: boolean
  mutate: ConfigPageForm['mutate']
}) {
  const [draft, setDraft] = useState<QQSkinSettings>(config)

  // 外部快照变化(保存回写/其他端写入)时:草稿与快照一致则原样保留,
  // 不一致(说明用户已在别处改过)则以快照覆盖草稿。JSON 全量比较足够:
  // 字段全集固定、均为 JSON 值。
  const externalText = JSON.stringify(config)
  useEffect(() => {
    setDraft(previous => JSON.stringify(previous) === externalText
      ? previous
      : JSON.parse(externalText) as QQSkinSettings)
  }, [externalText])

  // 数字草稿:输入中的字符串,失焦/回车提交。回显 effect 只跟随外部快照
  // 变化——若把 focused 也放进依赖,失焦瞬间(focused true→false)会用尚未
  // 更新的快照值覆盖刚提交的草稿串,输入框弹回旧值而 draft 已是新值。
  const [sizeDraft, setSizeDraft] = useState(String(config.avatarSize ?? DEFAULT_AVATAR_SIZE))
  const [sizeFocused, setSizeFocused] = useState(false)
  const [widthDraft, setWidthDraft] = useState(String(config.chatMaxWidth ?? 880))
  const [widthFocused, setWidthFocused] = useState(false)
  const [volumeDraft, setVolumeDraft] = useState(String(config.soundVolume ?? 1))
  const [volumeFocused, setVolumeFocused] = useState(false)

  useEffect(() => {
    if (!sizeFocused) setSizeDraft(String(config.avatarSize ?? DEFAULT_AVATAR_SIZE))
  }, [config.avatarSize])
  useEffect(() => {
    if (!widthFocused) setWidthDraft(String(config.chatMaxWidth ?? 880))
  }, [config.chatMaxWidth])
  useEffect(() => {
    if (!volumeFocused) setVolumeDraft(String(config.soundVolume ?? 1))
  }, [config.soundVolume])

  // 自定义主色:40ms 防抖同步草稿(视觉即时),真正写入仍走「保存」。
  const [colorDraft, setColorDraft] = useState(config.customColor ?? DEFAULT_CUSTOM_COLOR)
  const colorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => { setColorDraft(config.customColor ?? DEFAULT_CUSTOM_COLOR) }, [config.customColor])
  useEffect(() => () => { if (colorTimer.current !== undefined) window.clearTimeout(colorTimer.current) }, [])
  const pickColor = (value: string): void => {
    setColorDraft(value)
    if (colorTimer.current !== undefined) window.clearTimeout(colorTimer.current)
    colorTimer.current = setTimeout(() => {
      setDraft(previous => ({ ...previous, customColor: value }))
    }, 40)
  }

  /** 草稿字段更新(开关/色板/药丸组/时段/头像 URL 等即时落草稿)。 */
  const edit = <K extends keyof QQSkinSettings>(field: K, value: QQSkinSettings[K]): void => {
    setDraft(previous => ({ ...previous, [field]: value }))
  }

  /** 是否有未保存修改:草稿与外部快照按 JSON 全量比较。 */
  const dirty = JSON.stringify(draft) !== externalText

  /** 保存:只提交与外部快照有差异的字段(一次原子提交,共享 revision fence)。 */
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const save = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    setSaveError(false)
    try {
      const ops: SettingsPathOpView[] = []
      for (const key of Object.keys(draft) as Array<keyof QQSkinSettings>) {
        const value = draft[key]
        if (value === undefined) continue
        // 差异提交:配置文档 user 层「字段存在即覆盖」,只写实际变更的
        // 字段,避免把未触碰的字段钉进用户配置(日后默认值调整失效)。
        if (JSON.stringify(value) === JSON.stringify(config[key])) continue
        ops.push({ op: 'set', path: [key], value })
      }
      if (ops.length === 0) return
      const accepted = await mutate(ops, revision)
      // 拒绝(revision 冲突)与传输异常都提示重试;成功后的草稿对齐交给
      // externalText effect(新快照到达后 dirty 自行归零),不用保存前的
      // 快照回写草稿——那会把草稿短暂回退到旧值。
      if (!accepted) setSaveError(true)
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  const commitSize = (): void => {
    const parsed = Number(sizeDraft)
    if (Number.isFinite(parsed) && parsed > 0) {
      const clamped = Math.min(AVATAR_SIZE_MAX, Math.max(AVATAR_SIZE_MIN, Math.round(parsed)))
      edit('avatarSize', clamped)
      setSizeDraft(String(clamped))
    } else {
      setSizeDraft(String(config.avatarSize ?? DEFAULT_AVATAR_SIZE))
    }
  }

  const commitWidth = (): void => {
    const parsed = Number(widthDraft)
    if (Number.isFinite(parsed) && parsed > 0) {
      const clamped = Math.min(CHAT_MAX_WIDTH_MAX, Math.max(CHAT_MAX_WIDTH_MIN, Math.round(parsed)))
      edit('chatMaxWidth', clamped)
      setWidthDraft(String(clamped))
    } else {
      setWidthDraft(String(config.chatMaxWidth ?? 880))
    }
  }

  const commitVolume = (): void => {
    // 注意 Number('') === 0:空串/空白必须先回落,否则清空输入框会把
    // 音量静音成 0(与 size/width 的 NaN 回退路径不同,0 会通过 >= 0 校验)。
    if (volumeDraft.trim() !== '' && Number.isFinite(Number(volumeDraft)) && Number(volumeDraft) >= 0) {
      const parsed = Number(volumeDraft)
      const clamped = Math.min(SOUND_VOLUME_MAX, Math.max(SOUND_VOLUME_MIN, parsed))
      edit('soundVolume', clamped)
      setVolumeDraft(String(clamped))
    } else {
      setVolumeDraft(String(config.soundVolume ?? 1))
    }
  }

  const commitAvatarImage = (): void => {
    const trimmed = (draft.avatarCustomImage ?? '').trim()
    if (trimmed !== (draft.avatarCustomImage ?? '')) {
      // 仅在确实有首尾空白时回写草稿(与外部快照的差异交给 dirty 比对)。
      setDraft(previous => ({ ...previous, avatarCustomImage: trimmed }))
    }
  }

  /** 本地图片选中:缩图 data URI 落草稿(随「保存」一并写入)。 */
  const pickLocalImage = (dataUri: string): void => {
    setImageError(false)
    edit('avatarCustomImage', dataUri)
  }

  // 本地图片读取失败提示(下一次任何编辑或重新选择时清除)。
  const [imageError, setImageError] = useState(false)
  const imageIsLocal = (draft.avatarCustomImage ?? '').startsWith('data:image/')

  const showColor = (draft.palette ?? 'classic') === 'custom'
  const showAvatarFields = (draft.assistantAvatar ?? true)
  const showVariant = (draft.messageSound ?? false)
  const showVolume = (draft.messageSound ?? false) || (draft.sendSound ?? false)

  return (
    <div style={cardStyle}>
      <div style={titleStyle}>{t('row.palette')}</div>

      {/* 色板:七选一卡片(渐变色块 + 文案,选中描边) */}
      <div role="radiogroup" style={cardRowStyle}>
        {QQ_SKIN_PALETTES.map(palette => (
          <PaletteCard
            key={palette}
            palette={palette}
            label={t(PALETTE_LABEL_KEYS[palette])}
            selected={(draft.palette ?? 'classic') === palette}
            onSelect={() => { edit('palette', palette) }}
          />
        ))}
      </div>

      {/* 自定义主色调色盘:选中自定义色板时展开 */}
      {showColor && (
        <div style={fieldRowStyle}>
          <span style={fieldLabelStyle}>{t('row.customColor')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="color"
              value={colorDraft}
              onChange={event => { pickColor(event.currentTarget.value) }}
              style={{
                width: '32px',
                height: '28px',
                padding: 0,
                border: 'none',
                borderRadius: '6px',
                background: 'transparent',
                cursor: 'pointer',
              }}
            />
            <span style={{ ...captionStyle, fontFamily: 'monospace' }}>
              {colorDraft.toUpperCase()}
            </span>
          </span>
        </div>
      )}

      {/* 企鹅头像装扮:开启企鹅头像时展开装扮药丸组 */}
      {showAvatarFields && (
        <div style={fieldRowStyle}>
          <span style={fieldLabelStyle}>{t('row.avatarStyle')}</span>
          <PillGroup
            value={draft.avatarStyle ?? 'classic'}
            options={QQ_AVATAR_STYLES.map(style => ({ id: style, label: t(AVATAR_STYLE_LABEL_KEYS[style]) }))}
            onChange={id => { edit('avatarStyle', id as QQAvatarStyle) }}
          />
        </div>
      )}

      {/* 消息密度:normal=标准呼吸感,compact=紧凑(单屏更多消息) */}
      <div style={fieldRowStyle}>
        <span style={fieldLabelStyle}>{t('row.density')}</span>
        <PillGroup
          value={draft.density ?? 'normal'}
          options={QQ_SKIN_DENSITIES.map(id => ({ id, label: t(DENSITY_LABEL_KEYS[id]) }))}
          onChange={id => { edit('density', id as QQSkinDensity) }}
        />
      </div>

      {/* 开关网格:2 列紧凑布局 */}
      <div style={toggleGridStyle}>
        <ToggleRow
          label={t('row.bubbleTail')}
          checked={draft.bubbleTail ?? true}
          onChange={value => { edit('bubbleTail', value) }}
        />
        <ToggleRow
          label={t('row.assistantAvatar')}
          checked={draft.assistantAvatar ?? true}
          onChange={value => { edit('assistantAvatar', value) }}
        />
        <ToggleRow
          label={t('row.messageSound')}
          checked={draft.messageSound ?? false}
          onChange={value => { edit('messageSound', value) }}
        />
        <ToggleRow
          label={t('row.sendSound')}
          checked={draft.sendSound ?? false}
          onChange={value => { edit('sendSound', value) }}
        />
        <ToggleRow
          label={t('row.remindOnlyWhenUnfocused')}
          checked={draft.remindOnlyWhenUnfocused ?? false}
          onChange={value => { edit('remindOnlyWhenUnfocused', value) }}
        />
        <ToggleRow
          label={t('row.windowShake')}
          checked={draft.windowShake ?? false}
          onChange={value => { edit('windowShake', value) }}
        />
        <ToggleRow
          label={t('row.frostedGlass')}
          checked={draft.frostedGlass ?? false}
          onChange={value => { edit('frostedGlass', value) }}
        />
        <ToggleRow
          label={t('row.typing')}
          checked={draft.typing ?? true}
          onChange={value => { edit('typing', value) }}
        />
        <ToggleRow
          label={t('row.timeDivider')}
          checked={draft.timeDivider ?? true}
          onChange={value => { edit('timeDivider', value) }}
        />
      </div>

      {/* 免打扰时段:两端都填才生效;跨午夜(22:00→08:00)也支持 */}
      <div style={fieldRowStyle}>
        <span style={fieldLabelStyle}>{t('row.quietHours')}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="time"
            value={draft.quietHoursStart ?? ''}
            onChange={event => { edit('quietHoursStart', event.currentTarget.value) }}
            aria-label={t('row.quietHours')}
            style={inputStyle(false)}
          />
          <span style={captionStyle}>→</span>
          <input
            type="time"
            value={draft.quietHoursEnd ?? ''}
            onChange={event => { edit('quietHoursEnd', event.currentTarget.value) }}
            aria-label={t('row.quietHours')}
            style={inputStyle(false)}
          />
        </span>
      </div>

      {/* 提示声音色:开启消息提示音时展开 */}
      {showVariant && (
        <div style={fieldRowStyle}>
          <span style={fieldLabelStyle}>{t('row.soundVariant')}</span>
          <PillGroup
            value={draft.soundVariant ?? 'beep'}
            options={QQ_SKIN_SOUND_VARIANTS.map(variant => ({ id: variant, label: t(SOUND_VARIANT_LABEL_KEYS[variant]) }))}
            onChange={id => { edit('soundVariant', id as QQSkinSoundVariant) }}
          />
        </div>
      )}

      {/* 自定义助手头像:空 = 官方企鹅;本地图片走选择按钮,链接走输入框 */}
      {showAvatarFields && (
        <div style={{ ...fieldRowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: '6px' }}>
          <span style={fieldLabelStyle}>{t('row.avatarCustomImage')}</span>
          <AvatarImagePicker
            t={t}
            hasImage={imageIsLocal}
            onPicked={pickLocalImage}
            onError={() => { setImageError(true) }}
            onClear={() => { setImageError(false); edit('avatarCustomImage', '') }}
          />
          <input
            type="text"
            value={draft.avatarCustomImage ?? ''}
            placeholder="https://… / data:image/…"
            onChange={event => { setImageError(false); edit('avatarCustomImage', event.currentTarget.value) }}
            onBlur={commitAvatarImage}
            style={{ ...inputStyle(false), width: '240px' }}
          />
          {imageError && <span style={{ ...captionStyle, color: 'var(--dsw-alias-state-error-primary)' }}>{t('card.imageError')}</span>}
          {imageIsLocal && !imageError && <span style={captionStyle}>{t('card.imageSet')}</span>}
        </div>
      )}

      {/* 助手头像尺寸:16~40px */}
      {showAvatarFields && (
        <div style={fieldRowStyle}>
          <span style={fieldLabelStyle}>{t('row.avatarSize')}</span>
          <NumberField
            value={sizeDraft}
            focused={sizeFocused}
            onFocusChange={setSizeFocused}
            onChange={setSizeDraft}
            onCommit={commitSize}
            width="72px"
            min={AVATAR_SIZE_MIN}
            max={AVATAR_SIZE_MAX}
            step={2}
          />
        </div>
      )}

      {/* 提示音音量:0~1 */}
      {showVolume && (
        <div style={fieldRowStyle}>
          <span style={fieldLabelStyle}>{t('row.soundVolume')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="number"
              min={SOUND_VOLUME_MIN}
              max={SOUND_VOLUME_MAX}
              step={0.05}
              value={volumeDraft}
              onChange={event => { setVolumeDraft(event.currentTarget.value) }}
              onFocus={() => { setVolumeFocused(true) }}
              onBlur={() => { setVolumeFocused(false); commitVolume() }}
              onKeyDown={event => { if (event.key === 'Enter') commitVolume() }}
              style={{ ...inputStyle(volumeFocused), width: '72px' }}
            />
            <span style={captionStyle}>0~1</span>
          </span>
        </div>
      )}

      {/* 会话宽度:480~1600px */}
      <div style={fieldRowStyle}>
        <span style={fieldLabelStyle}>{t('row.chatMaxWidth')}</span>
        <NumberField
          value={widthDraft}
          focused={widthFocused}
          onFocusChange={setWidthFocused}
          onChange={setWidthDraft}
          onCommit={commitWidth}
          width="96px"
          min={CHAT_MAX_WIDTH_MIN}
          max={CHAT_MAX_WIDTH_MAX}
          step={20}
        />
      </div>

      {/* 保存/放弃行:只有保存才写入;只读文档时禁用并提示 */}
      <div style={actionRowStyle}>
        {!writable && <span style={noticeStyle}>{t('card.readOnly')}</span>}
        {saveError && <span style={{ ...captionStyle, color: 'var(--dsw-alias-state-error-primary)' }}>{t('card.saveFailed')}</span>}
        {dirty && (
          <button
            type="button"
            onClick={() => { setDraft(JSON.parse(externalText) as QQSkinSettings) }}
            style={discardButtonStyle}
          >
            {t('card.discard')}
          </button>
        )}
        <button
          type="button"
          onClick={() => { void save() }}
          disabled={!dirty || saving || !writable}
          style={saveButtonStyle(!dirty || saving || !writable)}
        >
          {saving ? t('card.saving') : t('card.save')}
        </button>
      </div>
    </div>
  )
}
