/**
 * QQ 风格消息时间分隔条:跨天消息前插入居中日期条(如「今天」/「11月8日」),
 * 还原 QQ 聊天流的时间分组观感。
 *
 * 时间源:宿主消息行的时间 chip(`[data-clock]` 容器,文本由
 * formatMessageClock 生成——当天 `HH:mm`、今年内 `M月D日 HH:mm`/`M/D HH:mm`、
 * 跨年 `YYYY年M月D日 HH:mm`/`YYYY-M-D HH:mm`)。宿主不在 DOM 上暴露原始
 * 时间戳(data-time/ts/created/timestamp 均无),故解析 chip 文本是唯一
 * 可靠时间源;解析失败(格式变动/非消息行)的行跳过,不插入分隔条。
 *
 * 分隔条文本:直接复用 chip 的日期部分(去掉尾部时间),与宿主本地化格式
 * 天然一致;当天 chip 只有时间,替换为「今天」文案(setTodayLabel 注入)。
 *
 * 注入机制:两段式懒挂载(与音效层同款)——sentinel observer 等
 * `[data-chat-flow]` 出现,flow observer 监听子树变化后做全量对齐重扫。
 * 对齐是幂等的:现有分隔条与期望完全一致(数量/文本/位置)时零变更,
 * 不会触发 observer 自循环;只在状态不符时先删旧条再按位置插入新条。
 *
 * 分组规则:只按跨天分组(QQ NT 原味),不做同天间隔条(避免拍脑袋阈值)。
 * 首条可见消息前也插条(会话打开即见当天日期)。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { QQSkinConfig } from './config.ts'

/** 聊天流容器选择器(harness ChatView 的 data-chat-flow 属性)。 */
const FLOW_SELECTOR = '[data-chat-flow]'
/** 消息行选择器(排除处理中回合行;分组容器无 data-chat-flow-key)。 */
const ROW_SELECTOR = '[data-chat-flow-key]:not([data-chat-flow-kind="turn-process"])'
/** 时间 chip 容器(用户消息 clock='start',助手回合 clock='end')。 */
const CLOCK_SELECTOR = '[data-clock]'
/** 插件注入的分隔条标记(对齐与清理都以它为准)。 */
const DIVIDER_ATTRIBUTE = 'data-qq-time-divider'
/** flow 子树变化后的防抖窗口(ms):流式输出期间新增行频繁,合并重扫。 */
const RESCAN_DEBOUNCE_MS = 150

/** 「今天」文案提供函数(插件 apply 时注入,跟随宿主语言)。 */
let getTodayLabel: () => string = () => '今天'

/**
 * 设置「今天」文案提供函数。
 * @param get - 返回当前语言下的「今天」文案。
 */
export function setTodayLabel(get: () => string): void {
  getTodayLabel = get
}

/**
 * 解析时间 chip 文本为时间戳。
 * @param text - chip 文本,格式见宿主 formatMessageClock。
 * @returns 时间戳(ms);无法识别或数值越界返回 undefined。
 */
export function parseClockText(text: string | undefined | null): number | undefined {
  if (!text) return undefined
  const value = text.trim()
  if (!value) return undefined
  const now = Date.now()
  const nowDate = new Date(now)
  // 当天:HH:mm
  const timeOnly = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (timeOnly) {
    const hours = Number(timeOnly[1])
    const minutes = Number(timeOnly[2])
    return isValidTime(hours, minutes)
      ? withTime(nowDate, hours, minutes).getTime()
      : undefined
  }
  // 跨年:YYYY年M月D日 HH:mm / YYYY-M-D HH:mm
  const fullYear = /^(\d{4})[年-](\d{1,2})[月/-](\d{1,2})日?\s+(\d{1,2}):(\d{2})$/.exec(value)
  if (fullYear) {
    const month = Number(fullYear[2])
    const day = Number(fullYear[3])
    const hours = Number(fullYear[4])
    const minutes = Number(fullYear[5])
    return isValidDate(month, day) && isValidTime(hours, minutes)
      ? withTime(new Date(Number(fullYear[1]), month - 1, day), hours, minutes).getTime()
      : undefined
  }
  // 今年内:M月D日 HH:mm / M/D HH:mm
  const thisYear = /^(\d{1,2})[月/](\d{1,2})日?\s+(\d{1,2}):(\d{2})$/.exec(value)
  if (thisYear) {
    const month = Number(thisYear[1])
    const day = Number(thisYear[2])
    const hours = Number(thisYear[3])
    const minutes = Number(thisYear[4])
    return isValidDate(month, day) && isValidTime(hours, minutes)
      ? withTime(new Date(nowDate.getFullYear(), month - 1, day), hours, minutes).getTime()
      : undefined
  }
  return undefined
}

