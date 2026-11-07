/**
 * QQ 经典消息音效与提醒层:监听聊天流新增的助手消息节点,首次出现时
 * 播放一段短促的提示音(Web Audio 合成,支持经典寻呼机/灵动水滴/清脆敲门
 * 三种音色,零外部资源依赖),并支持窗口抖动提醒。
 *
 * 实现策略:两段式懒挂载——构造时先挂一个 body 级 sentinel observer
 * 监听 `[data-chat-flow]` 的出现(插件加载往往早于聊天流挂载,直接
 * querySelector 会 miss);聊天流一出现,sentinel 自动卸载并挂载真正的
 * flow observer。flow observer 监听子树新增的
 * `[data-chat-flow-kind='assistant-step']` 节点,每出现一个就播放一次。
 * 不依赖 harness 事件契约——只看 DOM,与布局层同款选择器策略。
 *
 * 浏览器自动播放策略:首次播放需在用户交互后(点击/键盘)的上下文里,
 * 否则可能被拦截。音效模块不强制突破限制,播放失败静默吞掉(音效是
 * 锦上添花,不应阻塞主流程)。
 *
 * 与布局层分工:本层只管听觉与抖动触发,不碰静态视觉几何。配置开关
 * `messageSound` 与 `windowShake` 默认关闭,避免打扰用户。卸载时两个
 * observer + audio + timer 一并清理。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { QQSkinConfig, QQSkinSoundVariant } from './config.ts'

/** 聊天流容器选择器(harness ChatView 的 data-chat-flow 属性)。 */
const FLOW_SELECTOR = '[data-chat-flow]'
/** 助手消息节点选择器(harness ChatNodeSeat 的 data-chat-flow-kind)。 */
const STEP_SELECTOR = "[data-chat-flow-kind='assistant-step']"
/** 用户消息节点选择器(harness ChatNodeSeat 或气泡元素)。
 * 气泡锚点用 `data-message-bubble`(UserMessageBubble 透传的稳定属性),
 * 不依赖 CSS Modules 的 hash 类名。 */
const USER_SELECTOR = "[data-chat-flow-kind='user'], [data-message-bubble]"

/** 发送消息防抖冷却时间(ms)。 */
const SENT_SOUND_COOLDOWN_MS = 400

/** 各音色提示音防抖冷却时间(ms),避免流式输出连续多 step 造成音效重叠。 */
const COOLDOWN_BY_VARIANT: Record<QQSkinSoundVariant, number> = {
  beep: 1200,
  waterdrop: 500,
  knock: 600,
}

/**
 * 音效与提醒运行时:持有当前开关状态,管理 sentinel + flow 两个 observer。
 *
 * 生命周期与 cordis 一致:构造时按配置挂载 sentinel;`update` 按新
 * 配置启停整套观察链;插件 dispose 时通过 effect 清理。
 */
export class QQSoundRuntime {
  /** 当前生效配置(热更新后保持最新)。 */
  private config: QQSkinConfig
  /** sentinel observer:等 [data-chat-flow] 出现;出现后自动卸载。 */
  private sentinel: MutationObserver | undefined
  /** flow observer:监听聊天流新增 assistant-step;未启用时为 undefined。 */
  private observer: MutationObserver | undefined
  /** 已播放/处理过的助手节点集合(避免同一节点重复处理)。 */
  private readonly playedAssistant: WeakSet<Element> = new WeakSet()
  /** 已播放处理过的用户发送节点集合。 */
  private readonly playedUser: WeakSet<Element> = new WeakSet()
  /** 上次播放助手提示音的时间戳,用于冷却防抖。 */
  private lastPlayedTime = 0
  /** 上次播放发送消息提示音的时间戳,用于冷却防抖。 */
  private lastSentPlayedTime = 0
  /** 复用的 AudioContext 实例,空闲时释放。 */
  private audioCtx: AudioContext | undefined
  /** 自动关闭 AudioContext 的定时器。 */
  private closeTimer: ReturnType<typeof setTimeout> | undefined
  /** 窗口抖动定时器。 */
  private shakeTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * @param ctx - 客户端插件上下文(effect 生命周期)。
   * @param config - 初始配置。
   */
  constructor(ctx: Context, config: QQSkinConfig) {
    this.config = config
    ctx.effect(() => () => this.dispose(), 'dsh-qq-skin: sound dispose')
    this.applyObserver(this.config)
  }

