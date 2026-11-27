import { describe, expect, it, vi } from 'vitest'
import {
  HOST_SELECTORS,
  formatHostProbeReport,
  installHostProbe,
  probeHostAnchors,
  type AnchorProbeResult,
  type ProbeRoot,
} from '../src/client/host-probe.ts'

/** 用「每个选择器返回多少节点」构造一个最小 root 桩。 */
function rootWith(counts: Partial<Record<keyof typeof HOST_SELECTORS, number>>): ProbeRoot {
  return {
    querySelectorAll(selector: string) {
      const id = (Object.keys(HOST_SELECTORS) as Array<keyof typeof HOST_SELECTORS>)
        .find((key) => HOST_SELECTORS[key] === selector)
      const count = id ? (counts[id] ?? 0) : 0
      return Array.from({ length: count })
    },
  }
}

function resultOf(report: ReturnType<typeof probeHostAnchors>, id: keyof typeof HOST_SELECTORS): AnchorProbeResult {
  const found = report.anchors.find((a) => a.id === id)
  if (found === undefined) throw new Error(`anchor ${id} not in report`)
  return found
}

describe('host DOM anchor probe', () => {
  it('reports pending (not missing) when the chat flow has not rendered yet', () => {
    const report = probeHostAnchors(rootWith({ flowKey: 1, clock: 1 }))
    expect(report.ready).toBe(false)
    expect(report.missing).toEqual([])
    expect(report.anchors.every((a) => a.status === 'pending')).toBe(true)
    expect(formatHostProbeReport(report)).toBe('')
  })

  it('marks every present anchor as present once the flow exists', () => {
    const report = probeHostAnchors(rootWith({
      chatFlow: 1, flowKey: 4, userBubble: 2, clock: 2, replyBubble: 1, sessionHeader: 1,
    }))
    expect(report.ready).toBe(true)
    expect(report.missing).toEqual([])
    expect(resultOf(report, 'userBubble').status).toBe('present')
    expect(resultOf(report, 'userBubble').count).toBe(2)
    expect(formatHostProbeReport(report)).toBe('')
  })

  it('flags only missing REQUIRED anchors after the session is ready', () => {
    const report = probeHostAnchors(rootWith({ chatFlow: 1, flowKey: 3, clock: 1 }))
    expect(report.ready).toBe(true)
    expect(report.missing).toContain('userBubble') // 必需:有消息却没用户气泡 = 结构失配
    // 按需锚点缺席是正常的,记在 anchors 里但不进告警集合。
    expect(report.missing).not.toContain('replyBubble')
    expect(report.missing).not.toContain('sessionHeader')
    expect(report.missing).not.toContain('chatFlow')
    expect(report.missing).not.toContain('clock')
    expect(resultOf(report, 'replyBubble').status).toBe('missing')
    expect(formatHostProbeReport(report)).toContain('userBubble')
    expect(formatHostProbeReport(report)).toContain('host-probe.ts')
    // 告警文案只列必需锚点,不能把按需锚点的正常缺席写成「规则不生效」。
    const text = formatHostProbeReport(report)
    expect(text).not.toContain('replyBubble')
    expect(text).not.toContain('sessionHeader')
  })

  it('stays silent on an empty conversation (flow present, no messages yet)', () => {
    // 回归:旧版只看 chatFlow 就判 ready,新建空会话会收到一条
    // 「宿主 DOM 锚点失配」的假告警。现在消息内容锚点全无 → pending。
    const report = probeHostAnchors(rootWith({ chatFlow: 1, sessionHeader: 1 }))
    expect(report.ready).toBe(false)
    expect(report.missing).toEqual([])
    expect(report.anchors.every((a) => a.status === 'pending')).toBe(true)
    expect(formatHostProbeReport(report)).toBe('')
  })

  it('stays silent when only on-demand anchors are absent (assistant-only session)', () => {
    // 回归:只有助手消息、chip 尚未渲染、也没问过 ask_user_question 的会话。
    // clock / replyBubble / sessionHeader 缺席都属正常,不该告警。
    const report = probeHostAnchors(rootWith({
      chatFlow: 1, flowKey: 2, userBubble: 1,
    }))
    expect(report.ready).toBe(true)
    expect(report.missing).toEqual([])
    expect(resultOf(report, 'clock').status).toBe('missing')
    expect(resultOf(report, 'replyBubble').status).toBe('missing')
    expect(formatHostProbeReport(report)).toBe('')
  })

  it('keeps the probe sharp when flowKey itself is renamed by the host', () => {
    // 就绪判据不能把 flowKey 单独当门:它自己失配时 ready 会永远为假,
    // 连 userBubble 的失配也一并被掩盖。userBubble 在场即视为有消息。
    const report = probeHostAnchors(rootWith({ chatFlow: 1, userBubble: 1 }))
    expect(report.ready).toBe(true)
    expect(report.missing).toEqual(['flowKey'])
    expect(formatHostProbeReport(report)).toContain('flowKey')
  })

  it('tolerates a missing or non-conforming root without throwing', () => {
    expect(probeHostAnchors(undefined).ready).toBe(false)
    expect(probeHostAnchors(null).missing).toEqual([])
    expect(probeHostAnchors({ querySelectorAll: undefined as never }).anchors.every((a) => a.status === 'pending')).toBe(true)
  })

  it('tolerates a root whose querySelectorAll throws for a selector', () => {
    const throwing: ProbeRoot = {
      querySelectorAll(selector: string) {
        if (selector === HOST_SELECTORS.replyBubble) throw new Error('bad selector')
        // chatFlow + userBubble 在场 → 会话已就绪(否则全 pending,测不到抛错分支)。
        if (selector === HOST_SELECTORS.chatFlow || selector === HOST_SELECTORS.userBubble) return [{}]
        return []
      },
    }
    const report = probeHostAnchors(throwing)
    expect(report.ready).toBe(true)
    expect(resultOf(report, 'replyBubble').status).toBe('missing')
    expect(resultOf(report, 'replyBubble').count).toBe(0)
    expect(report.missing).not.toContain('replyBubble') // 按需锚点不告警
  })

  it('keeps the critical selectors byte-for-byte stable', () => {
    expect(HOST_SELECTORS.chatFlow).toBe('[data-chat-flow]')
    expect(HOST_SELECTORS.flowKey).toBe('[data-chat-flow-key]')
    expect(HOST_SELECTORS.userBubble).toBe('[data-message-bubble]')
    expect(HOST_SELECTORS.clock).toBe('[data-clock]')
    expect(HOST_SELECTORS.replyBubble).toBe("[data-question-reply] [class$='_bubble']")
    expect(HOST_SELECTORS.sessionHeader).toBe("header[class$='_header']")
  })
})