/**
 * 计算每条消息行前应插入的分隔条文本(undefined = 不插)。
 * 首条可解析行前必插;随后仅当日期键变化时插入。
 * @param chipTexts - 与消息行顺序一致的 chip 文本数组(无 chip 的行为 undefined)。
 * @returns 与输入等长的数组,元素为分隔条文本或 undefined。
 */
export function planDividers(
  chipTexts: ReadonlyArray<string | undefined | null>,
): Array<string | undefined> {
  const plan: Array<string | undefined> = []
  let lastKey: string | undefined
  for (const raw of chipTexts) {
    // trim 防御:尾随空白会让「日期部分 vs 纯时间」判定失真,误回退「今天」。
    const text = typeof raw === 'string' ? raw.trim() : raw
    const timeMs = text ? parseClockText(text) : undefined
    if (timeMs === undefined) {
      plan.push(undefined)
      continue
    }
    const key = dayKey(timeMs)
    if (lastKey === undefined || key !== lastKey) {
      plan.push(labelOf(text as string))
    } else {
      plan.push(undefined)
    }
    lastKey = key
  }
  return plan
}

/**
 * 全量对齐聊天流里的分隔条:先算期望分隔条,再与现有分隔条比对,
 * 完全一致(数量/文本/位置)时零变更;不一致才先删旧条再按位置插入新条。
 * 幂等——同一批消息反复对齐结果一致,不会自我触发 observer 循环。
 * @param flow - 聊天流容器。
 */
export function alignDividers(flow: Element): void {
  if (typeof flow.querySelectorAll !== 'function') return
  const rows = Array.from(flow.querySelectorAll(ROW_SELECTOR))
  const chipTexts = rows.map(row => {
    const text = row.querySelector(CLOCK_SELECTOR)?.textContent
    return text === undefined ? undefined : text.trim()
  })
  const plan = planDividers(chipTexts)
  const existing = Array.from(flow.querySelectorAll(`[${DIVIDER_ATTRIBUTE}]`))
  if (existing.length === plan.filter(label => label !== undefined).length) {
    let aligned = true
    let at = 0
    for (let i = 0; i < plan.length; i++) {
      if (plan[i] === undefined) continue
      const el = existing[at]
      if (!el || el.textContent !== plan[i] || el.nextElementSibling !== rows[i]) {
        aligned = false
        break
      }
      at++
    }
    if (aligned) return
  }
  for (const el of existing) el.remove()
  for (let i = 0; i < plan.length; i++) {
    if (plan[i] === undefined) continue
    const row = rows[i]
    if (!row) continue
    // row.before 而非 flow.insertBefore:不假设行是 flow 直接子节点
    // (分组嵌套时 insertBefore 会抛 NotFoundError 且每次重扫重复抛)。
    row.before(buildDivider(plan[i] as string))
  }
}

/** 移除聊天流内全部已插入的分隔条(关闭开关/插件卸载时调用)。 */
function clearDividers(flow: Element): void {
  if (typeof flow.querySelectorAll !== 'function') return
  for (const el of flow.querySelectorAll(`[${DIVIDER_ATTRIBUTE}]`)) el.remove()
}

