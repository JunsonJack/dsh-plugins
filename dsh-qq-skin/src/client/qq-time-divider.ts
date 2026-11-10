/**
 * QQ 风格消息时间分隔条:跨天消息前插入居中日期条(如「今天」/「11月8日」),
 * 还原 QQ 聊天流的时间分组观感。
 *
 * 时间源:宿主的时间 chip(`[data-clock]` 容器,文本由 formatMessageClock
 * 生成——当天 `HH:mm`、今年内 `M月D日 HH:mm`/`M/D HH:mm`、跨年
 * `YYYY年M月D日 HH:mm`/`YYYY-M-D HH:mm`)。宿主不在 DOM 上暴露原始时间戳
 * (data-time/ts/created/timestamp 均无),故解析 chip 文本是唯一可靠时间源。
 *
 * ⚠ 该容器不只放时间,且不在用户行:宿主把「用量 xx tok」文案与时钟并列
 * 渲染在同一个 `[data-clock]` 里(clock="end" 位于回合尾部的 turn-tail 行,
 * 实测文本形如「用量 72.3K tok19:57」),用户行的 DOM 里没有 chip。所以:
 * 1) 时间用 extractClock 在任意位置抽取,不做整段锚定匹配;
 * 2) 分组以「回合」为单位——分隔条插在该回合首行(通常是用户行)之前,
 *    时间取自同回合内任意一行的 chip(通常是结尾的 turn-tail)。
 *
 * 分隔条文本:直接复用 chip 的日期部分(去掉尾部时间),与宿主本地化格式
 * 天然一致;当天 chip 只有时间,替换为「今天」文案(setTodayLabel 注入)。
 *
 * 注入机制:两段式懒挂载——sentinel observer 等
 * `[data-chat-flow]` 出现,flow observer 只在「流 item / 时间 chip 有增删」
 * 时安排一次防抖的增量判定,再做全量对齐。
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
/** 流 item 选择器:所有消息行与分组容器(ChatGroupSeat)都带该属性。 */
const FLOW_KEY_SELECTOR = '[data-chat-flow-key]'
/** 回合标识属性:同一回合的多行共享同一 data-chat-turn 值。 */
const TURN_ATTRIBUTE = 'data-chat-turn'
/** 时间 chip 容器(助手回合 clock='end',位于该回合的 turn-tail 行)。 */
const CLOCK_SELECTOR = '[data-clock]'
/**
 * 时间片段的候选模式,按「信息量从多到少」排列:跨年 → 今年内 → 当天。
 * 全部不锚定首尾,因为 chip 文本里可能混有「用量 xx tok」前缀。
 *
 * 前提:宿主 clock.md/clock.ymd 在全部 8 个 locale 下都是纯数字日期
 * (zh `{m}月{d}日`/`{y}年{m}月{d}日`,其余 `{m}/{d}`/`{y}-{m}-{d}`),
 * 不存在 `Dec 31, 2025` 这类文本月份。若将来宿主改成文本日期,这里只会
 * 命中当天模式而把日期降级成「今天」——宁可无条也不要错条,故不额外兜底。
 */
