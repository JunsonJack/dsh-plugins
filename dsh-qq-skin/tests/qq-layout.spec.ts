import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  buildQQLayoutCss, createQQLayoutLayer, installQQLayout, QQ_LAYOUT_CSS, QQ_LAYOUT_PLUGIN,
} from '../src/client/qq-layout.ts'
import { QQ_SKIN_DEFAULT_CONFIG } from '../src/client/config.ts'

/** Minimal document/head stand-in for the DOM injection under node. */
function stubDocument() {
  const nodes: Array<{ dataset: Record<string, string>; textContent: string; remove: ReturnType<typeof vi.fn> }> = []
  const document = {
    head: {
      appendChild: vi.fn((el: (typeof nodes)[number]) => { nodes.push(el) }),
    },
    createElement: vi.fn(() => {
      const node = { dataset: {}, textContent: '', remove: vi.fn() }
      return node
    }),
  }
  vi.stubGlobal('document', document)
  return { document, nodes }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('QQ NT layout layer', () => {
  it('exposes a stylesheet covering the QQ NT layout hooks', () => {
    expect(QQ_LAYOUT_CSS).toContain("[data-chat-flow]")
    expect(QQ_LAYOUT_CSS).toContain("[data-composer-card]")
    expect(QQ_LAYOUT_CSS).toContain("[data-chat-flow-kind='assistant-step']")
    expect(QQ_LAYOUT_CSS).toContain("body[data-ds-dark-theme]")
  })

  it('colors follow tokens instead of hardcoded values', () => {
    // Surface colors must read --dsw-* tokens so the layer tracks the active
    // palette (qq-tokens.ts) in both modes; the assistant avatar is the one
    // exception — an embedded official QQ-penguin PNG brand asset (data URI,
    // no network).
    expect(QQ_LAYOUT_CSS).toContain('var(--dsw-alias-bg-layer-1)')
    expect(QQ_LAYOUT_CSS).toContain('var(--dsw-alias-border-l1)')
    expect(QQ_LAYOUT_CSS).not.toMatch(/#[0-9a-fA-F]{6}/)
  })

  it('embeds the official QQ-penguin avatar as a network-free data URI', () => {
    expect(QQ_LAYOUT_CSS).toContain("data:image/png;base64")
    expect(QQ_LAYOUT_CSS).toContain("[data-chat-flow-kind='assistant-step']::before")
  })

  it('injects one tagged stylesheet on activation', () => {
    const { nodes } = stubDocument()
    const ctx = new Context()
    installQQLayout(ctx as never)

    expect(nodes).toHaveLength(1)
    expect(nodes[0].dataset.plugin).toBe(QQ_LAYOUT_PLUGIN)
    expect(nodes[0].textContent).toBe(QQ_LAYOUT_CSS)
  })

  it('removes the stylesheet through the effect cleanup on dispose', async () => {
    const { nodes } = stubDocument()
    const ctx = new Context()
    installQQLayout(ctx as never)

    const tag = nodes[0]
    expect(tag.remove).not.toHaveBeenCalled()

    await ctx.fiber.dispose()

    expect(tag.remove).toHaveBeenCalledTimes(1)
  })

  it('layer handle rewrites the same stylesheet in place on hot update', () => {
    const { nodes } = stubDocument()
    const layer = createQQLayoutLayer()
    expect(nodes).toHaveLength(1)
    const tag = nodes[0]
    expect(tag.textContent).toBe(QQ_LAYOUT_CSS)

    layer.set({ ...QQ_SKIN_DEFAULT_CONFIG, chatMaxWidth: 720 })

    // 原地改写:标签不被移除重建,拖色调色时无裸题闪屏。
    expect(nodes).toHaveLength(1)
    expect(tag.remove).not.toHaveBeenCalled()
    expect(tag.textContent).toContain('max-width: 720px')

    layer.remove()
    expect(tag.remove).toHaveBeenCalledTimes(1)
  })
})

describe('QQ NT layout config branches', () => {
  it('bubble tail rule appears by default and can be disabled', () => {
    const tailRule = `[data-message-bubble][data-message-bubble]::after`
    expect(QQ_LAYOUT_CSS).toContain(tailRule)
    const off = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, bubbleTail: false })
    expect(off).not.toContain(tailRule)
    // The dark-mode tail companion follows the same switch.
    expect(off).not.toContain(`body[data-ds-dark-theme] [data-message-bubble][data-message-bubble]::after`)
  })

  it('assistant avatar rule appears by default and can be disabled', () => {
    const avatarRule = "[data-chat-flow-kind='assistant-step']::before"
    expect(QQ_LAYOUT_CSS).toContain(avatarRule)
    const off = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, assistantAvatar: false })
    expect(off).not.toContain(avatarRule)
  })

  it('chat flow width follows the config value', () => {
    expect(QQ_LAYOUT_CSS).toContain(`max-width: ${QQ_SKIN_DEFAULT_CONFIG.chatMaxWidth}px`)
    const narrow = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, chatMaxWidth: 720 })
    expect(narrow).toContain('max-width: 720px')
    expect(narrow).not.toContain(`max-width: ${QQ_SKIN_DEFAULT_CONFIG.chatMaxWidth}px`)
  })

  it('typing keyframes are present by default and removable', () => {
    expect(QQ_LAYOUT_CSS).toContain('@keyframes dsh-qq-typing')
    expect(QQ_LAYOUT_CSS).toContain('animation: dsh-qq-typing 0.2s ease-out')
    const off = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, typing: false })
    expect(off).not.toContain('dsh-qq-typing')
  })

  it('selected session row carries a brand-color dot', () => {
    expect(QQ_LAYOUT_CSS).toContain("[class$='_sessionRow'][class$='_selected']::after")
    expect(QQ_LAYOUT_CSS).toContain('var(--dsw-alias-brand-primary)')
  })

  it('covers the QQ NT conversation chrome hooks', () => {
    expect(QQ_LAYOUT_CSS).toContain("header[class$='_header']")
    expect(QQ_LAYOUT_CSS).toContain("[data-time-hover-root]")
    expect(QQ_LAYOUT_CSS).toContain("[data-conversation-scroll]")
    expect(QQ_LAYOUT_CSS).toContain("[class$='_tools'] button")
  })

  it('windowShake keyframes appear when enabled', () => {
    const off = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, windowShake: false })
    expect(off).not.toContain('dsh-qq-shake')

    const on = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, windowShake: true })
    expect(on).toContain('@keyframes dsh-qq-shake')
    expect(on).toContain('.dsh-qq-shaking')
  })

  it('frostedGlass rules appear when enabled', () => {
    const off = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, frostedGlass: false })
    expect(off).not.toContain('backdrop-filter: blur(16px)')

    const on = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, frostedGlass: true })
    expect(on).toContain('backdrop-filter: blur(16px)')
    expect(on).toContain('rgba(242, 245, 248, 0.78)')
  })

  it('decorates assistant markdown blockquotes and codeblocks', () => {
    expect(QQ_LAYOUT_CSS).toContain("[data-chat-flow-kind='assistant-step'] blockquote")
    expect(QQ_LAYOUT_CSS).toContain("[data-chat-flow-kind='assistant-step'] pre")
    expect(QQ_LAYOUT_CSS).toContain('rgba(255, 95, 86, 0.85)')
  })

  it('switches penguin avatar style between classic, sunglasses, and scarf', () => {
    const classic = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, avatarStyle: 'classic' })
    expect(classic).toContain('data:image/png;base64')
    expect(classic).not.toContain('data:image/svg+xml')

    const sunglasses = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, avatarStyle: 'sunglasses' })
    expect(sunglasses).toContain('data:image/svg+xml')
    expect(sunglasses).toContain('data:image/png;base64')

    const scarf = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, avatarStyle: 'scarf' })
    expect(scarf).toContain('data:image/svg+xml')
    expect(scarf).toContain('data:image/png;base64')
  })

  it('derives avatar glow and bubble shadow from customColor on the custom palette', () => {
    const custom = buildQQLayoutCss({
      ...QQ_SKIN_DEFAULT_CONFIG, palette: 'custom', customColor: '#FF5722',
    })
    expect(custom).toContain('rgba(255, 87, 34, 0.35)')
    expect(custom).toContain('rgba(255, 87, 34, 0.12)')
    expect(custom).not.toContain('rgba(18, 183, 245, 0.35)')
  })

  it('keeps classic QQ blue shadows on preset palettes', () => {
    expect(QQ_LAYOUT_CSS).toContain('rgba(18, 183, 245, 0.35)')
    expect(QQ_LAYOUT_CSS).toContain('rgba(18, 122, 175, 0.12)')
  })

  it('qqblue palette renders uniform bubble corners and a subtle light-mode gradient', () => {
    const qqblue = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, palette: 'qqblue' })
    expect(qqblue).toMatch(/\[data-message-bubble\]\[data-message-bubble\] \{\s*position: relative;\s*border-radius: 16px;/)
    expect(qqblue).toContain('linear-gradient(135deg, rgb(44, 110, 214) 0%, rgb(48, 95, 204) 100%)')
    expect(qqblue).toContain("body:not([data-ds-dark-theme]) [data-message-bubble][data-message-bubble]")
  })

  it('classic palette keeps the tail-side small corner and no gradient', () => {
    expect(QQ_LAYOUT_CSS).toContain('border-radius: 16px 6px 16px 16px;')
    expect(QQ_LAYOUT_CSS).not.toContain('linear-gradient')
  })

  it('targets the user bubble through the hash-independent data-message-bubble anchor', () => {
    // harness 的用户气泡类名是 `_bubble_1sgyj_1`(本地名在开头),
    // `[class$='_bubble']` 从不命中 → 白字/圆角/尾巴全部失效。
    // 气泡一律走 UserMessageBubble 透传的 data-message-bubble 属性。
    expect(QQ_LAYOUT_CSS).not.toContain("[class$='_bubble']")
    expect(QQ_LAYOUT_CSS).toContain('[data-message-bubble][data-message-bubble] {')
    // 重复属性选择器把特异度提到 (0,2,0),压过 harness 的 (0,1,0) 类规则。
    expect(QQ_LAYOUT_CSS).toContain('[data-message-bubble][data-message-bubble] :not(pre):not(pre *):not(code) {')
    expect(QQ_LAYOUT_CSS).toContain('[data-message-bubble][data-message-bubble]::after {')
  })

  it('renders user bubbles solid with white text and inherited link color', () => {
    // 实色气泡上深色字不可读:布局层统一指定白字,链接继承白字避免蓝链
    // 接融进蓝底(对应 QQ 发送气泡观感)。
    expect(QQ_LAYOUT_CSS).toMatch(/\[data-message-bubble\]\[data-message-bubble\] \{[^}]*color: rgb\(255, 255, 255\)/)
    expect(QQ_LAYOUT_CSS).toContain("[data-message-bubble][data-message-bubble] a {")
    expect(QQ_LAYOUT_CSS).toContain('color: inherit')
  })

  it('forces white text on every bubble descendant but leaves code blocks alone', () => {
    // 气泡里的 markdown 正文各元素从 --dsw-alias-label-* 取自己的深色,
    // 只给容器上色会被子元素覆盖 → 逐元素压白,并排除代码块。
    expect(QQ_LAYOUT_CSS).toContain("[data-message-bubble][data-message-bubble] :not(pre):not(pre *):not(code) {")
    const descendantRule = QQ_LAYOUT_CSS.slice(
      QQ_LAYOUT_CSS.indexOf("[data-message-bubble][data-message-bubble] :not(pre):not(pre *):not(code) {"),
    )
    expect(descendantRule.slice(0, descendantRule.indexOf('}'))).toContain('color: rgb(255, 255, 255)')
    expect(QQ_LAYOUT_CSS).not.toMatch(/\[data-message-bubble\]\[data-message-bubble\] code[^\n]*\{[^}]*color: rgb\(255, 255, 255\)/)
  })

  it('switches to dark text and a hairline border on the clean palette light bubble', () => {
    // 简洁白气泡是纯白底:白字会隐身 → 亮色用深字 + 发丝边;暗色气泡仍为
    // 深底,靠暗色规则拉回白字。
    const clean = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, palette: 'clean' })
    expect(clean).toMatch(/\[data-message-bubble\]\[data-message-bubble\] \{[^}]*color: rgb\(15, 40, 59\)/)
    expect(clean).not.toMatch(/\[data-message-bubble\]\[data-message-bubble\] \{[^}]*color: rgb\(255, 255, 255\)/)
    expect(clean).toContain('border: 1px solid var(--dsw-alias-border-l2);')
    expect(clean).toContain("[data-message-bubble][data-message-bubble] :not(pre):not(pre *):not(code) {\n  color: rgb(15, 40, 59);")
    expect(clean).toContain("body[data-ds-dark-theme] [data-message-bubble][data-message-bubble],")
    const darkRule = clean.slice(clean.indexOf("body[data-ds-dark-theme] [data-message-bubble][data-message-bubble],"))
    expect(darkRule.slice(0, darkRule.indexOf('}'))).toContain('color: rgb(255, 255, 255)')
    // 其他色板不该带这条例外规则。
    expect(QQ_LAYOUT_CSS).not.toContain('border: 1px solid var(--dsw-alias-border-l2);')
  })
})