/** 时分是否合法(HH:mm 的取值范围)。 */
function isValidTime(hours: number, minutes: number): boolean {
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

/** 月日是否合法(不做闰年级精确校验,chip 文本由宿主生成,不会越界)。 */
function isValidDate(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
}

/** 在指定日期上覆盖时分,返回新 Date(秒毫秒归零)。 */
function withTime(date: Date, hours: number, minutes: number): Date {
  const next = new Date(date.getTime())
  next.setHours(hours, minutes, 0, 0)
  return next
}

/** 取时间戳的本地日期键(YYYY-MM-DD),用于跨天比较。 */
function dayKey(timeMs: number): string {
  const date = new Date(timeMs)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 由 chip 文本取日期部分;当天(纯时间)回退「今天」文案。 */
function labelOf(chipText: string): string {
  const datePart = chipText.replace(/\s+\d{1,2}:\d{2}$/, '')
  return datePart.length > 0 && datePart !== chipText ? datePart : getTodayLabel()
}

/** 构造分隔条元素(日期文本居中,两侧细线由 CSS ::before/::after 绘制)。 */
function buildDivider(label: string): HTMLElement {
  const divider = document.createElement('div')
  divider.setAttribute(DIVIDER_ATTRIBUTE, '')
  divider.className = 'qq-time-divider'
  const text = document.createElement('span')
  text.textContent = label
  divider.appendChild(text)
  return divider
}

/**
 * 时间分隔条运行时:持有当前开关状态,管理 sentinel + flow 两个 observer。
 *
 * 生命周期与 cordis 一致:构造时按配置挂载 sentinel;`update` 按新配置
 * 启停整套观察链;插件 dispose 时通过 effect 清理。
 */
export class QQTimeDividerRuntime {
  /** 当前生效配置(热更新后保持最新)。 */
  private config: QQSkinConfig
  /** sentinel observer:等 [data-chat-flow] 出现;出现后自动卸载。 */
  private sentinel: MutationObserver | undefined
  /** flow observer:监听聊天流变化后防抖全量对齐;未启用时为 undefined。 */
  private observer: MutationObserver | undefined
  /** 重扫防抖定时器。 */
  private rescanTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * @param ctx - 客户端插件上下文(effect 生命周期)。
   * @param config - 初始配置。
   */
  constructor(ctx: Context, config: QQSkinConfig) {
    this.config = config
    ctx.effect(() => () => this.dispose(), 'dsh-qq-skin: time divider dispose')
    this.applyObserver(this.config)
  }

  /** 当前是否启用时间分隔条。 */
  isEnabled(): boolean {
    return this.config.timeDivider
  }

  /**
   * 热更新:以新配置启停 observer,不重启插件。
   * 关闭开关时同步移除已插入的分隔条(否则残留元素失去 CSS 门控,
   * 日期文本会以裸块散落在消息流里)。
   * @param config - 新配置。
   */
  update(config: QQSkinConfig): void {
    this.config = config
    this.disposeRescan()
    this.disposeObserver()
    this.disposeSentinel()
    if (!config.timeDivider) {
      // 已挂载的聊天流(若有)里的分隔条一并清掉,不留裸文本。
      if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
        const flow = document.querySelector(FLOW_SELECTOR)
        if (flow) clearDividers(flow)
      }
      return
    }
    this.applyObserver(config)
  }

  /** 卸载两个 observer、防抖定时与已插入的分隔条(插件 dispose 与热更新时共用)。 */
  dispose(): void {
    this.disposeRescan()
    this.disposeObserver()
    this.disposeSentinel()
    if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
      const flow = document.querySelector(FLOW_SELECTOR)
      if (flow) clearDividers(flow)
    }
  }

  /** 按配置挂载 sentinel(或直接挂 flow observer 如果聊天流已存在)。 */
  private applyObserver(config: QQSkinConfig): void {
    if (!config.timeDivider) return
    // 无 DOM 环境(测试/SSR)或 stub 环境不挂载,与音效层的防御一致。
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return

    // 快路径:聊天流已挂载,直接全量对齐后挂观察。
    const flow = document.querySelector(FLOW_SELECTOR)
    if (flow) {
      alignDividers(flow)
      this.mountFlowObserver(flow)
      return
    }

    // 慢路径:聊天流尚未挂载,用 sentinel observer 等它出现。
    this.sentinel = new MutationObserver(() => {
      const target = document.querySelector(FLOW_SELECTOR)
      if (!target) return
      alignDividers(target)
      this.disposeSentinel()
      this.mountFlowObserver(target)
    })
    this.sentinel.observe(document.body, { childList: true, subtree: true })
  }

  /** 挂载 flow observer,监听聊天流子树变化后防抖全量对齐。 */
  private mountFlowObserver(flow: Element): void {
    this.observer = new MutationObserver(() => this.scheduleRescan(flow))
    this.observer.observe(flow, { childList: true, subtree: true })
  }

  /** 防抖安排一次全量对齐(流式输出期间合并多次变化)。 */
  private scheduleRescan(flow: Element): void {
    this.disposeRescan()
    this.rescanTimer = setTimeout(() => alignDividers(flow), RESCAN_DEBOUNCE_MS)
  }

  /** 清除防抖定时器。 */
  private disposeRescan(): void {
    if (this.rescanTimer !== undefined) {
      clearTimeout(this.rescanTimer)
      this.rescanTimer = undefined
    }
  }

  /** 卸载 sentinel observer。 */
  private disposeSentinel(): void {
    this.sentinel?.disconnect()
    this.sentinel = undefined
  }

  /** 卸载 flow observer。 */
  private disposeObserver(): void {
    this.observer?.disconnect()
    this.observer = undefined
  }
}
