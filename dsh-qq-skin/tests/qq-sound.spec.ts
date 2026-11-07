import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { QQSoundRuntime } from '../src/client/qq-sound.ts'
import { QQ_SKIN_DEFAULT_CONFIG, type QQSkinConfig } from '../src/client/config.ts'

/** 默认配置 + messageSound 开。 */
const soundOn: QQSkinConfig = { ...QQ_SKIN_DEFAULT_CONFIG, messageSound: true }
/** 默认配置 + messageSound 关。 */
const soundOff: QQSkinConfig = { ...QQ_SKIN_DEFAULT_CONFIG, messageSound: false }

/** 最小 document + MutationObserver 桩。 */
function stubDocument() {
  const flow = { querySelector: vi.fn() }
  const observers: MutationObserver[] = []
  vi.stubGlobal('document', {
    querySelector: vi.fn(() => flow),
  })
  vi.stubGlobal('MutationObserver', class {
    callback: MutationCallback
    observe: (target: Node, options: MutationObserverInit) => void
    disconnect: () => void
    constructor(cb: MutationCallback) {
      this.callback = cb
      this.observe = vi.fn()
      this.disconnect = vi.fn()
      observers.push(this as unknown as MutationObserver)
    }
  })
  return { flow, observers }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('QQSoundRuntime', () => {
  it('reports the enabled flag from config', () => {
    const ctx = new Context()
    const on = new QQSoundRuntime(ctx, soundOn)
    const off = new QQSoundRuntime(ctx, soundOff)
    expect(on.isEnabled()).toBe(true)
    expect(off.isEnabled()).toBe(false)
    void ctx.fiber.dispose()
  })

  it('does not observe when messageSound is off', () => {
    stubDocument()
    const ctx = new Context()
    const runtime = new QQSoundRuntime(ctx, soundOff)
    expect(runtime.isEnabled()).toBe(false)
    // 无 observer 被实例化——document.querySelector 不应被调用。
    expect(document.querySelector).not.toHaveBeenCalled()
    void ctx.fiber.dispose()
  })

  it('observes the chat flow when messageSound is on', () => {
    const { flow, observers } = stubDocument()
    const ctx = new Context()
    new QQSoundRuntime(ctx, soundOn)
    expect(document.querySelector).toHaveBeenCalledTimes(1)
    expect(observers).toHaveLength(1)
    expect(observers[0].observe).toHaveBeenCalledWith(flow, { childList: true, subtree: true })
    void ctx.fiber.dispose()
  })

  it('tolerates missing chat flow without throwing', () => {
    stubDocument()
    vi.stubGlobal('document', { querySelector: vi.fn(() => null) })
    const ctx = new Context()
    expect(() => new QQSoundRuntime(ctx, soundOn)).not.toThrow()
    void ctx.fiber.dispose()
  })

  it('disconnects the observer on dispose', async () => {
    const { observers } = stubDocument()
    const ctx = new Context()
    new QQSoundRuntime(ctx, soundOn)
    expect(document.querySelector).toHaveBeenCalledTimes(1)
    expect(observers[0].disconnect).not.toHaveBeenCalled()
    await ctx.fiber.dispose()
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it('plays the first assistant step that mounts together with the chat flow', () => {
    // 模拟:插件加载时聊天流尚未挂载 → sentinel 挂载;随后聊天流与首条
    // 助手消息同批挂载(首次交互常见时序),sentinel 补扫同批新增节点。
    let flow: Element | null = null
    const observers: Array<{
      callback: MutationCallback
      observe: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
    }> = []
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => flow),
    })
    vi.stubGlobal('MutationObserver', class {
      callback: MutationCallback
      observe: (target: Node, options: MutationObserverInit) => void
      disconnect: () => void
      constructor(cb: MutationCallback) {
        this.callback = cb
        this.observe = vi.fn()
        this.disconnect = vi.fn()
        observers.push(this as unknown as typeof this)
      }
    })
    // Element 桩:node instanceof Element 判定用。
    class FakeElement {
      matches: (sel: string) => boolean
      querySelectorAll: (sel: string) => FakeElement[]
      constructor(matches: (sel: string) => boolean, querySelectorAll: (sel: string) => FakeElement[]) {
        this.matches = matches
        this.querySelectorAll = querySelectorAll
      }
    }
    vi.stubGlobal('Element', FakeElement)
    // window.AudioContext 桩:记录实例化次数(即 playSound 调用次数)。
    const audioCtxs: unknown[] = []
    vi.stubGlobal('window', {
      AudioContext: class {
        state = 'running'
        currentTime = 0
        destination = {}
        createOscillator = () => ({
          connect: vi.fn(() => ({ connect: vi.fn() })),
          start: vi.fn(),
          stop: vi.fn(),
          type: '',
          frequency: { value: 0 },
        })
        createGain = () => ({
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        })
        close = vi.fn()
        resume = vi.fn()
        constructor() { audioCtxs.push(this) }
      },
    })

    const ctx = new Context()
    new QQSoundRuntime(ctx, soundOn)
    // 首轮:无聊天流 → 只挂 sentinel。
    expect(observers).toHaveLength(1)

    // 模拟聊天流与首条助手消息同批挂载:flow 出现,内部已含 assistant-step。
    const step = new FakeElement(
      (sel) => sel === "[data-chat-flow-kind='assistant-step']",
      () => [],
    )
    const flowEl = new FakeElement(
      () => false,
      () => [step],
    )
    flow = flowEl
    const mutation = { addedNodes: [flowEl] } as unknown as MutationRecord
    observers[0].callback([mutation], observers[0] as unknown as MutationObserver)

    // 首条消息应触发一声提示音。
    expect(audioCtxs).toHaveLength(1)
    void ctx.fiber.dispose()
  })

  it('hot-toggles the observer when messageSound flips', () => {
    const { flow, observers } = stubDocument()
    const ctx = new Context()
    const runtime = new QQSoundRuntime(ctx, soundOn)
    // 关掉:旧 observer disconnect,新 querySelector 不再被调用。
    runtime.update(soundOff)
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
    // 再开:新 observer 被创建。
    runtime.update(soundOn)
    expect(observers).toHaveLength(2)
    expect(observers[1].observe).toHaveBeenCalledWith(flow, { childList: true, subtree: true })
    void ctx.fiber.dispose()
  })

  it('scales the beep envelope gain by soundVolume', async () => {
    const rampCalls: number[] = []
    class FakeAudioContext {
      state = 'running'
      currentTime = 0
      destination = {}
      createOscillator() {
        return {
          type: 'square',
          frequency: { value: 2000, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn().mockReturnThis(),
          start: vi.fn(),
          stop: vi.fn(),
        }
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn((value: number) => { rampCalls.push(value) }),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn().mockReturnThis(),
        }
      }
      resume = vi.fn().mockResolvedValue(undefined)
      close = vi.fn().mockResolvedValue(undefined)
    }
    vi.stubGlobal('window', { AudioContext: FakeAudioContext })
    // 聊天流已存在:快路径直接挂 flow observer。
    const flowEl = { matches: () => false, querySelectorAll: () => [] }
    const observers: Array<{ callback: MutationCallback }> = []
    vi.stubGlobal('document', { querySelector: vi.fn(() => flowEl) })
    vi.stubGlobal('MutationObserver', class {
      callback: MutationCallback
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(cb: MutationCallback) { this.callback = cb; observers.push(this) }
    })
    class FakeElement {
      matches: (sel: string) => boolean
      querySelectorAll: (sel: string) => FakeElement[]
      constructor(matches: (sel: string) => boolean, querySelectorAll: (sel: string) => FakeElement[]) {
        this.matches = matches
        this.querySelectorAll = querySelectorAll
      }
    }
    vi.stubGlobal('Element', FakeElement)

    const ctx = new Context()
    new QQSoundRuntime(ctx, { ...soundOn, soundVolume: 0.5 })
    const step = new FakeElement((sel) => sel === "[data-chat-flow-kind='assistant-step']", () => [])
    await observers[0]!.callback([{ addedNodes: [step] } as unknown as MutationRecord], observers[0] as unknown as MutationObserver)
    await vi.waitFor(() => { expect(rampCalls.length).toBeGreaterThan(0) })
    // 6-beep 每一声的 attack 峰值都乘了 soundVolume(0.15 × 0.5 = 0.075)。
    expect(rampCalls.length).toBe(6)
    for (const value of rampCalls) {
      expect(value).toBeCloseTo(0.075, 5)
    }
    void ctx.fiber.dispose()
  })

  it('silences sound when multiple assistant steps mount in batch (history restore)', () => {
    let flow: Element | null = null
    const observers: Array<{ callback: MutationCallback }> = []
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => flow),
    })
    vi.stubGlobal('MutationObserver', class {
      callback: MutationCallback
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(cb: MutationCallback) {
        this.callback = cb
        observers.push(this)
      }
    })
    class FakeElement {
      matches: (sel: string) => boolean
      querySelectorAll: (sel: string) => FakeElement[]
      constructor(matches: (sel: string) => boolean, querySelectorAll: (sel: string) => FakeElement[]) {
        this.matches = matches
        this.querySelectorAll = querySelectorAll
      }
    }
    vi.stubGlobal('Element', FakeElement)
    const audioCtxs: unknown[] = []
    vi.stubGlobal('window', {
      AudioContext: class {
        state = 'running'
        currentTime = 0
        destination = {}
        createOscillator = () => ({
          connect: vi.fn(() => ({ connect: vi.fn() })),
          start: vi.fn(),
          stop: vi.fn(),
          type: '',
          frequency: { value: 0 },
        })
        createGain = () => ({
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        })
        close = vi.fn()
        resume = vi.fn()
        constructor() { audioCtxs.push(this) }
      },
    })

    const ctx = new Context()
    new QQSoundRuntime(ctx, soundOn)

    // 模拟同批挂载 3 条历史消息
    const step1 = new FakeElement((sel) => sel === "[data-chat-flow-kind='assistant-step']", () => [])
    const step2 = new FakeElement((sel) => sel === "[data-chat-flow-kind='assistant-step']", () => [])
    const step3 = new FakeElement((sel) => sel === "[data-chat-flow-kind='assistant-step']", () => [])
    const flowEl = new FakeElement(() => false, () => [step1, step2, step3])
    flow = flowEl

    const mutation = { addedNodes: [flowEl] } as unknown as MutationRecord
    observers[0].callback([mutation], observers[0] as unknown as MutationObserver)

    // 历史批量消息应静默,不实例化 AudioContext 发声
    expect(audioCtxs).toHaveLength(0)
    void ctx.fiber.dispose()
  })

  it('debounces sounds that arrive within the cooldown window', () => {
    let flow: Element | null = null
    const observers: Array<{ callback: MutationCallback }> = []
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => flow),
    })
    vi.stubGlobal('MutationObserver', class {
      callback: MutationCallback
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(cb: MutationCallback) {
        this.callback = cb
        observers.push(this)
      }
    })
    class FakeElement {
      matches: (sel: string) => boolean
      querySelectorAll: (sel: string) => FakeElement[]
      constructor(matches: (sel: string) => boolean, querySelectorAll: (sel: string) => FakeElement[]) {
        this.matches = matches
        this.querySelectorAll = querySelectorAll
      }
    }
    vi.stubGlobal('Element', FakeElement)
    let playCount = 0
    vi.stubGlobal('window', {
      AudioContext: class {
        state = 'running'
        currentTime = 0
        destination = {}
        createOscillator = () => {
          playCount++
          return {
            connect: vi.fn(() => ({ connect: vi.fn() })),
            start: vi.fn(),
            stop: vi.fn(),
            type: '',
            frequency: { value: 0 },
          }
        }
        createGain = () => ({
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        })
        close = vi.fn()
        resume = vi.fn()
      },
    })

    const ctx = new Context()
    new QQSoundRuntime(ctx, soundOn)

    const step1 = new FakeElement((sel) => sel === "[data-chat-flow-kind='assistant-step']", () => [])
    const flowEl = new FakeElement(() => false, () => [step1])
    flow = flowEl

    // 第一声:触发播放 (6 个 beep)
    observers[0].callback([{ addedNodes: [flowEl] } as unknown as MutationRecord], observers[0] as unknown as MutationObserver)
    expect(playCount).toBe(6)

    // 在 1.2s 冷却期内到达的后续 step
    const step2 = new FakeElement((sel) => sel === "[data-chat-flow-kind='assistant-step']", () => [])
    observers[0].callback([{ addedNodes: [step2] } as unknown as MutationRecord], observers[0] as unknown as MutationObserver)

    // 应被防抖抑制,保持为 6 次 beep
    expect(playCount).toBe(6)
    void ctx.fiber.dispose()
  })

  it('supports waterdrop and knock sound variants', () => {
    let flow: Element | null = null
    const observers: Array<{ callback: MutationCallback }> = []
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => flow),
    })
    vi.stubGlobal('MutationObserver', class {
      callback: MutationCallback
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(cb: MutationCallback) {
        this.callback = cb
        observers.push(this)
      }
    })
    class FakeElement {
      matches: (sel: string) => boolean
      querySelectorAll: (sel: string) => FakeElement[]
      constructor(matches: (sel: string) => boolean, querySelectorAll: (sel: string) => FakeElement[]) {
        this.matches = matches
        this.querySelectorAll = querySelectorAll
      }
    }
    vi.stubGlobal('Element', FakeElement)

    const oscTypes: string[] = []
    vi.stubGlobal('window', {
      AudioContext: class {
        state = 'running'
        currentTime = 0
        destination = {}
        createOscillator = () => {
          const osc = {
            connect: vi.fn(() => ({ connect: vi.fn() })),
            start: vi.fn(),
            stop: vi.fn(),
            type: '',
            frequency: { value: 0 },
          }
          // capture osc after type is assigned
          setTimeout(() => { oscTypes.push(osc.type) }, 0)
          return osc
        }
        createGain = () => ({
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        })
        close = vi.fn()
        resume = vi.fn()
      },
    })

    // 测试 waterdrop 音色
    const ctxWater = new Context()
    new QQSoundRuntime(ctxWater, { ...QQ_SKIN_DEFAULT_CONFIG, messageSound: true, soundVariant: 'waterdrop' })
    const step1 = new FakeElement((sel) => sel === "[data-chat-flow-kind='assistant-step']", () => [])
    const flowEl = new FakeElement(() => false, () => [step1])
    flow = flowEl

    observers[0].callback([{ addedNodes: [flowEl] } as unknown as MutationRecord], observers[0] as unknown as MutationObserver)
    void ctxWater.fiber.dispose()

    // 测试 knock 音色
    const ctxKnock = new Context()
    new QQSoundRuntime(ctxKnock, { ...QQ_SKIN_DEFAULT_CONFIG, messageSound: true, soundVariant: 'knock' })
    observers[1].callback([{ addedNodes: [flowEl] } as unknown as MutationRecord], observers[1] as unknown as MutationObserver)
    void ctxKnock.fiber.dispose()
  })

  it('triggers window shake class on the chat flow element when windowShake is on', () => {
    const classList = {
      add: vi.fn(),
      remove: vi.fn(),
    }
    const flowEl = {
      classList,
      matches: () => false,
      querySelectorAll: () => [],
    }
    const observers: Array<{ callback: MutationCallback }> = []
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => flowEl),
    })
    vi.stubGlobal('MutationObserver', class {
      callback: MutationCallback
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(cb: MutationCallback) {
        this.callback = cb
        observers.push(this)
      }
    })
    class FakeElement {
      matches: (sel: string) => boolean
      querySelectorAll: (sel: string) => FakeElement[]
      constructor(matches: (sel: string) => boolean, querySelectorAll: (sel: string) => FakeElement[]) {
        this.matches = matches
        this.querySelectorAll = querySelectorAll
      }
    }
    vi.stubGlobal('Element', FakeElement)

    const ctx = new Context()
    new QQSoundRuntime(ctx, { ...QQ_SKIN_DEFAULT_CONFIG, windowShake: true })

    const step = new FakeElement((sel) => sel === "[data-chat-flow-kind='assistant-step']", () => [])
    observers[0].callback([{ addedNodes: [step] } as unknown as MutationRecord], observers[0] as unknown as MutationObserver)

    expect(classList.add).toHaveBeenCalledWith('dsh-qq-shaking')
    void ctx.fiber.dispose()
  })

  it('stays silent while the window is visible when remindOnlyWhenUnfocused is on', () => {
    const { observers } = stubDocument()
    // visible:模拟窗口在前台。
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => ({ matches: () => false, querySelectorAll: () => [] })),
      visibilityState: 'visible',
    })
    const ctx = new Context()
    new QQSoundRuntime(ctx, { ...QQ_SKIN_DEFAULT_CONFIG, messageSound: true, remindOnlyWhenUnfocused: true })

    // 用 spy 保证 playSound 未被触发:AudioContext 从未被实例化。
    const audioSpy = vi.fn()
    vi.stubGlobal('window', { get AudioContext() { audioSpy(); return undefined } })

    const step = { matches: (sel: string) => sel === "[data-chat-flow-kind='assistant-step']", querySelectorAll: () => [] }
    observers[0]!.callback([{ addedNodes: [step] } as unknown as MutationRecord], observers[0] as unknown as MutationObserver)

    expect(audioSpy).not.toHaveBeenCalled()
  })

  it('reminds when hidden while remindOnlyWhenUnfocused is on', () => {
    const classList = { add: vi.fn(), remove: vi.fn() }
    const flowEl = { classList, matches: () => false, querySelectorAll: () => [] }
    const observers: Array<{ callback: MutationCallback }> = []
    // hidden:模拟窗口失焦/最小化。
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => flowEl),
      visibilityState: 'hidden',
    })
    vi.stubGlobal('MutationObserver', class {
      callback: MutationCallback
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(cb: MutationCallback) { this.callback = cb; observers.push(this) }
    })
    class FakeElement {
      matches: (sel: string) => boolean
      querySelectorAll: (sel: string) => FakeElement[]
      constructor(matches: (sel: string) => boolean, querySelectorAll: (sel: string) => FakeElement[]) {
        this.matches = matches
        this.querySelectorAll = querySelectorAll
      }
    }
    vi.stubGlobal('Element', FakeElement)

    const ctx = new Context()
    new QQSoundRuntime(ctx, { ...QQ_SKIN_DEFAULT_CONFIG, windowShake: true, remindOnlyWhenUnfocused: true })

    const step = new FakeElement((sel) => sel === "[data-chat-flow-kind='assistant-step']", () => [])
    observers[0]!.callback([{ addedNodes: [step] } as unknown as MutationRecord], observers[0] as unknown as MutationObserver)

    expect(classList.add).toHaveBeenCalledWith('dsh-qq-shaking')
    void ctx.fiber.dispose()
  })

  it('stays silent during quiet hours regardless of visibility', () => {
    const classList = { add: vi.fn(), remove: vi.fn() }
    const flowEl = { classList, matches: () => false, querySelectorAll: () => [] }
    const observers: Array<{ callback: MutationCallback }> = []
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => flowEl),
      visibilityState: 'hidden', // 即便失焦,免打扰时段内依然静默
    })
    vi.stubGlobal('MutationObserver', class {
      callback: MutationCallback
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(cb: MutationCallback) { this.callback = cb; observers.push(this) }
    })
    class FakeElement {
      matches: (sel: string) => boolean
      querySelectorAll: (sel: string) => FakeElement[]
      constructor(matches: (sel: string) => boolean, querySelectorAll: (sel: string) => FakeElement[]) {
        this.matches = matches
        this.querySelectorAll = querySelectorAll
      }
    }
    vi.stubGlobal('Element', FakeElement)
    // AudioContext 从未被实例化 = 没有任何发声路径被走到。
    const audioSpy = vi.fn()
    vi.stubGlobal('window', { get AudioContext() { audioSpy(); return undefined } })

    // 固定时钟到 23:00,落在 22:00→08:00 的跨午夜免打扰区间内。
    vi.setSystemTime(new Date(2026, 10, 7, 23, 0))
    const ctx = new Context()
    new QQSoundRuntime(ctx, {
      ...QQ_SKIN_DEFAULT_CONFIG,
      messageSound: true,
      sendSound: true,
      windowShake: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    })
    const step = new FakeElement((sel) => sel === "[data-chat-flow-kind='assistant-step']", () => [])
    const user = new FakeElement((sel) => sel.includes("[data-chat-flow-kind='user']"), () => [])
    observers[0]!.callback(
      [{ addedNodes: [step, user] } as unknown as MutationRecord],
      observers[0] as unknown as MutationObserver,
    )

    expect(audioSpy).not.toHaveBeenCalled()
    expect(classList.add).not.toHaveBeenCalled()
    vi.useRealTimers()
    void ctx.fiber.dispose()
  })

  it('chimes normally outside quiet hours', () => {
    const classList = { add: vi.fn(), remove: vi.fn() }
    const flowEl = { classList, matches: () => false, querySelectorAll: () => [] }
    const observers: Array<{ callback: MutationCallback }> = []
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => flowEl),
      visibilityState: 'hidden',
    })
    vi.stubGlobal('MutationObserver', class {
      callback: MutationCallback
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(cb: MutationCallback) { this.callback = cb; observers.push(this) }
    })
    class FakeElement {
      matches: (sel: string) => boolean
      querySelectorAll: (sel: string) => FakeElement[]
      constructor(matches: (sel: string) => boolean, querySelectorAll: (sel: string) => FakeElement[]) {
        this.matches = matches
        this.querySelectorAll = querySelectorAll
      }
    }
    vi.stubGlobal('Element', FakeElement)

    // 固定时钟到 14:00,不在 22:00→08:00 区间内 → 正常抖动。
    vi.setSystemTime(new Date(2026, 10, 7, 14, 0))
    const ctx = new Context()
    new QQSoundRuntime(ctx, {
      ...QQ_SKIN_DEFAULT_CONFIG,
      windowShake: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    })
    const step = new FakeElement((sel) => sel === "[data-chat-flow-kind='assistant-step']", () => [])
    observers[0]!.callback([{ addedNodes: [step] } as unknown as MutationRecord], observers[0] as unknown as MutationObserver)

    expect(classList.add).toHaveBeenCalledWith('dsh-qq-shaking')
    vi.useRealTimers()
    void ctx.fiber.dispose()
  })

  it('plays sent sound when a single user message is added and sendSound is on', async () => {
    const playCalls: string[] = []
    class FakeAudioContext {
      state = 'running'
      currentTime = 0
      createOscillator() {
        return {
          type: 'sine',
          frequency: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn().mockReturnThis(),
          start: vi.fn(() => playCalls.push('osc.start')),
          stop: vi.fn(),
        }
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn().mockReturnThis(),
        }
      }
      destination = {}
      resume = vi.fn().mockResolvedValue(undefined)
      close = vi.fn().mockResolvedValue(undefined)
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)

    const flowEl = {
      matches: () => false,
      querySelectorAll: () => [],
    }
    const observers: Array<{ callback: MutationCallback }> = []
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => flowEl),
    })
    vi.stubGlobal('MutationObserver', class {
      callback: MutationCallback
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(cb: MutationCallback) {
        this.callback = cb
        observers.push(this)
      }
    })
    class FakeElement {
      matches: (sel: string) => boolean
      querySelectorAll: (sel: string) => FakeElement[]
      constructor(matches: (sel: string) => boolean, querySelectorAll: (sel: string) => FakeElement[]) {
        this.matches = matches
        this.querySelectorAll = querySelectorAll
      }
    }
    vi.stubGlobal('Element', FakeElement)

    const ctx = new Context()
    new QQSoundRuntime(ctx, { ...QQ_SKIN_DEFAULT_CONFIG, sendSound: true })

    const userNode = new FakeElement((sel) => sel.includes("[data-chat-flow-kind='user']"), () => [])
    observers[0].callback([{ addedNodes: [userNode] } as unknown as MutationRecord], observers[0] as unknown as MutationObserver)

    expect(playCalls.length).toBeGreaterThan(0)
    void ctx.fiber.dispose()
  })

  it('suppresses sent sound during history batch loading', () => {
    let played = false
    class FakeAudioContext {
      state = 'running'
      currentTime = 0
      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn().mockReturnThis(),
          start: vi.fn(() => { played = true }),
          stop: vi.fn(),
        }
      }
      createGain() {
        return {
          gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn().mockReturnThis(),
        }
      }
      destination = {}
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)

    const flowEl = {
      matches: () => false,
      querySelectorAll: () => [],
    }
    const observers: Array<{ callback: MutationCallback }> = []
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => flowEl),
    })
    vi.stubGlobal('MutationObserver', class {
      callback: MutationCallback
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(cb: MutationCallback) {
        this.callback = cb
        observers.push(this)
      }
    })
    class FakeElement {
      matches: (sel: string) => boolean
      querySelectorAll: (sel: string) => FakeElement[]
      constructor(matches: (sel: string) => boolean, querySelectorAll: (sel: string) => FakeElement[]) {
        this.matches = matches
        this.querySelectorAll = querySelectorAll
      }
    }
    vi.stubGlobal('Element', FakeElement)

    const ctx = new Context()
    new QQSoundRuntime(ctx, { ...QQ_SKIN_DEFAULT_CONFIG, sendSound: true })

    const user1 = new FakeElement((sel) => sel.includes("[data-chat-flow-kind='user']"), () => [])
    const user2 = new FakeElement((sel) => sel.includes("[data-chat-flow-kind='user']"), () => [])
    observers[0].callback([{ addedNodes: [user1, user2] } as unknown as MutationRecord], observers[0] as unknown as MutationObserver)

    expect(played).toBe(false)
    void ctx.fiber.dispose()
  })
})