const CLOCK_PATTERNS: ReadonlyArray<RegExp> = [
  /(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?\s+(\d{1,2}):(\d{2})/,
  /(\d{1,2})[月/](\d{1,2})日?\s+(\d{1,2}):(\d{2})/,
  /(\d{1,2}):(\d{2})/,
]
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
 * 从 chip 容器文本里抽出宿主 formatMessageClock 生成的时间片段。
 *
 * 宿主把「用量 xx tok」文案与时钟并列渲染在同一个 `[data-clock]` 容器里,
 * 实测文本形如「用量 72.3K tok19:57」,所以不能对整段文本做锚定匹配。
 * 候选片段的尾巴若紧跟 ':' 或数字,说明它只是更长数字串的一部分
 * (如「12:30:45」的秒),该候选作废,继续尝试信息量更少的模式。
 * @param text - 容器文本(可能含前后噪声)。
 * @returns 时间片段文本(如 `19:57`、`11月8日 20:14`);未匹配返回 undefined。
 */
export function extractClock(text: string | undefined | null): string | undefined {
  if (!text) return undefined
  const value = text.trim()
  if (!value) return undefined
  for (const pattern of CLOCK_PATTERNS) {
    // 逐个候选检查:一条文本里可能有多个时间串(前面那个带秒被否掉),
    // 不能用 exec 只取首个匹配就降级到更弱的模式。
    const scanner = new RegExp(pattern.source, 'g')
    for (const match of value.matchAll(scanner)) {
      const next = value[(match.index ?? 0) + match[0].length]
      if (next === ':' || (next !== undefined && /\d/.test(next))) continue
      return match[0]
    }
  }
  return undefined
}

/**
 * 解析时间 chip 文本为时间戳。
 * @param text - chip 容器文本,格式见宿主 formatMessageClock(可含用量前缀)。
 * @returns 时间戳(ms);无法识别或数值越界返回 undefined。
 */
export function parseClockText(text: string | undefined | null): number | undefined {
  const clock = extractClock(text)
  if (!clock) return undefined
  const value = clock
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
 * 计算每个「回合」前应插入的分隔条文本(undefined = 不插)。
 * 首个可解析的回合前必插;随后仅当日期键变化时插入。
 * @param chipTexts - 与回合顺序一致的 chip 容器文本数组(该回合无 chip 为 undefined)。
 * @returns 与输入等长的数组,元素为分隔条文本或 undefined。
 */
export function planDividers(
  chipTexts: ReadonlyArray<string | undefined | null>,
): Array<string | undefined> {
  const plan: Array<string | undefined> = []
  let lastKey: string | undefined
  for (const raw of chipTexts) {
    // 先抽时间片段:chip 文本可能混有「用量 xx tok」前缀,整段匹配会失败。
    const clock = extractClock(typeof raw === 'string' ? raw : undefined)
    const timeMs = clock === undefined ? undefined : parseClockText(clock)
    if (clock === undefined || timeMs === undefined) {
      plan.push(undefined)
      continue
    }
    const key = dayKey(timeMs)
    if (lastKey === undefined || key !== lastKey) {
      plan.push(labelOf(clock))
    } else {
      plan.push(undefined)
    }
    lastKey = key
  }
  return plan
}

/**
 * 全量对齐聊天流里的分隔条:先按回合算出期望分隔条,再与现有分隔条比对,
 * 完全一致(数量/文本/位置)时零变更;不一致才先删旧条再按位置插入新条。
 * 幂等——同一批消息反复对齐结果一致,不会自我触发 observer 循环。
 * @param flow - 聊天流容器。
 */
export function alignDividers(flow: Element): void {
  if (typeof flow.querySelectorAll !== 'function') return
  const rows = leafRows(flow)
  const chipByRow = collectChipTexts(flow, rows)
  const groups = groupByTurn(rows)
  const plan = planDividers(groups.map(group => groupChipText(group.rows, chipByRow)))
  const existing = Array.from(flow.querySelectorAll(`[${DIVIDER_ATTRIBUTE}]`))
  let planned = 0
  for (const label of plan) if (label !== undefined) planned++
  if (existing.length === planned) {
    let aligned = true
    let at = 0
    for (let i = 0; i < plan.length; i++) {
      if (plan[i] === undefined) continue
      const el = existing[at]
      const first = groups[i]?.rows[0]
      const anchor = first === undefined ? undefined : anchorOf(first)
      if (!el || el.textContent !== plan[i] || el.nextElementSibling !== anchor) {
        aligned = false
        break
      }
      at++
    }
    if (aligned) return
  }
  for (const el of existing) el.remove()
  for (let i = 0; i < plan.length; i++) {
    const label = plan[i]
    if (label === undefined) continue
    const first = groups[i]?.rows[0]
    if (!first) continue
    // anchorOf 而非直接 first:首行可能位于 ChatGroupSeat 的折叠 body 内,
    // 插在 body 里会随折叠一起被裁掉;锚到最近的流 item(=容器)才可见。
    // 用 anchor.before 而非 flow.insertBefore:不假设锚点是 flow 直接子节点
    // (分组嵌套时 insertBefore 会抛 NotFoundError 且每次重扫重复抛)。
    anchorOf(first).before(buildDivider(label))
  }
}

/** 一个回合:同 data-chat-turn 的连续流 item。 */
interface TurnGroup {
  /** 回合标识;行上没有该属性时为 undefined(退化为「每行一组」)。 */
  turn: string | undefined
  /** 该回合的流 item,按 DOM 顺序。 */
  rows: Element[]
}

/**
 * 取聊天流里的叶子流 item(排除 ChatGroupSeat 这类嵌套了其它流 item 的分组容器)。
 *
 * 性能:宿主把整段 Markdown 渲染在流 item 内,长会话下单行子树可达上千节点。
 * 旧实现对每行做一次 `row.querySelector(FLOW_KEY_SELECTOR)` 子树查询
 * (183 行 ≈ 183 次全子树遍历,每次重扫都付一遍);这里改为沿着
 * `parentElement` 上溯:谁的祖先里出现另一个流 item,谁就是容器。
 * 代价是 O(行数 × 层级深度)的纯属性访问,不碰子树。
 * @param flow - 聊天流容器。
 * @returns 叶子流 item,按 DOM 顺序。
 */
function leafRows(flow: Element): Element[] {
  const all = Array.from(flow.querySelectorAll(FLOW_KEY_SELECTOR))
  if (all.length < 2) return all
  const known = new Set<Element>(all)
  const containers = new Set<Element>()
  for (const row of all) {
    let parent = parentOf(row)
    while (parent !== null) {
      if (known.has(parent)) {
        containers.add(parent)
        break
      }
      parent = parentOf(parent)
    }
  }
  if (containers.size === 0) return all
  return all.filter(row => !containers.has(row))
}

/** 取父元素;stub 环境(无 parentElement)返回 null。 */
function parentOf(el: Element): Element | null {
  return (el as Element & { parentElement?: Element | null }).parentElement ?? null
}

/**
 * 元素是否仍在文档里。stub 环境没有 `isConnected`(undefined)时按「仍连接」
 * 处理,避免测试桩被误判成已分离。
 * @param el - 待判定的元素。
 */
function isConnected(el: Element): boolean {
  return (el as Element & { isConnected?: boolean }).isConnected !== false
}

/**
 * 新增/删除的节点是否可能影响分隔条:是流 item,或内含流 item / 时间 chip。
 *
 * 只关心这两类,是因为分隔条的期望完全由「回合划分(流 item)」与
 * 「chip 文本(时钟)」决定:流式输出期间宿主持续替换 Markdown 子节点,
 * 那些变化与分隔条无关,不应触发全量重扫。
 * @param node - mutation 记录里的新增/删除节点。
 */
function isFlowNode(node: Node): boolean {
  const el = node as Element | null
  if (el === null || typeof el.matches !== 'function') return false
  if (el.matches(FLOW_KEY_SELECTOR) || el.matches(CLOCK_SELECTOR)) return true
  if (typeof el.querySelector !== 'function') return false
  return el.querySelector(FLOW_KEY_SELECTOR) !== null || el.querySelector(CLOCK_SELECTOR) !== null
}

/**
 * 这批 mutation 是否值得重扫(见 `isFlowNode` 的取舍)。
 * @param mutations - observer 回调收到的记录。
 */
function touchesFlow(mutations: readonly MutationRecord[]): boolean {
  for (const mutation of mutations) {
    // 文本变化:只有落在 chip 内部的才可能改分组的日期(流式正文的
    // 逐字更新全部落空),用 closest 一次上溯判定,不做子树查询。
    if (mutation.type === 'characterData') {
      if (isInsideClock(mutation.target)) return true
      continue
    }
    for (const node of mutation.addedNodes) {
      if (isFlowNode(node)) return true
    }
    for (const node of mutation.removedNodes) {
      if (isFlowNode(node)) return true
    }
  }
  return false
}

/**
 * 节点是否位于时间 chip 内(chip 文本被原地改写时要重扫)。
 * @param node - 文本节点或其父元素。
 */
function isInsideClock(node: Node): boolean {
  const parent = (node as Node & { parentElement?: Element | null }).parentElement
  if (parent === undefined || parent === null) return false
  const closest = (parent as Element & { closest?: (selector: string) => Element | null }).closest
  if (typeof closest !== 'function') return false
  return closest.call(parent, CLOCK_SELECTOR) !== null
}

/** 读取行所属回合标识;stub 环境(无 getAttribute)返回 undefined。 */
function turnOf(row: Element): string | undefined {
  if (typeof row.getAttribute !== 'function') return undefined
  return row.getAttribute(TURN_ATTRIBUTE) ?? undefined
}

/**
 * 按回合把流 item 分组(连续同 turn 归一组)。
 * 行上都没有 turn 属性时退化为「每行一组」,与逐行判定等价。
 * @param rows - 按 DOM 顺序排列的叶子流 item。
 */
function groupByTurn(rows: readonly Element[]): TurnGroup[] {
  const groups: TurnGroup[] = []
  let current: TurnGroup | undefined
  for (const row of rows) {
    const turn = turnOf(row)
    // 缺 turn 属性的行并入当前组(宿主偶发不输出该属性,此时若新开组,
    // 分隔条会落到该回合并未被时钟覆盖的那一行上);组本身无 turn 时
    // (拿不到任何标识)仍退化为每行一组。
    if (
      current !== undefined &&
      current.turn !== undefined &&
      (turn === undefined || current.turn === turn)
    ) {
      current.rows.push(row)
    } else {
      current = { turn, rows: [row] }
      groups.push(current)
    }
  }
  return groups
}

/**
 * 一次性收集每行的时间 chip 文本:`flow.querySelectorAll('[data-clock]')`
 * 只遍历一遍子树,再沿 `parentElement` 上溯到所属的叶子流 item。
 *
 * 旧实现对每个回合做一次 `row.querySelector('[data-clock]')`(正序或尾部
 * 起始),长会话下是 O(行数 × 子树)。这里等价于用一次查询换掉 N 次。
 * stub 环境(chip 没有 parentElement、上溯不到行)回落到逐行 `querySelector`,
 * 保持与原实现一致的行为。
 *
 * @param flow - 聊天流容器。
 * @param rows - 本次参与分组的叶子流 item。
 * @returns 行元素 → 首个非空 chip 文本。
 */
function collectChipTexts(flow: Element, rows: readonly Element[]): Map<Element, string> {
  const byRow = new Map<Element, string>()
  const rowSet = new Set<Element>(rows)
  if (typeof flow.querySelectorAll !== 'function') return byRow
  for (const chip of flow.querySelectorAll(CLOCK_SELECTOR)) {
    const text = chip.textContent?.trim()
    if (!text) continue
    // 沿祖先上溯找到最近的叶子流 item(行);不在本次 rows 内的 chip 忽略。
    let node: Element | null = parentOf(chip)
    while (node !== null && !rowSet.has(node)) node = parentOf(node)
    if (node === null) continue
    if (!byRow.has(node)) byRow.set(node, text)
  }
  return byRow
}

/**
 * 取回合内的时间 chip 文本:优先用一次性收集的结果,缺失时逐行兜底。
 * @param rows - 该回合的流 item。
 * @param chipByRow - collectChipTexts 的收集结果。
 * @returns 首个非空 chip 文本;全无则 undefined。
 */
function groupChipText(rows: readonly Element[], chipByRow: ReadonlyMap<Element, string>): string | undefined {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (row === undefined) continue
    const collected = chipByRow.get(row)
    if (collected !== undefined) return collected
    if (typeof row.querySelector !== 'function') continue
    const text = row.querySelector(CLOCK_SELECTOR)?.textContent?.trim()
    if (text) return text
  }
  return undefined
}

/**
 * 取分隔条的实际锚点:首行若嵌在分组容器(ChatGroupSeat)内,锚到最近的流
 * item(=容器本身),否则分隔条会跟着容器折叠一起被裁掉、等于没插。
 * @param first - 回合首行。
 * @returns 用于 `before()` 的锚点元素。
 */
function anchorOf(first: Element): Element {
  const closest = (first as Element & { closest?: (selector: string) => Element | null }).closest
  if (typeof closest !== 'function') return first
  return closest.call(first, FLOW_KEY_SELECTOR) ?? first
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
 *
 * sentinel 常驻(启用期间不卸载):宿主会重建聊天流元素(切换会话、
 * 进入设置页再返回),只观察首次找到的 flow 会让 observer 绑在已分离的
 * 旧元素上——分隔条从此不再出现。sentinel 保留下来负责两件事:发现新
 * flow 时挂上 flow observer;发现已观察的 flow 从文档分离时重挂自己。
 */
export class QQTimeDividerRuntime {
  /** 当前生效配置(热更新后保持最新)。 */
  private config: QQSkinConfig
  /** sentinel observer:发现 flow 挂 observer;flow 分离后等新 flow 出现。 */
  private sentinel: MutationObserver | undefined
  /** flow observer:监听聊天流变化后防抖全量对齐;未启用时为 undefined。 */
  private observer: MutationObserver | undefined
  /** flow observer 当前绑定的聊天流(分离检测的对照物)。 */
  private observedFlow: Element | undefined
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
      this.clearMountedFlow()
      return
    }
    this.applyObserver(config)
  }

  /** 卸载两个 observer、防抖定时与已插入的分隔条(插件 dispose 与热更新时共用)。 */
  dispose(): void {
    this.disposeRescan()
    this.disposeObserver()
    this.disposeSentinel()
    this.clearMountedFlow()
  }

  /** 按配置挂载 sentinel(或直接挂 flow observer 如果聊天流已存在)。 */
  private applyObserver(config: QQSkinConfig): void {
    if (!config.timeDivider) return
    // 无 DOM 环境(测试/SSR)或 stub 环境不挂载。
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return

    // 快路径:聊天流已挂载,直接全量对齐后挂观察。
    const flow = document.querySelector(FLOW_SELECTOR)
    if (flow) {
      alignDividers(flow)
      this.mountFlowObserver(flow)
    }

    // sentinel 常驻:flow 已存在时它只负责分离检测;不存在时负责发现。
    this.mountSentinel()
  }

  /** 挂载 sentinel observer(启用期间的常驻兜底,不因找到 flow 而卸载)。 */
  private mountSentinel(): void {
    this.disposeSentinel()
    this.sentinel = new MutationObserver(() => this.reconcileFlow())
    this.sentinel.observe(document.body, { childList: true, subtree: true })
  }

  /**
   * sentinel 回调:让观察链跟上聊天流的挂载与重建。
   * flow 不存在 → 等下一次变化;出现且未被观察 → 挂 observer;
   * 已观察但已从文档分离 → 丢弃旧 observer,等新 flow 出现后重挂。
   */
  private reconcileFlow(): void {
    if (this.observer !== undefined && this.observedFlow !== undefined && !isConnected(this.observedFlow)) {
      this.disposeObserver()
    }
    if (this.observer !== undefined) return
    const target = document.querySelector(FLOW_SELECTOR)
    if (!target) return
    alignDividers(target)
    this.mountFlowObserver(target)
  }

  /**
   * 挂载 flow observer:只有「流 item / 时间 chip 有增删」才安排重扫。
   *
   * 直接对每条 mutation 重扫的旧实现在流式输出时最吃亏:助手 Markdown
   * 每个 token 批次都可能替换子树节点,但分隔条的期望值只随回合划分与
   * chip 文本变化。过滤后,一天之内的流式渲染不再触发全量对齐。
   * @param flow - 已挂载的聊天流容器。
   */
  private mountFlowObserver(flow: Element): void {
    if (this.observer !== undefined && this.observedFlow === flow) return
    this.disposeObserver()
    this.observer = new MutationObserver((mutations) => {
      if (touchesFlow(mutations)) this.scheduleRescan(flow)
    })
    this.observer.observe(flow, { childList: true, subtree: true, characterData: true })
    this.observedFlow = flow
  }

  /** 清掉已挂载聊天流里的分隔条(dispose 与关闭开关共用)。 */
  private clearMountedFlow(): void {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return
    const flow = document.querySelector(FLOW_SELECTOR)
    if (flow) clearDividers(flow)
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
    this.observedFlow = undefined
  }
}
