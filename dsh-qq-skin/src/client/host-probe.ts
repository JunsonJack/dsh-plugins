/**
 * 宿主 DOM 锚点探针 —— 把皮肤依赖的宿主内部结构选择器的「假设」集中到
 * 单一真相源,并提供一次性的健康检查,专治宿主升级后的**静默失配**。
 *
 * ## 为什么需要
 *
 * 皮肤的两层贡献里,token 层走官方 `--dsw-*` 契约,稳定;布局层与时间
 * 分隔条却依赖 harness 的内部 DOM 结构(`data-*` 属性与少量 CSS Modules
 * 类名后缀)。这些是内部实现而非公开契约,宿主一次重排就可能让某条规则
 * 悄悄失效 —— 气泡不再白字、日期条不再出现,但插件毫无报错,只能靠肉眼
 * 发现。本模块把这类假设集中登记,并提供 `probeHostAnchors` 在运行时核对:
 * 缺失即通过 `console.warn` 明确告警,维护者升级 harness 时也有一个文件
 * 可以逐条核对。
 *
 * ## 三态语义
 *
 * - `present` —— 找到至少一个匹配节点,假设成立;
 * - `missing` —— 会话已就绪但该锚点一个节点都没有(报告里如实记录,
 *   **但只有「必需锚点」的缺失才进 `missing` 集合并触发告警**);
 * - `pending` —— 会话尚未就绪,现在判断会误报,留待渲染完成后再查。
 *
 * 就绪判据是「聊天流(`data-chat-flow`)在场,**且** `flowKey` /
 * `userBubble` / `clock` 至少一个在场」。只看聊天流会把「会话刚打开、
 * 消息行还没渲染」误判成就绪;但也不能把 flowKey 单独当门(它自己改名
 * 会让 ready 永远为假,探针反而变瞎),故取三者任一作为「有消息了」。
 *
 * ## 必需 vs 按需
 *
 * 锚点分两档(见 `REQUIRED_ANCHORS`):
 * - **必需** —— 会话一旦渲染出消息就必然在场,缺失即结构失配,要告警;
 * - **按需** —— 只在特定状态下出现,缺席是正常的:
 *   `clock` 挂在回合尾部(流式输出/无用量文案时可能尚未渲染),
 *   `replyBubble` 只在回答过 ask_user_question 的会话里存在。
 *   把它们纳入告警集合,会让「新建空会话」「只有助手消息的会话」每次
 *   都收到一条假失配警告 —— 正是本探针要消灭的那类噪音。
 *
 * ## 边界
 *
 * 探针只读 DOM、只发告警,**不改变任何皮肤行为**,也不引入 observer/定时
 * 器等新的生命周期。逻辑保持为纯函数,便于在 node + stub 下测试。
 */

/**
 * 用户气泡的**基础**属性选择器(单写)。布局层需要更高特异度时会把它重复
 * 成 `[data-message-bubble][data-message-bubble]`;探针只需判断存在性,用
 * 基础版即可。导出为常量,避免两处各写一遍字符串而走散。
 */
export const USER_BUBBLE_BASE_SELECTOR = '[data-message-bubble]'

/**
 * 宿主结构锚点:key 是稳定 ID(用于报告),value 是 CSS 选择器。
 *
 * ⚠ 修改这里的值前先确认:qq-layout.ts / qq-time-divider.ts 里的选择器必须
 * 与本表一致。两者都已直接 import 本表(布局层另用
 * `USER_BUBBLE_BASE_SELECTOR` 拼高特异度版本),改这里即对两层生效,
 * 探针与规则不会走散。
 */
export const HOST_SELECTORS = {
  /** 聊天流容器 —— 就绪判定的基准锚点(ChatView)。 */
  chatFlow: '[data-chat-flow]',
  /** 流 item —— 消息行与分组容器(ChatGroupSeat)。 */
  flowKey: '[data-chat-flow-key]',
  /** 用户消息气泡 —— 白字/尾巴规则的锚点。 */
  userBubble: USER_BUBBLE_BASE_SELECTOR,
  /** 时间 chip —— 分隔条的数据源,文本可能混有「用量 xx tok」前缀。 */
  clock: '[data-clock]',
  /** 回执气泡 —— 依赖宿主类名拼接顺序,失配风险最高的复合选择器。 */
  replyBubble: "[data-question-reply] [class$='_bubble']",
  /** 会话头部 —— 细分割线锚点;特意限定 header 以免误伤侧栏面板。 */
  sessionHeader: "header[class$='_header']",
} as const

/**
 * 必需锚点:会话一旦渲染出消息行就必然在场,缺席即宿主结构失配。
 *
 * `clock` 与 `replyBubble` 故意不在此列 —— 它们是按需出现的,纳入告警
 * 会让新建空会话 / 只含助手消息的会话每次都收到假失配警告。
 * `sessionHeader` 同属按需(部分视图没有 ConversationSession 的 header)。
 */
export const REQUIRED_ANCHORS: ReadonlySet<keyof typeof HOST_SELECTORS> = new Set([
  'chatFlow', 'flowKey', 'userBubble',
])

/** 锚点 ID(HOST_SELECTORS 的键)。 */
export type HostAnchorId = keyof typeof HOST_SELECTORS

/** 单个锚点的探测结果。 */
export interface AnchorProbeResult {
  /** 锚点 ID。 */
  id: HostAnchorId
  /** 用于探测的 CSS 选择器。 */
  selector: string
  /** 三态结果。 */
  status: 'present' | 'missing' | 'pending'
  /** 匹配到的节点数(0 表示未匹配或尚未渲染)。 */
  count: number
}