  /** 当前是否启用音效或窗口提醒。 */
  isEnabled(): boolean {
    return this.config.messageSound || this.config.windowShake || this.config.sendSound
  }

  /**
   * 热更新:以新配置启停 observer,不重启插件。
   * @param config - 新配置。
   */
  update(config: QQSkinConfig): void {
    this.config = config
    this.disposeObserver()
    this.disposeSentinel()
    this.applyObserver(config)
  }

  /** 卸载两个 observer 与音频资源(插件 dispose 与热更新时共用)。 */
  dispose(): void {
    this.disposeObserver()
    this.disposeSentinel()
    this.disposeAudio()
    this.disposeShake()
  }

  /** 将目标根节点下已有的助手消息和用户消息记入已读,避免作为新消息误触发。 */
  private seedExisting(root: Element): void {
    if (typeof root.querySelectorAll !== 'function') return
    const steps = root.querySelectorAll(STEP_SELECTOR)
    for (const el of Array.from(steps)) {
      this.playedAssistant.add(el)
    }
    if (this.config.sendSound) {
      const userNodes = root.querySelectorAll(USER_SELECTOR)
      for (const el of Array.from(userNodes)) {
        this.playedUser.add(el)
      }
    }
  }

  /** 按配置挂载 sentinel(或直接挂 flow observer 如果聊天流已存在)。 */
  private applyObserver(config: QQSkinConfig): void {
    if (!config.messageSound && !config.windowShake && !config.sendSound) return
    if (typeof document === 'undefined') return

    // 快路径:聊天流已挂载,先记录已有历史消息,再挂载观察。
    const flow = document.querySelector(FLOW_SELECTOR)
    if (flow) {
      this.seedExisting(flow)
      this.mountFlowObserver(flow)
      return
    }

    // 慢路径:聊天流尚未挂载,用 sentinel observer 等它出现。
    this.sentinel = new MutationObserver((mutations) => {
      const target = document.querySelector(FLOW_SELECTOR)
      if (!target) return
      // 聊天流出现:先补扫同批挂载的首条助手消息(首次交互时序下,聊天流
      // 与首条消息往往同批出现,直接挂 flow observer 会漏掉第一声),再
      // 卸载 sentinel 并挂载 flow observer 接管后续新增。
      this.handleMutations(mutations)
      this.disposeSentinel()
      this.mountFlowObserver(target)
    })
    this.sentinel.observe(document.body, { childList: true, subtree: true })
  }

