import { describe, expect, it, vi } from 'vitest'
import { parseClockText, planDividers, setTodayLabel, alignDividers, extractClock, QQTimeDividerRuntime } from '../src/client/qq-time-divider.ts'
import { Context } from '@deepseek-ai/cordis'
import { QQ_SKIN_DEFAULT_CONFIG } from '../src/client/config.ts'

/** 构造昨天的中文今年内 chip 文本(如「11月8日 09:05」)。 */
function zhYesterdayChip(): { chip: string; label: string } {
  const yest = new Date(Date.now() - 86400000)
  const chip = `${yest.getMonth() + 1}月${yest.getDate()}日 09:05`
  return { chip, label: `${yest.getMonth() + 1}月${yest.getDate()}日` }
}

/** 对齐链路用的最小 DOM stub:querySelectorAll 走数组过滤,元素带 before/remove。 */
function stubFlow(rows: Array<{ chip?: string; turn?: string; nestedUnder?: string }>) {
  const inserted: Array<{ textContent: string; removed?: boolean; nextElementSibling?: unknown }> = []
  // 分组容器(nestedUnder 指向的 ChatGroupSeat):分隔条应锚到容器本身。
  type ContainerStub = { el: { before: ReturnType<typeof vi.fn>; nextElementSibling?: unknown } }
  const containers = new Map<string, ContainerStub>()
  const makeContainer = (key: string): ContainerStub => {
    let entry = containers.get(key)
    if (entry === undefined) {
      const el: { before: ReturnType<typeof vi.fn>; nextElementSibling?: unknown } = { before: vi.fn() }
      el.before = vi.fn((divider: { textContent: string; nextElementSibling?: unknown }) => {
        divider.nextElementSibling = el
        inserted.push(divider as { textContent: string; removed?: boolean; nextElementSibling?: unknown })
      })
      entry = { el }
      containers.set(key, entry)
    }
    return entry
  }
  const rowEls = rows.map(row => {
    const el = {
      textContent: row.chip ?? '',
      remove: vi.fn(),
      getAttribute: (name: string) => (name === 'data-chat-turn' ? row.turn ?? null : null),
      before: vi.fn((divider: { textContent: string; nextElementSibling?: unknown }) => {
        // 回填兄弟关系:对齐的幂等判定比对 divider.nextElementSibling === 锚点。
        divider.nextElementSibling = el
        inserted.push(divider as { textContent: string; removed?: boolean; nextElementSibling?: unknown })
      }),
      nextElementSibling: undefined as unknown,
      // 首行嵌在分组容器内时 closest 返回容器;其余行没有 closest(同真实 DOM 的叶子行)。
      closest:
        row.nestedUnder === undefined
          ? undefined
          : (selector: string) => {
              if (!selector.includes('data-chat-flow-key')) return null
              return makeContainer(row.nestedUnder as string).el
            },
      querySelector: (selector: string) => {
        // [data-clock] chip:返回带文本的最小节点;分组判定用 [data-chat-flow-key] 无命中。
        if (selector.includes('data-clock')) {
          return { textContent: row.chip ?? '' }
        }
        return null
      },
    }
    return el
  })
  const flow = {
    querySelectorAll: (selector: string) => {
      if (selector.includes('data-chat-flow-key')) return rowEls
      if (selector.includes('data-qq-time-divider')) {
        return inserted.filter(el => el.removed !== true)
      }
      return []
    },
  }
  return { flow, rowEls, inserted, containers }
}

