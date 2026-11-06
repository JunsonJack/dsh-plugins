import { describe, expect, it } from 'vitest'
import {
  buildCustomTokenDeltas, buildTokenOverrides, mixColors, QQ_SKIN_SOURCE, QQ_TOKEN_OVERRIDES,
} from '../src/client/qq-tokens.ts'
import { QQ_SKIN_PALETTES } from '../src/client/config.ts'

describe('QQ skin token layer', () => {
  it('names the plugin as the override source', () => {
    expect(QQ_SKIN_SOURCE).toBe('dsh-qq-skin')
  })

  it('provides a non-empty override set', () => {
    expect(Object.keys(QQ_TOKEN_OVERRIDES).length).toBeGreaterThan(0)
  })

  it('gives every token both palette modes as non-empty strings', () => {
    for (const [name, modes] of Object.entries(QQ_TOKEN_OVERRIDES)) {
      expect(name.startsWith('--dsw-'), `token name ${name}`).toBe(true)
      expect(typeof modes.light, `${name}.light`).toBe('string')
      expect(typeof modes.dark, `${name}.dark`).toBe('string')
      expect(modes.light.trim(), `${name}.light`).not.toBe('')
      expect(modes.dark.trim(), `${name}.dark`).not.toBe('')
    }
  })

  it('covers the core QQ surfaces', () => {
    expect(QQ_TOKEN_OVERRIDES['--dsw-alias-brand-primary']).toMatchObject({
      light: '#12B7F5', dark: '#4CB8FF',
    })
    expect(QQ_TOKEN_OVERRIDES['--dsw-specific-bubble']).toBeDefined()
    expect(QQ_TOKEN_OVERRIDES['--dsw-alias-bg-base']).toBeDefined()
    expect(QQ_TOKEN_OVERRIDES['--dsw-specific-sidebar-fill']).toBeDefined()
  })

  it('remaps the static blue palette so no default deepseek blue leaks', () => {
    // Components referencing --dsw-static-* directly (ChatView gradient,
    // StateDot, TrajectoryTable, ContextMeter) must render QQ sky blue, not
    // the harness default deepseek blue-purple #416EE6.
    expect(QQ_TOKEN_OVERRIDES['--dsw-static-deepseek-500']).toMatchObject({
      light: '#12B7F5', dark: '#12B7F5',
    })
    expect(QQ_TOKEN_OVERRIDES['--dsw-static-blue-500']).toMatchObject({
      light: '#12B7F5', dark: '#12B7F5',
    })
    expect(QQ_TOKEN_OVERRIDES['--dsw-static-deepseek-50']).toBeDefined()
    expect(QQ_TOKEN_OVERRIDES['--dsw-static-blue-950']).toBeDefined()
  })

  it('distinguishes light from dark where the palette varies', () => {
    const brand = QQ_TOKEN_OVERRIDES['--dsw-alias-brand-primary']!
    expect(brand.light).not.toBe(brand.dark)
    const bubble = QQ_TOKEN_OVERRIDES['--dsw-specific-bubble']!
    expect(bubble.light).not.toBe(bubble.dark)
  })

  it('is free of placeholder values', () => {
    for (const modes of Object.values(QQ_TOKEN_OVERRIDES)) {
      expect(modes.light).not.toMatch(/placeholder|TODO|undefined|NaN/)
      expect(modes.dark).not.toMatch(/placeholder|TODO|undefined|NaN/)
    }
  })
})

