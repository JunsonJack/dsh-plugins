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

  it('stops decorative animations under prefers-reduced-motion', () => {
    expect(QQ_LAYOUT_CSS).toContain('@media (prefers-reduced-motion: reduce)')
    expect(QQ_LAYOUT_CSS).toContain('animation: none !important;')
    // 回退规则始终注入(不随 typing/windowShake 开关变化),关闭 typing 后
    // 仍要能压住抖动类,反之亦然。
    const noTyping = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, typing: false, windowShake: false })
    expect(noTyping).toContain('@media (prefers-reduced-motion: reduce)')
    const reducedBlock = noTyping.slice(noTyping.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reducedBlock).toContain(".dsh-qq-shaking")
    expect(reducedBlock.indexOf('animation: none !important')).toBeGreaterThan(0)
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
    expect(off).not.toContain('color-mix(in srgb, var(--dsw-alias-brand-primary) 10%')

    const on = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, frostedGlass: true })
    expect(on).toContain('color-mix(in srgb, var(--dsw-alias-brand-primary) 10%')
  })

  it('frosts the sidebar, right details column, and composer as tinted glass', () => {
    const off = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, frostedGlass: false })
    const on = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, frostedGlass: true })

    // 右栏真实锚点是 _rightbarCol(旧 _detailsCol 在 harness 中不存在,是死选择器)。
    expect(on).toContain("[class$='_rightbarCol']")
    expect(on).not.toContain('_detailsCol')
    expect(off).not.toContain('_detailsCol')
    // 品牌色晕染走 token,跟随色板/自定义主色,不硬编码色板色值。
    expect(on).toContain('color-mix(in srgb, var(--dsw-alias-brand-primary) 10%')
    expect(on).toContain('color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, rgba(255, 255, 255, 0.88) 94%)')
    // 玻璃边缘光(纯色底上可感知的关键层)。
    expect(on).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.65)')
    // 暗色变体同样覆盖右栏与输入框。
    expect(on).toContain("body[data-ds-dark-theme] [class$='_rightbarCol']")
    expect(on).toContain('body[data-ds-dark-theme] [data-composer-card]')
    // ⚠ 三栏列绝不加 backdrop-filter:左栏折叠按钮是 position:fixed(窗口
    // 定位),backdrop-filter 会把列变成 fixed 后代的包含块,按钮被移位/裁掉
    // (0.3.16"折叠展开按钮消失"回归的根因);输入卡无 fixed 后代,保留。
    expect(on).toContain('backdrop-filter: blur(16px) saturate(1.15)')
    const colGlass = on.slice(on.indexOf("body:not([data-ds-dark-theme]) [class$='_sidebarCol']"), on.indexOf('[data-composer-card]'))
    expect(colGlass).not.toContain('backdrop-filter')
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
    // 气泡投影改为三层递进(近/中/远)+ 顶部内高光,立体感更强。
    expect(custom).toContain('rgba(255, 87, 34, 0.22)')
    expect(custom).toContain('rgba(255, 87, 34, 0.18)')
    expect(custom).toContain('rgba(255, 87, 34, 0.10)')
    expect(custom).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.22)')
    expect(custom).not.toContain('rgba(18, 183, 245, 0.35)')
  })

  it('renders markdown tables as a rounded GitHub-style grid', () => {
    expect(QQ_LAYOUT_CSS).toContain("[data-chat-flow-kind='assistant-step'] table {")
    expect(QQ_LAYOUT_CSS).toContain('overflow-x: auto')
    // 不再让 <table> 自己当滚动容器(display:block 会把表格盒拆成匿名盒,
    // Chromium 直接裁掉右侧列 → "少一列/少两列")。
    expect(QQ_LAYOUT_CSS).not.toMatch(/table\s*\{[^}]*display:\s*block/)
    // separate 边框模式 + 圆角:让 overflow 裁切圆角,发丝线只画下/右。
    expect(QQ_LAYOUT_CSS).toContain('border-collapse: separate')
    expect(QQ_LAYOUT_CSS).toContain('border-radius: 10px')
    expect(QQ_LAYOUT_CSS).toContain("border-bottom: 1px solid var(--dsw-alias-border-l1)")
    expect(QQ_LAYOUT_CSS).toContain("border-right: 1px solid var(--dsw-alias-border-l1)")
    // 表头浅色带 + 斑马纹。
    expect(QQ_LAYOUT_CSS).toContain('background: var(--dsw-alias-bg-layer-2)')
    expect(QQ_LAYOUT_CSS).toContain('nth-child(even)')
  })

  it('undoes the harness wide-table bleed so no column is cropped', () => {
    // harness 会用容器查询单位把 ≥4 列的宽表容器撑得比卡片更宽
    // (--dsh-table-lead / --dsh-table-spare),而卡片是 overflow-x:hidden
    // → 右侧列被裁掉。这里把撑宽变量与宽度复位,列一个不少,超宽时在
    // 容器内横向滚动。
    expect(QQ_LAYOUT_CSS).toContain(".md-table-wide {")
    expect(QQ_LAYOUT_CSS).toContain('--dsh-table-lead: 0px')
    expect(QQ_LAYOUT_CSS).toContain('--dsh-table-spare: 0px')
    expect(QQ_LAYOUT_CSS).toContain('margin-left: 0')
    expect(QQ_LAYOUT_CSS).toContain('padding-left: 0')
    expect(QQ_LAYOUT_CSS).toMatch(/\.md-table-wide \{[^}]*overflow-x: auto/)
  })

  it('keeps table cell text from folding mid-word', () => {
    // 单元格按词换行(break-word),不用 anywhere——anywhere 会在字符中间
    // 硬断,让表格右侧的代码/标识符看起来被"折叠"成两半。
    expect(QQ_LAYOUT_CSS).toContain('overflow-wrap: break-word')
    expect(QQ_LAYOUT_CSS).not.toContain('overflow-wrap: anywhere')
  })

  it('keeps inline code inside table cells intact', () => {
    // 表格内的行内代码/等宽片段整体不折行(命令名不被拆断),并渲染成 chip。
    expect(QQ_LAYOUT_CSS).toContain("[data-chat-flow-kind='assistant-step'] table code,")
    expect(QQ_LAYOUT_CSS).toContain("[data-message-bubble][data-message-bubble] table code,")
    expect(QQ_LAYOUT_CSS).toContain('word-break: normal')
  })

  it('never shows a scrollbar on ordinary text blocks', () => {
    // 卡片与气泡只是"防外溢"(hidden),不产生滚动条;
    // 只有 table 允许 overflow-x: auto。
    expect(QQ_LAYOUT_CSS).toContain("[data-chat-flow-kind='assistant-step'] > [data-slot] > [class$='_root'] {\n  overflow-x: hidden;")
    // 气泡不能设 overflow-x: hidden——会裁掉伸出气泡的尾巴,且把 overflow-y
    // 隐式变成 auto,凭空多出纵向滚动条。
    expect(QQ_LAYOUT_CSS).not.toMatch(/\[data-message-bubble\]\[data-message-bubble\] \{[^}]*overflow-x: hidden/)
    const autoRules = QQ_LAYOUT_CSS.match(/[^{}]*\{[^{}]*overflow-x: auto[^{}]*\}/g) ?? []
    for (const rule of autoRules) {
      expect(rule).toContain('table')
    }
  })

  it('keeps wide tables inside the user bubble too', () => {
    expect(QQ_LAYOUT_CSS).toContain("[data-message-bubble][data-message-bubble] table {")
    expect(QQ_LAYOUT_CSS).toContain("[data-message-bubble][data-message-bubble] table td {")
    expect(QQ_LAYOUT_CSS).toContain("[data-message-bubble][data-message-bubble] table th,")
  })

  it('keeps classic QQ blue shadows on preset palettes', () => {
    expect(QQ_LAYOUT_CSS).toContain('rgba(18, 183, 245, 0.35)')
    expect(QQ_LAYOUT_CSS).toContain('rgba(18, 122, 175, 0.22)')
    expect(QQ_LAYOUT_CSS).toContain('rgba(18, 122, 175, 0.18)')
    expect(QQ_LAYOUT_CSS).toContain('rgba(18, 122, 175, 0.10)')
    expect(QQ_LAYOUT_CSS).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.22)')
  })

  it('gives each palette its own bubble shadow hue for depth', () => {
    const green = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, palette: 'green' })
    expect(green).toContain('rgba(5, 138, 76, 0.22)')
    const qqblue = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, palette: 'qqblue' })
    expect(qqblue).toContain('rgba(22, 60, 138, 0.22)')
    const black = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, palette: 'black' })
    expect(black).toContain('rgba(4, 20, 32, 0.22)')
  })

  it('keeps a soft shadow on the bubble tail and dark theme bubbles', () => {
    // 尾巴改用 clip-path 绘制,阴影随之改用 filter: drop-shadow
    // (clip-path 会裁掉 box-shadow)。
    expect(QQ_LAYOUT_CSS).toContain('filter: drop-shadow(1px 2px 3px rgba(18, 122, 175, 0.18))')
    expect(QQ_LAYOUT_CSS).toContain('body[data-ds-dark-theme] [data-message-bubble][data-message-bubble] {')
    expect(QQ_LAYOUT_CSS).toContain('0 4px 14px rgba(0, 0, 0, 0.30)')
  })

  it('draws the bubble tail as a clipped arc that merges with the bubble', () => {
    // 弧形裁切(贝塞尔采样成 polygon),而不是旋转 45° 的方块——
    // 方块尾巴与气泡圆角交界会有硬接缝。
    expect(QQ_LAYOUT_CSS).toContain('clip-path: polygon(')
    expect(QQ_LAYOUT_CSS).not.toContain('transform: rotate(45deg)')
    // 尾巴贴在气泡右下角外侧。
    expect(QQ_LAYOUT_CSS).toMatch(/\[data-message-bubble\]\[data-message-bubble\]::after \{[^}]*right: -6px;/)
  })

  it('keeps the tail background in sync with the bubble background', () => {
    // 普通色板:尾巴用气泡同色 token。
    expect(QQ_LAYOUT_CSS).toMatch(
      /\[data-message-bubble\]\[data-message-bubble\]::after \{[^}]*background: var\(--dsw-specific-bubble\);/,
    )
    // QQ蓝:气泡是渐变,亮色下尾巴取渐变终点实色(尾巴贴合的右下角
    // 正是渐变 100% 处),暗色回到与气泡相同的实色 token。
    const qqblue = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, palette: 'qqblue' })
    expect(qqblue).toMatch(
      /body:not\(\[data-ds-dark-theme\]\) \[data-message-bubble\]\[data-message-bubble\]::after \{\s*background: rgb\(48, 95, 204\);\s*\}/,
    )
    expect(qqblue).not.toContain('rgb(46, 103, 209)')
  })

  it('outlines the tail on the clean palette where the bubble has a border', () => {
    const clean = buildQQLayoutCss({ ...QQ_SKIN_DEFAULT_CONFIG, palette: 'clean' })
    expect(clean).toContain('drop-shadow(0 0 0.5px var(--dsw-alias-border-l2))')
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