  /** 挂载 flow observer,监听聊天流子树新增的 assistant-step。 */
  private mountFlowObserver(flow: Element): void {
    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations))
    this.observer.observe(flow, { childList: true, subtree: true })
  }

  /** 从 mutation 记录中提取新增的 assistant-step 与 user 节点并触发提示音/抖动。 */
  private handleMutations(mutations: MutationRecord[]): void {
    const assistantTargets: Element[] = []
    const userTargets: Element[] = []
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue
        if (typeof node.matches === 'function' && node.matches(STEP_SELECTOR)) {
          assistantTargets.push(node)
        } else if (typeof node.querySelectorAll === 'function') {
          const nestedSteps = node.querySelectorAll(STEP_SELECTOR)
          for (const item of Array.from(nestedSteps)) {
            assistantTargets.push(item)
          }
        }
        if (this.config.sendSound) {
          if (typeof node.matches === 'function' && node.matches(USER_SELECTOR)) {
            userTargets.push(node)
          } else if (typeof node.querySelectorAll === 'function') {
            const nestedUser = node.querySelectorAll(USER_SELECTOR)
            for (const item of Array.from(nestedUser)) {
              userTargets.push(item)
            }
          }
        }
      }
    }

    // 1. 处理用户发送消息提示音(单条且在冷却之外才发声)
    if (this.config.sendSound) {
      const unplayedUser = userTargets.filter(target => !this.playedUser.has(target))
      for (const target of unplayedUser) {
        this.playedUser.add(target)
      }
      if (unplayedUser.length === 1) {
        const now = Date.now()
        if (now - this.lastSentPlayedTime >= SENT_SOUND_COOLDOWN_MS) {
          this.lastSentPlayedTime = now
          void this.playSentSound()
        }
      }
    }

    // 2. 处理助手新消息提醒
    const unplayedSteps = assistantTargets.filter(target => !this.playedAssistant.has(target))
    for (const target of unplayedSteps) {
      this.playedAssistant.add(target)
    }

    // 若未产生未播放的新节点则跳过
    if (unplayedSteps.length === 0) return

    // 若同批新增多条消息(历史记录批量挂载或会话切换),一律静默不发声不抖动
    if (unplayedSteps.length > 1) return

    // 仅失焦提醒模式(QQ 习惯):窗口在前台时的新消息不打扰,只标记已读;
    // 失焦/最小化时才发声抖动。document 判定不可用时(极端环境)按聚焦处理。
    if (this.config.remindOnlyWhenUnfocused && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      return
    }

    // 单条真实新消息:触发窗口抖动提醒(若开启)
    if (this.config.windowShake) {
      this.triggerShake()
    }

    // 单条真实新消息:提示音播放与防抖冷却保护
    if (this.config.messageSound) {
      const variant = this.config.soundVariant || 'beep'
      const cooldown = COOLDOWN_BY_VARIANT[variant] ?? 1200
      const now = Date.now()
      if (now - this.lastPlayedTime < cooldown) return
      this.lastPlayedTime = now
      void this.playSound(variant)
    }
  }

  /** 卸载 flow observer 并清空句柄。 */
  private disposeObserver(): void {
    this.observer?.disconnect()
    this.observer = undefined
  }

  /** 卸载 sentinel observer 并清空句柄。 */
  private disposeSentinel(): void {
    this.sentinel?.disconnect()
    this.sentinel = undefined
  }

  /** 释放 AudioContext 及延迟关闭定时器。 */
  private disposeAudio(): void {
    if (this.closeTimer !== undefined) {
      clearTimeout(this.closeTimer)
      this.closeTimer = undefined
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        void this.audioCtx.close()
      } catch {
        // 忽略关闭异常
      }
    }
    this.audioCtx = undefined
  }

  /** 清理窗口抖动定时器。 */
  private disposeShake(): void {
    if (this.shakeTimer !== undefined) {
      clearTimeout(this.shakeTimer)
      this.shakeTimer = undefined
    }
  }

  /** 触发窗口抖动动效(向聊天流或主容器注入瞬时类名)。 */
  private triggerShake(): void {
    if (typeof document === 'undefined') return
    const target = document.querySelector(FLOW_SELECTOR)
    if (!target || typeof target.classList?.add !== 'function') return
    target.classList.add('dsh-qq-shaking')
    if (this.shakeTimer !== undefined) {
      clearTimeout(this.shakeTimer)
    }
    this.shakeTimer = setTimeout(() => {
      target.classList.remove('dsh-qq-shaking')
      this.shakeTimer = undefined
    }, 420)
  }

  /** 播放发送消息提示音(Web Audio 纯合成正弦频移轻响)。 */
  private async playSentSound(): Promise<void> {
    try {
      const AudioCtor = (typeof window !== 'undefined' && (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext))
        || (typeof globalThis !== 'undefined' && (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext)
      if (!AudioCtor) return
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioCtor()
      }
      const audioCtx = this.audioCtx
      if (audioCtx.state === 'suspended') await audioCtx.resume()
      const now = audioCtx.currentTime
      const volume = this.config.soundVolume

      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      if (typeof osc.frequency?.setValueAtTime === 'function') {
        osc.frequency.setValueAtTime(880, now)
        osc.frequency.exponentialRampToValueAtTime?.(1500, now + 0.08)
      } else {
        osc.frequency.value = 1200
      }
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.18 * volume, now + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(now)
      osc.stop(now + 0.14)

      if (this.closeTimer !== undefined) {
        clearTimeout(this.closeTimer)
      }
      this.closeTimer = setTimeout(() => {
        this.disposeAudio()
      }, 600)
    } catch {
      // 忽略自动播放策略拦截
    }
  }

  /** 播放指定音色的提示音(Web Audio 纯合成,零外部资源依赖)。 */
  private async playSound(variant: QQSkinSoundVariant): Promise<void> {
    if (typeof window === 'undefined') return
    try {
      const AudioCtor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtor) return
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioCtor()
      }
      const audioCtx = this.audioCtx
      if (audioCtx.state === 'suspended') await audioCtx.resume()
      const now = audioCtx.currentTime
      const volume = this.config.soundVolume

      if (variant === 'waterdrop') {
        // 灵动水滴声: 正弦波频移下行 (1400Hz -> 750Hz) + 指数快速衰减包络
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.type = 'sine'
        if (typeof osc.frequency?.setValueAtTime === 'function') {
          osc.frequency.setValueAtTime(1400, now)
          osc.frequency.exponentialRampToValueAtTime?.(750, now + 0.15)
        } else {
          osc.frequency.value = 1400
        }
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.22 * volume, now + 0.005)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
        osc.connect(gain).connect(audioCtx.destination)
        osc.start(now)
        osc.stop(now + 0.25)
      } else if (variant === 'knock') {
        // 清脆双响敲门声: 双脉冲木质敲击 (三角波 340Hz 与 280Hz 衰减)
        const knock = (start: number, freq: number, gainVal: number) => {
          const osc = audioCtx.createOscillator()
          const gain = audioCtx.createGain()
          osc.type = 'triangle'
          if (typeof osc.frequency?.setValueAtTime === 'function') {
            osc.frequency.setValueAtTime(freq, start)
            osc.frequency.exponentialRampToValueAtTime?.(freq * 0.4, start + 0.06)
          } else {
            osc.frequency.value = freq
          }
          gain.gain.setValueAtTime(0, start)
          gain.gain.linearRampToValueAtTime(gainVal, start + 0.003)
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.06)
          osc.connect(gain).connect(audioCtx.destination)
          osc.start(start)
          osc.stop(start + 0.07)
        }
        knock(now, 340, 0.22 * volume)
        knock(now + 0.12, 280, 0.18 * volume)
      } else {
        // 经典寻呼机 6-beep 方波 (源自马化腾寻呼机录音,中国首例声音商标)
        const beep = (start: number): void => {
          const osc = audioCtx.createOscillator()
          const gain = audioCtx.createGain()
          osc.type = 'square'
          osc.frequency.value = 2000
          gain.gain.setValueAtTime(0, start)
          gain.gain.linearRampToValueAtTime(0.15 * volume, start + 0.003)
          gain.gain.setValueAtTime(0.15 * volume, start + 0.1)
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12)
          osc.connect(gain).connect(audioCtx.destination)
          osc.start(start)
          osc.stop(start + 0.12)
        }
        for (let i = 0; i < 6; i++) {
          beep(now + i * 0.2)
        }
      }

      // 播放完毕后重置定时器,延迟关闭释放硬件资源
      if (this.closeTimer !== undefined) {
        clearTimeout(this.closeTimer)
      }
      const closeDelay = variant === 'beep' ? 1500 : 800
      this.closeTimer = setTimeout(() => {
        this.disposeAudio()
      }, closeDelay)
    } catch {
      // 自动播放策略拦截或 AudioContext 不可用,静默吞掉。
    }
  }
}