describe('QQ skin token palettes', () => {
  it('classic palette matches the legacy full set', () => {
    expect(buildTokenOverrides('classic')).toEqual(QQ_TOKEN_OVERRIDES)
  })

  it('every palette keeps the full non-empty override set', () => {
    for (const palette of QQ_SKIN_PALETTES) {
      const overrides = buildTokenOverrides(palette)
      expect(Object.keys(overrides).length, palette).toBeGreaterThan(0)
      for (const [name, modes] of Object.entries(overrides)) {
        expect(name.startsWith('--dsw-'), `${palette} ${name}`).toBe(true)
        expect(typeof modes.light, `${palette} ${name}.light`).toBe('string')
        expect(typeof modes.dark, `${palette} ${name}.dark`).toBe('string')
        expect(modes.light.trim(), `${palette} ${name}.light`).not.toBe('')
        expect(modes.dark.trim(), `${palette} ${name}.dark`).not.toBe('')
      }
    }
  })

  it('vivid palette remaps brand, bubbles and static scale to purple', () => {
    const vivid = buildTokenOverrides('vivid')
    expect(vivid['--dsw-alias-brand-primary']).toMatchObject({
      light: '#8A5CF5', dark: '#A78BFA',
    })
    expect(vivid['--dsw-specific-bubble']).toMatchObject({
      light: '#8A5CF5', dark: '#322A55',
    })
    expect(vivid['--dsw-static-deepseek-500']).toMatchObject({
      light: '#8A5CF5', dark: '#8A5CF5',
    })
    expect(vivid['--dsw-static-blue-500']).toMatchObject({
      light: '#8A5CF5', dark: '#8A5CF5',
    })
  })

  it('vivid palette keeps QQ status colors as the recognition accents', () => {
    const vivid = buildTokenOverrides('vivid')
    expect(vivid['--dsw-alias-state-success-primary']).toEqual({ light: '#07C160', dark: '#2FD57F' })
    expect(vivid['--dsw-alias-state-error-primary']).toEqual({ light: '#FA5151', dark: '#FF6B6B' })
    expect(vivid['--dsw-alias-state-warn-primary']).toEqual({ light: '#FFC300', dark: '#FFCC33' })
  })

  it('clean palette whitens surfaces while keeping blue as accent', () => {
    const clean = buildTokenOverrides('clean')
    expect(clean['--dsw-alias-bg-base']).toMatchObject({ light: '#FFFFFF' })
    expect(clean['--dsw-alias-bg-layer-1']).toMatchObject({ light: '#FFFFFF' })
    expect(clean['--dsw-alias-brand-primary']).toMatchObject({
      light: '#12B7F5', dark: '#4CB8FF',
    })
    expect(clean['--dsw-specific-bubble']).toMatchObject({ light: '#1F2A35' })
  })

  it('green palette remaps bubbles and static scale to classic QQ green', () => {
    const green = buildTokenOverrides('green')
    expect(green['--dsw-specific-bubble']).toMatchObject({
      light: '#07C160', dark: '#1E5C3C',
    })
    expect(green['--dsw-static-deepseek-500']).toMatchObject({
      light: '#95EC69', dark: '#95EC69',
    })
    expect(green['--dsw-static-blue-500']).toMatchObject({
      light: '#95EC69', dark: '#95EC69',
    })
    // 品牌仍为 QQ 蓝,绿只做气泡/静态色板点缀。
    expect(green['--dsw-alias-brand-primary']).toMatchObject({
      light: '#12B7F5', dark: '#4CB8FF',
    })
  })

  it('qqblue palette remaps brand, bubbles and static scale to the sampled QQ NT blue', () => {
    const qqblue = buildTokenOverrides('qqblue')
    expect(qqblue['--dsw-alias-brand-primary']).toMatchObject({
      light: '#2E65D1', dark: mixColors('#2E65D1', '#FFFFFF', 0.28),
    })
    expect(qqblue['--dsw-specific-bubble']).toMatchObject({
      light: '#2E65D1', dark: mixColors('#2E65D1', '#101822', 0.68),
    })
    expect(qqblue['--dsw-static-deepseek-500']).toMatchObject({
      light: '#2E65D1', dark: '#2E65D1',
    })
    expect(qqblue['--dsw-static-blue-500']).toMatchObject({
      light: '#2E65D1', dark: '#2E65D1',
    })
  })

  it('black palette keeps a near-black base in both modes while keeping blue as accent', () => {
    const black = buildTokenOverrides('black')
    expect(black['--dsw-alias-bg-base']).toEqual({ light: '#05070B', dark: '#05070B' })
    expect(black['--dsw-alias-bg-layer-1']).toEqual({ light: '#0B0F16', dark: '#0B0F16' })
    expect(black['--dsw-specific-sidebar-fill']).toEqual({ light: '#03050A', dark: '#03050A' })
    expect(black['--dsw-alias-brand-primary']).toMatchObject({
      light: '#12B7F5', dark: '#4CB8FF',
    })
  })

  it('rejects unknown palettes by falling back to classic', () => {
    expect(buildTokenOverrides('neon' as never)).toEqual(QQ_TOKEN_OVERRIDES)
  })

  it('custom palette derives brand and bubble tokens from customColor', () => {
    const custom = buildTokenOverrides('custom', '#FF5722')
    expect(custom['--dsw-alias-brand-primary'].light).toBe('#FF5722')
    // 气泡实色化:亮色直接取主色(白字由布局层统一指定),不再是浅色调。
    expect(custom['--dsw-specific-bubble'].light).toBe('#FF5722')
    expect(custom['--dsw-specific-bubble'].dark).toBeDefined()
    expect(custom['--dsw-alias-brand-primary'].dark).not.toBe('#FF5722')
  })

  it('every palette ships a solid brand bubble, not a pale tint', () => {
    const solid: Record<string, string> = {
      classic: '#12B7F5', vivid: '#8A5CF5', clean: '#1F2A35', green: '#07C160', black: '#0E2638', qqblue: '#2E65D1',
    }
    for (const [palette, expected] of Object.entries(solid)) {
      const overrides = buildTokenOverrides(palette as never)
      expect(overrides['--dsw-specific-bubble']!.light, palette).toBe(expected)
      // 暗色值同样存在且为深基调(实色底统一配白字)。
      expect(overrides['--dsw-specific-bubble']!.dark, palette).toBeDefined()
    }
  })

  it('custom palette follows customColor across buttons, links, accents and static scales', () => {
    // 修复前:主按钮/链接文字/选中态/static 刻度仍写死 QQ 蓝,导致部分
    // 带颜色的文字、链接、按钮不跟随自定义主色。
    const custom = buildTokenOverrides('custom', '#FF5722')
    expect(custom['--dsw-alias-button-primary-fill']).toMatchObject({ light: '#FF5722' })
    expect(custom['--dsw-alias-button-primary-hover'].light).toBe(mixColors('#FF5722', '#000000', 0.08))
    expect(custom['--dsw-alias-button-contrast-fill']).toMatchObject({ light: '#FF5722' })
    expect(custom['--dsw-alias-button-ghost-active-border']).toMatchObject({ light: '#FF5722' })
    expect(custom['--dsw-specific-sidebar-nav-item-active-accent']).toMatchObject({ light: '#FF5722' })
    expect(custom['--dsw-alias-label-primary-bluish'].light).toBe(mixColors('#FF5722', '#000000', 0.30))
    expect(custom['--dsw-alias-interactive-bg-hover-accent'].light).toBe('rgba(255, 87, 34, 0.10)')
    expect(custom['--dsw-static-deepseek-500']).toMatchObject({ light: '#FF5722', dark: '#FF5722' })
    expect(custom['--dsw-static-blue-50'].light).toBe(mixColors('#FF5722', '#FFFFFF', 0.94))
    expect(custom['--dsw-static-deepseek-900'].light).toBe(mixColors('#FF5722', '#000000', 0.55))
    // 主色之上的反白文字按亮度自动选择(亮主色配白字,提亮后的暗色配深字)。
    expect(custom['--dsw-alias-brand-primary-invert'].light).toBe('#FFFFFF')
    expect(custom['--dsw-alias-brand-primary-invert'].dark).toBe('#101822')
  })

  it('custom palette overrides every token the classic base hardcodes QQ blue into', () => {
    const deltas = buildCustomTokenDeltas('#FF5722')
    const blueBound = Object.entries(QQ_TOKEN_OVERRIDES)
      .filter(([, modes]) => Object.values(modes).some(
        (value) => value.includes('#12B7F5') || value.includes('rgba(18, 183, 245'),
      ))
      .map(([name]) => name)
    expect(blueBound.length).toBeGreaterThan(0)
    for (const name of blueBound) {
      expect(deltas[name], name).toBeDefined()
    }
  })

  it('custom palette leaves no hardcoded QQ blue behind', () => {
    const merged = buildTokenOverrides('custom', '#FF5722')
    for (const [name, modes] of Object.entries(merged)) {
      expect(JSON.stringify(modes), name).not.toContain('#12B7F5')
      expect(JSON.stringify(modes), name).not.toContain('rgba(18, 183, 245')
    }
  })

  it('custom palette falls back to the default QQ blue for invalid colors', () => {
    const custom = buildTokenOverrides('custom', 'not-a-color')
    expect(custom['--dsw-alias-brand-primary']).toMatchObject({ light: '#12B7F5' })
    expect(custom['--dsw-static-deepseek-500']).toMatchObject({ light: '#12B7F5' })
    expect(custom['--dsw-alias-button-primary-fill']).toMatchObject({ light: '#12B7F5' })
  })
})