/** 一次探针检查的完整结果。 */
export interface HostProbeReport {
  /** 会话是否已就绪(聊天流在场且至少一条消息内容锚点在场)。 */
  ready: boolean
  /** 各锚点的逐一结果(按需锚点的缺席也如实记为 missing,只是不告警)。 */
  anchors: AnchorProbeResult[]
  /** 就绪后仍缺失的**必需**锚点 ID 列表 —— 真正需要告警的集合。 */
  missing: HostAnchorId[]
}

/** 探针所需的最小 DOM 接口 —— 便于在 node/stub 下测试。 */
export interface ProbeRoot {
  querySelectorAll(selector: string): ArrayLike<unknown>
}

/**
 * 探测宿主结构锚点。
 *
 * @param root - 查询根(通常是 `document`;测试可传任意实现 `querySelectorAll` 的桩)。
 * @returns 结构化报告;会话未就绪时 `ready=false` 且所有结果都是 pending。
 */
export function probeHostAnchors(root: ProbeRoot | undefined | null): HostProbeReport {
  const query = (selector: string): number => {
    if (root === undefined || root === null || typeof root.querySelectorAll !== 'function') return 0
    try {
      const found = root.querySelectorAll(selector)
      return found === undefined || found === null ? 0 : found.length
    } catch {
      // 选择器若因宿主/环境差异抛错,当作未匹配处理,绝不让探针拖垮皮肤。
      return 0
    }
  }

  const ids = Object.keys(HOST_SELECTORS) as HostAnchorId[]
  const counts = new Map<HostAnchorId, number>()
  for (const id of ids) counts.set(id, query(HOST_SELECTORS[id]))

  // 就绪判据:聊天流在场,且至少有一条消息内容锚点在场。
  // - 只看 chatFlow 会把「空会话 / 消息行还没渲染」误判成就绪;
  // - 但也不能把 flowKey 单独当门:若宿主把 flowKey 改名,ready 会永远
  //   为假,连 userBubble 的失配也一并被掩盖(探针反而变瞎)。
  //   故用 flowKey / userBubble / clock 三者任一作为「有消息了」的信号。
  const ready = (counts.get('chatFlow') ?? 0) > 0
    && (['flowKey', 'userBubble', 'clock'] as const).some(id => (counts.get(id) ?? 0) > 0)
  const anchors: AnchorProbeResult[] = ids.map((id) => {
    const count = counts.get(id) ?? 0
    let status: AnchorProbeResult['status']
    if (!ready) status = 'pending'
    else if (id === 'chatFlow') status = 'present' // ready 为真时基准锚点必然 present
    else status = count > 0 ? 'present' : 'missing'
    return { id, selector: HOST_SELECTORS[id], status, count }
  })

  // 只有必需锚点的缺失才进告警集合。按需锚点(clock / replyBubble /
  // sessionHeader)缺席是正常状态,仍记在 anchors 里供排查,但不告警。
  const missing = anchors
    .filter((a) => a.status === 'missing' && REQUIRED_ANCHORS.has(a.id))
    .map((a) => a.id)
  return { ready, anchors, missing }
}

/**
 * 把探针报告格式化为单行告警文案(仅在有 missing 时有内容)。
 *
 * @param report - `probeHostAnchors` 的结果。
 * @returns 可直接交给 `console.warn` 的字符串;无缺失返回空串。
 */
export function formatHostProbeReport(report: HostProbeReport): string {
  if (report.missing.length === 0) return ''
  // 只列真正进 missing 集合的必需锚点。不能遍历 anchors 的 missing 状态:
  // 那会把按需锚点(clock / replyBubble / sessionHeader)的正常缺席也写成
  // 「规则可能不生效」,制造本探针要消灭的假噪音。
  const details = report.missing
    .map((id) => `${id} (${HOST_SELECTORS[id]})`)
    .join(', ')
  return `[dsh-qq-skin] 宿主 DOM 锚点失配,以下皮肤规则可能不生效: ${details}。` +
    '如为 harness 升级所致,请核对 src/client/host-probe.ts 的 HOST_SELECTORS。'
}

/**
 * 在宿主页面挂载一次性探针:聊天流已渲染则立即核对;否则用 sentinel
 * observer 等它出现,就绪后核对一次即断开。只在发现缺锚点时告警一次,
 * 不改变任何皮肤行为。
 *
 * 通过回调注入 cleanup 注册与告警出口,而非直接依赖 cordis 的 `ctx.effect`
 * 或 `console`,使本函数可在 node + stub 下完整测试。
 *
 * @param registerCleanup - 注册 effect 清理函数(通常是 `fn => ctx.effect(() => fn, label)`)。
 * @param warn - 告警出口,默认 `console.warn`。
 */
export function installHostProbe(
  registerCleanup: (cleanup: () => void) => void,
  warn: (message: string) => void = (message) => console.warn(message),
): void {
  let warned = false

  /** 执行一次核对;返回宿主是否已就绪(聊天流在场)。 */
  const check = (): boolean => {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return false
    const report = probeHostAnchors(document)
    if (!report.ready) return false
    const text = formatHostProbeReport(report)
    if (text !== '' && !warned) {
      warned = true
      warn(text)
    }
    return true
  }

  // 快路径:聊天流已在场,核对完即结束,无需 observer。
  if (check()) return

  // 慢路径:会话尚未渲染,用 sentinel observer 等基准锚点出现。
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  const target = document.body ?? document.documentElement
  if (target === undefined || target === null) return

  const observer = new MutationObserver(() => {
    if (check()) observer.disconnect()
  })
  observer.observe(target, { childList: true, subtree: true })
  registerCleanup(() => observer.disconnect())
}
