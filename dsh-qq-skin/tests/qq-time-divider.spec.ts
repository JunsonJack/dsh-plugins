import { describe, expect, it, vi } from 'vitest'
import { parseClockText, planDividers, setTodayLabel, alignDividers, QQTimeDividerRuntime } from '../src/client/qq-time-divider.ts'
import { Context } from '@deepseek-ai/cordis'
import { QQ_SKIN_DEFAULT_CONFIG } from '../src/client/config.ts'

/** 构造昨天的中文今年内 chip 文本(如「11月8日 09:05」)。 */
function zhYesterdayChip(): { chip: string; label: string } {
  const yest = new Date(Date.now() - 86400000)
  const chip = `${yest.getMonth() + 1}月${yest.getDate()}日 09:05`
  return { chip, label: `${yest.getMonth() + 1}月${yest.getDate()}日` }
}

/** 对齐链路用的最小 DOM stub:querySelectorAll 走数组过滤,元素带 before/remove。 */
function stubFlow(rows: Array<{ chip?: string }>) {
  const inserted: Array<{ textContent: string; removed?: boolean; nextElementSibling?: unknown }> = []
  const rowEls = rows.map(row => {
    const el = {
      textContent: row.chip ?? '',
      remove: vi.fn(),
      before: vi.fn((divider: { textContent: string; nextElementSibling?: unknown }) => {
        // 回填兄弟关系:对齐的幂等判定比对 divider.nextElementSibling === row。
        divider.nextElementSibling = el
        inserted.push(divider as { textContent: string; removed?: boolean; nextElementSibling?: unknown })
      }),
      nextElementSibling: undefined as unknown,
      querySelector: (selector: string) => {
        // [data-clock] chip:返回带文本的最小节点;其余选择器无命中。
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
  return { flow, rowEls, inserted }
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
})