describe('installHostProbe', () => {
  /** 构造一个 querySelectorAll 按 counts 返回节点的 document 桩。 */
  function docWith(counts: Partial<Record<keyof typeof HOST_SELECTORS, number>>) {
    return {
      querySelector(selector: string) {
        return (counts.chatFlow ?? 0) > 0 && selector === HOST_SELECTORS.chatFlow ? {} : null
      },
      querySelectorAll(selector: string) {
        const id = (Object.keys(HOST_SELECTORS) as Array<keyof typeof HOST_SELECTORS>)
          .find((key) => HOST_SELECTORS[key] === selector)
        return Array.from({ length: id ? (counts[id] ?? 0) : 0 })
      },
      body: {},
      documentElement: {},
    }
  }

  it('warns once when the flow is ready but anchors are missing', () => {
    vi.stubGlobal('document', docWith({ chatFlow: 1, flowKey: 2 }))
    const warnings: string[] = []
    let cleanups = 0
    installHostProbe(() => { cleanups++ }, (m) => warnings.push(m))
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toContain('userBubble')
    expect(cleanups).toBe(0) // 快路径不注册清理,无 observer
    vi.unstubAllGlobals()
  })

  it('stays silent when all anchors are present', () => {
    vi.stubGlobal('document', docWith({
      chatFlow: 1, flowKey: 2, userBubble: 1, clock: 1, replyBubble: 1, sessionHeader: 1,
    }))
    const warnings: string[] = []
    installHostProbe(() => {}, (m) => warnings.push(m))
    expect(warnings).toEqual([])
    vi.unstubAllGlobals()
  })

  it('does not warn on an empty conversation, and only checks once messages arrive', () => {
    // 端到端回归:新建空会话一开始只有聊天流 + 头部,不应立刻告警;
    // 用户发出首条消息后(userBubble 在场)才真正核对,且此时无失配。
    let current = docWith({ chatFlow: 1, sessionHeader: 1 })
    vi.stubGlobal('document', {
      querySelector: (sel: string) => current.querySelector(sel),
      querySelectorAll: (sel: string) => current.querySelectorAll(sel),
      get body() { return current.body },
      get documentElement() { return current.documentElement },
    })
    let fire: (() => void) | undefined
    let disconnected = 0
    vi.stubGlobal('MutationObserver', class {
      constructor(callback: () => void) { fire = callback }
      observe() {}
      disconnect() { disconnected++ }
    })

    const warnings: string[] = []
    installHostProbe(() => {}, (m) => warnings.push(m))
    expect(warnings).toEqual([]) // 空会话,不误报
    expect(fire).toBeTypeOf('function')

    current = docWith({ chatFlow: 1, flowKey: 2, userBubble: 1, clock: 1 })
    fire?.()
    expect(warnings).toEqual([]) // 消息到了,必需锚点齐全,仍不告警
    expect(disconnected).toBe(1) // 一次性探针,核对完断开
    vi.unstubAllGlobals()
  })

  it('waits via a sentinel observer when the flow is not yet rendered, then checks once', () => {
    let current = docWith({ flowKey: 2 })
    vi.stubGlobal('document', {
      querySelector: (sel: string) => current.querySelector(sel),
      querySelectorAll: (sel: string) => current.querySelectorAll(sel),
      get body() { return current.body },
      get documentElement() { return current.documentElement },
    })

    let fire: (() => void) | undefined
    let disconnected = 0
    vi.stubGlobal('MutationObserver', class {
      constructor(callback: () => void) { fire = callback }
      observe() {}
      disconnect() { disconnected++ }
    })

    const warnings: string[] = []
    let cleanups = 0
    installHostProbe(() => { cleanups++ }, (m) => warnings.push(m))
    expect(warnings).toEqual([]) // 尚未就绪,不误报
    expect(cleanups).toBe(1) // 慢路径注册了清理
    expect(fire).toBeTypeOf('function')

    // 会话随后渲染完成,但用户气泡锚点没有了 -> 触发一次告警并断开。
    current = docWith({ chatFlow: 1, flowKey: 2 })
    fire?.()
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toContain('userBubble')
    expect(disconnected).toBe(1)

    // 再次触发不重复告警(一次性探针)。
    fire?.()
    expect(warnings.length).toBe(1)
    vi.unstubAllGlobals()
  })
})