describe('QQ time divider', () => {
  it('parses the three chip formats produced by formatMessageClock', () => {
    const now = new Date()
    // 当天:HH:mm(日期部分取今天)
    const timeOnly = parseClockText('12:30')
    expect(timeOnly).toBeDefined()
    expect(new Date(timeOnly as number).getHours()).toBe(12)
    expect(new Date(timeOnly as number).getMinutes()).toBe(30)
    expect(new Date(timeOnly as number).toDateString()).toBe(now.toDateString())
    // 今年内:M月D日 HH:mm / M/D HH:mm
    const zhMd = parseClockText('11月8日 09:05')
    expect(zhMd).toBeDefined()
    expect(new Date(zhMd as number).getMonth()).toBe(10)
    expect(new Date(zhMd as number).getDate()).toBe(8)
    expect(parseClockText('11/8 09:05')).toBe(zhMd)
    // 跨年:YYYY年M月D日 HH:mm / YYYY-M-D HH:mm
    const zhYmd = parseClockText('2025年12月31日 23:59')
    expect(zhYmd).toBeDefined()
    expect(new Date(zhYmd as number).getFullYear()).toBe(2025)
    expect(parseClockText('2025-12-31 23:59')).toBe(zhYmd)
  })

  it('rejects unparseable or out-of-range chip text instead of guessing a time', () => {
    expect(parseClockText(undefined)).toBeUndefined()
    expect(parseClockText(null)).toBeUndefined()
    expect(parseClockText('')).toBeUndefined()
    expect(parseClockText('   ')).toBeUndefined()
    expect(parseClockText('noon')).toBeUndefined()
    expect(parseClockText('昨天')).toBeUndefined()
    expect(parseClockText('12:30:45')).toBeUndefined()
    expect(parseClockText('2025-13-40 25:99')).toBeUndefined()
    expect(parseClockText('11月8日 25:00')).toBeUndefined()
  })

  it('extracts the clock fragment out of the usage-prefixed chip text', () => {
    // 实测 chip 文本:用量文案与时钟并列在同一个 [data-clock] 容器里。
    expect(extractClock('用量 72.3K tok19:57')).toBe('19:57')
    expect(extractClock('用量 73.1K tok11月8日 20:14')).toBe('11月8日 20:14')
    expect(extractClock('72.3K tok used 2025-12-31 23:59')).toBe('2025-12-31 23:59')
    // 带秒的串不是宿主 chip 格式,不能截出 12:30 冒充时间。
    expect(extractClock('12:30:45')).toBeUndefined()
    expect(extractClock('用量 3.4M tok')).toBeUndefined()
    expect(parseClockText('用量 72.3K tok19:57')).toBeDefined()
  })

  it('plans a divider before the first row and on every day change', () => {
    setTodayLabel(() => '今天')
    const now = new Date()
    const today = `${now.getHours()}:${`${now.getMinutes()}`.padStart(2, '0')}`
    const yest = zhYesterdayChip()
    const plan = planDividers([today, today, yest.chip, yest.chip, '2020年1月2日 08:00'])
    expect(plan).toEqual(['今天', undefined, yest.label, undefined, '2020年1月2日'])
  })

  it('skips rows without a parseable chip without breaking the day chain', () => {
    setTodayLabel(() => '今天')
    const now = new Date()
    const today = `${now.getHours()}:${`${now.getMinutes()}`.padStart(2, '0')}`
    const yest = zhYesterdayChip()
    // 中间一行无 chip(不可解析):不插条,也不重置日期链,下一行仍按跨天判定。
    const plan = planDividers([today, undefined, yest.chip])
    expect(plan).toEqual(['今天', undefined, yest.label])
  })

  it('falls back to the today label when a chip carries time only', () => {
    setTodayLabel(() => '今日')
    expect(planDividers(['08:00'])[0]).toBe('今日')
    setTodayLabel(() => '今天')
  })

  it('keeps the chip date part verbatim so locale formats stay intact', () => {
    setTodayLabel(() => '今天')
    const yest = zhYesterdayChip()
    const enChip = `${yest.label.replace(/月/g, '/').replace(/日/, '')} 09:05`
    expect(planDividers([enChip])[0]).toBe(enChip.replace(/\s+\d{1,2}:\d{2}$/, ''))
    expect(planDividers(['2020-1-2 08:00'])[0]).toBe('2020-1-2')
  })

  it('aligns dividers idempotently and rebuilds them when rows change', () => {
    setTodayLabel(() => '今天')
    const yest = zhYesterdayChip()
    // buildDivider 需要最小 document.createElement(与 apply.client.spec 同款)。
    vi.stubGlobal('document', {
      createElement: () => {
        const el: { textContent: string; [key: string]: unknown } = { textContent: '' }
        el.setAttribute = vi.fn()
        el.className = ''
        el.dataset = {}
        el.remove = vi.fn()
        // buildDivider 把日期写进子 span;这里透传子文本,断言才可读。
        el.appendChild = vi.fn((child: { textContent: string }) => {
          el.textContent = child.textContent
        })
        return el
      },
    })
    const env = stubFlow([{ chip: '08:00' }, { chip: '09:00' }, { chip: yest.chip }])
    alignDividers(env.flow as unknown as Element)
    // 首行 + 跨天 = 两条分隔条。
    expect(env.inserted).toHaveLength(2)
    expect(env.inserted[0].textContent).toBe('今天')
    expect(env.inserted[1].textContent).toBe(yest.label)
    // 再次对齐:状态已一致 → 零新增(幂等,不自我触发 observer 循环)。
    alignDividers(env.flow as unknown as Element)
    expect(env.inserted).toHaveLength(2)
    vi.unstubAllGlobals()
  })

  it('inserts the divider before the first row of the turn carrying the clock', () => {
    setTodayLabel(() => '今天')
    const yest = zhYesterdayChip()
    vi.stubGlobal('document', {
      createElement: () => {
        const el: { textContent: string; [key: string]: unknown } = { textContent: '' }
        el.setAttribute = vi.fn()
        el.className = ''
        el.dataset = {}
        el.remove = vi.fn()
        el.appendChild = vi.fn((child: { textContent: string }) => {
          el.textContent = child.textContent
        })
        return el
      },
    })
    // 实测结构:用户行无 chip,时钟挂在回合尾部 turn-tail 行,文本带用量前缀。
    const env = stubFlow([
      { turn: '1' },
      { turn: '1', chip: '用量 72.3K tok19:57' },
      { turn: '1' },
      { turn: '2' },
      { turn: '2', chip: `用量 73.1K tok${yest.chip}` },
    ])
    alignDividers(env.flow as unknown as Element)
    expect(env.inserted).toHaveLength(2)
    expect(env.inserted[0].textContent).toBe('今天')
    expect(env.inserted[1].textContent).toBe(yest.label)
    // 分隔条落在回合首行(用户行)之前,而不是挂时钟的尾部行。
    expect(env.rowEls[0].before).toHaveBeenCalledTimes(1)
    expect(env.rowEls[3].before).toHaveBeenCalledTimes(1)
    expect(env.rowEls[1].before).not.toHaveBeenCalled()
    expect(env.rowEls[4].before).not.toHaveBeenCalled()
    // 幂等:再跑一次不新增。
    alignDividers(env.flow as unknown as Element)
    expect(env.inserted).toHaveLength(2)
    vi.unstubAllGlobals()
  })

  it('keeps a turn together when one of its rows misses the turn attribute', () => {
    setTodayLabel(() => '今天')
    const yest = zhYesterdayChip()
    vi.stubGlobal('document', {
      createElement: () => {
        const el: { textContent: string; [key: string]: unknown } = { textContent: '' }
        el.setAttribute = vi.fn()
        el.className = ''
        el.dataset = {}
        el.remove = vi.fn()
        el.appendChild = vi.fn((child: { textContent: string }) => {
          el.textContent = child.textContent
        })
        return el
      },
    })
    // 中间一行没有 data-chat-turn(宿主偶发不输出):不能因此把回合一分为二,
    // 否则分隔条会落到缺属性的那一行而不是回合首行。
    const env = stubFlow([
      { turn: '1' },
      { chip: '用量 72.3K tok08:00' },
      { turn: '2' },
      { chip: `用量 73.1K tok${yest.chip}` },
    ])
    alignDividers(env.flow as unknown as Element)
    // 缺属性的行并入各自回合:08:00(今天)与昨天的 chip 各在自己的回合 → 两条,
    // 都插在回合首行之前,而不是缺属性的那一行。
    expect(env.inserted).toHaveLength(2)
    expect(env.inserted[0].textContent).toBe('今天')
    expect(env.inserted[1].textContent).toBe(yest.label)
    expect(env.rowEls[0].before).toHaveBeenCalledTimes(1)
    expect(env.rowEls[2].before).toHaveBeenCalledTimes(1)
    expect(env.rowEls[1].before).not.toHaveBeenCalled()
    expect(env.rowEls[3].before).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('anchors the divider outside a group container the first row is nested in', () => {
    setTodayLabel(() => '今天')
    const yest = zhYesterdayChip()
    vi.stubGlobal('document', {
      createElement: () => {
        const el: { textContent: string; [key: string]: unknown } = { textContent: '' }
        el.setAttribute = vi.fn()
        el.className = ''
        el.dataset = {}
        el.remove = vi.fn()
        el.appendChild = vi.fn((child: { textContent: string }) => {
          el.textContent = child.textContent
        })
        return el
      },
    })
    // 无 user 行的回合:首行躺在 ChatGroupSeat 的折叠 body 里,分隔条必须锚到
    // 容器本身,否则会随折叠一起被裁掉(功能等于没有)。
    const env = stubFlow([
      { turn: '1', chip: '08:00' },
      { turn: '2', nestedUnder: 'seat-2', chip: `用量 73.1K tok${yest.chip}` },
    ])
    alignDividers(env.flow as unknown as Element)
    expect(env.inserted).toHaveLength(2)
    expect(env.inserted[1].textContent).toBe(yest.label)
    expect(env.containers.get('seat-2')?.el.before).toHaveBeenCalledTimes(1)
    expect(env.rowEls[1].before).not.toHaveBeenCalled()
    // 幂等:容器锚点已记录兄弟关系,重扫不新增。
    alignDividers(env.flow as unknown as Element)
    expect(env.inserted).toHaveLength(2)
    vi.unstubAllGlobals()
  })

  it('excludes group containers by walking ancestors instead of scanning subtrees', () => {
    setTodayLabel(() => '今天')
    // 分组容器(stub):同时出现在行列表里,并且是另一行的父元素。
    // 旧实现靠 row.querySelector(子树扫描)判定容器,长会话下每行付一次
    // 全子树遍历;新实现沿 parentElement 上溯,这里用 parentElement 关系
    // 表达同一结构——容器必须被排除,否则会被当成一个回合。
    const container = {
      textContent: '',
      remove: vi.fn(),
      before: vi.fn(),
      nextElementSibling: undefined as unknown,
      getAttribute: () => null,
      querySelector: (selector: string) => (selector.includes('data-clock') ? null : null),
    } as unknown as Record<string, unknown>
    const child = {
      textContent: '',
      remove: vi.fn(),
      before: vi.fn((divider: { textContent: string }) => {
        inserted.push(divider as { textContent: string })
      }),
      nextElementSibling: undefined as unknown,
      getAttribute: (name: string) => (name === 'data-chat-turn' ? '1' : null),
      querySelector: (selector: string) => (selector.includes('data-clock') ? { textContent: '08:00' } : null),
      parentElement: container as unknown,
    }
    container.querySelector = (selector: string) => (selector.includes('data-clock') ? null : null)
    const inserted: Array<{ textContent: string }> = []
    const flow = {
      querySelectorAll: (selector: string) => {
        // 容器在前、子行在后:旧实现会把容器当作一个回合。
        if (selector.includes('data-chat-flow-key')) return [container, child]
        return []
      },
    }
    vi.stubGlobal('document', {
      createElement: () => {
        const el: { textContent: string; [key: string]: unknown } = { textContent: '' }
        el.setAttribute = vi.fn()
        el.className = ''
        el.dataset = {}
        el.remove = vi.fn()
        el.appendChild = vi.fn((node: { textContent: string }) => {
          el.textContent = node.textContent
        })
        return el
      },
    })
    alignDividers(flow as unknown as Element)
    // 只有子行成为回合:一条分隔条,插在子行之前,容器上不插。
    expect(inserted).toHaveLength(1)
    expect(child.before).toHaveBeenCalledTimes(1)
    expect(container.before).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('collects chip texts with a single subtree query instead of one per turn', () => {
    setTodayLabel(() => '今天')
    const yest = zhYesterdayChip()
    // 每行故意不提供 querySelector('data-clock'):只有走"一次 querySelectorAll
    // 全树收集 + 沿 parentElement 上溯"的新路径,才能取到 chip 文本。
    const inserted: Array<{ textContent: string; removed?: boolean }> = []
    const makeRow = (turn: string, chip: { textContent: string } | null) => {
      const row: {
        textContent: string
        remove: () => void
        before: (divider: { textContent: string; nextElementSibling?: unknown }) => void
        nextElementSibling: unknown
        getAttribute: (name: string) => string | null
        parentElement: unknown
      } = {
        textContent: '',
        remove: vi.fn(),
        before: (divider) => {
          divider.nextElementSibling = row
          inserted.push(divider as { textContent: string })
        },
        nextElementSibling: undefined,
        getAttribute: (name: string) => (name === 'data-chat-turn' ? turn : null),
        parentElement: null,
      }
      if (chip !== null) chip.parentElement = null
      return row
    }
    const row1 = makeRow('1', null)
    const row2 = makeRow('2', null)
    const chip1 = { textContent: '08:00' }
    const chip2 = { textContent: `用量 73.1K tok${yest.chip}` }
    // chip 的两层祖先后才到行,验证上溯逻辑(不是直接父子)。
    const mid1 = { parentElement: row1 }
    const mid2 = { parentElement: row2 }
    ;(chip1 as { parentElement?: unknown }).parentElement = mid1
    ;(chip2 as { parentElement?: unknown }).parentElement = mid2
    const queryCount = { clock: 0, rows: 0 }
    const flow = {
      querySelectorAll: (selector: string) => {
        if (selector.includes('data-chat-flow-key')) {
          queryCount.rows++
          return [row1, row2]
        }
        if (selector.includes('data-qq-time-divider')) return inserted.filter(el => el.removed !== true)
        if (selector.includes('data-clock')) {
          queryCount.clock++
          return [chip1, chip2]
        }
        return []
      },
    }
    vi.stubGlobal('document', {
      createElement: () => {
        const el: { textContent: string; [key: string]: unknown } = { textContent: '' }
        el.setAttribute = vi.fn()
        el.className = ''
        el.dataset = {}
        el.remove = vi.fn()
        el.appendChild = vi.fn((child: { textContent: string }) => { el.textContent = child.textContent })
        return el
      },
    })

    alignDividers(flow as unknown as Element)
    // 两回合各一条;文本分别来自各自回合的 chip。
    expect(inserted).toHaveLength(2)
    expect(inserted[0].textContent).toBe('今天')
    expect(inserted[1].textContent).toBe(yest.label)
    // 关键:clock 只查了一次(与回合数无关),不再每回合扫一次子树。
    expect(queryCount.clock).toBe(1)
    vi.unstubAllGlobals()
  })

  it('clears dividers when the runtime is disabled or disposed', () => {
    setTodayLabel(() => '今天')
    const yest = zhYesterdayChip()
    // Runtime 观察器在 stub 环境(无 document)不挂载;update(false) 后
    // isEnabled 翻转,dispose 走清理分支不再残留。
    const ctx = new Context()
    const runtime = new QQTimeDividerRuntime(ctx, QQ_SKIN_DEFAULT_CONFIG)
    expect(runtime.isEnabled()).toBe(true)
    runtime.update({ ...QQ_SKIN_DEFAULT_CONFIG, timeDivider: false })
    expect(runtime.isEnabled()).toBe(false)
    runtime.update({ ...QQ_SKIN_DEFAULT_CONFIG, timeDivider: true })
    expect(runtime.isEnabled()).toBe(true)
    runtime.dispose()
  })

  it('re-attaches to a rebuilt chat flow instead of watching a detached element', () => {
    setTodayLabel(() => '今天')
    // 宿主会重建聊天流元素(切换会话、进出设置页)。旧实现找到 flow 就
    // 卸掉 sentinel、只盯那一个元素:flow 被替换后 observer 绑在已分离
    // 的旧节点上,分隔条从此不再出现。这里模拟"旧 flow 分离 → 新 flow 挂上"。
    const observers: Array<{ callback: (records: MutationRecord[]) => void; targets: unknown[]; disconnect: ReturnType<typeof vi.fn> }> = []
    class FakeMutationObserver {
      private readonly entry: { callback: (records: MutationRecord[]) => void; targets: unknown[]; disconnect: ReturnType<typeof vi.fn> }
      constructor(callback: (records: MutationRecord[]) => void) {
        this.entry = { callback, targets: [], disconnect: vi.fn(() => {}) }
        observers.push(this.entry)
      }
      observe(target: unknown): void {
        this.entry.targets.push(target)
      }
      disconnect(): void {
        this.entry.disconnect()
      }
    }

    /** 造一个 flow 桩;rows 决定它内部有多少流 item。 */
    const makeFlow = (connected: () => boolean) => {
      const row = {
        textContent: '',
        remove: vi.fn(),
        before: vi.fn(),
        nextElementSibling: undefined as unknown,
        getAttribute: (name: string) => (name === 'data-chat-turn' ? '1' : null),
        querySelector: (selector: string) => (selector.includes('data-clock') ? { textContent: '08:00' } : null),
      }
      const flow = {
        get isConnected() { return connected() },
        querySelectorAll: (selector: string) => {
          if (selector.includes('data-chat-flow-key')) return [row]
          return []
        },
        querySelector: (selector: string) => (selector.includes('data-clock') ? { textContent: '08:00' } : null),
      }
      return { flow, row }
    }

    let oldConnected = true
    let currentFlow: unknown = makeFlow(() => oldConnected).flow
    const body = {}
    vi.stubGlobal('MutationObserver', FakeMutationObserver)
    vi.stubGlobal('document', {
      body,
      createElement: () => {
        const el: { textContent: string; [key: string]: unknown } = { textContent: '' }
        el.setAttribute = vi.fn()
        el.className = ''
        el.dataset = {}
        el.remove = vi.fn()
        el.appendChild = vi.fn((child: { textContent: string }) => { el.textContent = child.textContent })
        return el
      },
      querySelector: (selector: string) => (selector === '[data-chat-flow]' ? currentFlow : null),
    })

    const ctx = new Context()
    const runtime = new QQTimeDividerRuntime(ctx, QQ_SKIN_DEFAULT_CONFIG)
    // flow observer 先建(快路径),sentinel 常驻兜底:一个看 flow,一个看 body。
    expect(observers).toHaveLength(2)
    const firstFlowObserver = observers[0]
    const sentinel = observers[1]
    expect(firstFlowObserver?.targets[0]).toBe(currentFlow)
    expect(sentinel?.targets[0]).toBe(body)

    // 宿主替换聊天流:旧节点分离,新节点挂上。
    oldConnected = false
    currentFlow = makeFlow(() => true).flow
    sentinel?.callback([])
    // 旧 flow observer 被断开,并新挂了一个到新 flow。
    expect(firstFlowObserver?.disconnect).toHaveBeenCalled()
    const secondFlowObserver = observers[2]
    expect(secondFlowObserver).toBeDefined()
    expect(secondFlowObserver?.targets[0]).toBe(currentFlow)

    // sentinel 常驻:找到新 flow 后不自我卸载。
    expect(sentinel?.disconnect).not.toHaveBeenCalled()

    runtime.dispose()
    vi.unstubAllGlobals()
  })
})
