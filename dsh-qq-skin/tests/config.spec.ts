import { describe, expect, it } from 'vitest'
import {
  QQ_AVATAR_STYLES,
  QQ_SKIN_DEFAULT_CONFIG,
  QQ_SKIN_PALETTES,
  resolveQQSkinConfig,
} from '../src/client/config.ts'

describe('QQ skin config', () => {
  it('declares the six palette variants', () => {
    expect(QQ_SKIN_PALETTES).toEqual(['classic', 'vivid', 'clean', 'green', 'black', 'custom'])
  })

  it('declares the three avatar styles', () => {
    expect(QQ_AVATAR_STYLES).toEqual(['classic', 'sunglasses', 'scarf'])
  })

  it('avatarStyle defaults to classic and accepts sunglasses or scarf', () => {
    expect(resolveQQSkinConfig().avatarStyle).toBe('classic')
    expect(resolveQQSkinConfig({ avatarStyle: 'sunglasses' }).avatarStyle).toBe('sunglasses')
    expect(resolveQQSkinConfig({ avatarStyle: 'scarf' }).avatarStyle).toBe('scarf')
    expect(resolveQQSkinConfig({ avatarStyle: 'invalid' as never }).avatarStyle).toBe('classic')
  })

  it('customColor normalizes valid hex colors and falls back to default', () => {
    expect(resolveQQSkinConfig().customColor).toBe('#12B7F5')
    expect(resolveQQSkinConfig({ customColor: '#007aff' }).customColor).toBe('#007AFF')
    expect(resolveQQSkinConfig({ customColor: '#abc' }).customColor).toBe('#AABBCC')
    expect(resolveQQSkinConfig({ customColor: 'invalid' }).customColor).toBe('#12B7F5')
  })

  it('falls back to defaults when no config is passed', () => {
    expect(resolveQQSkinConfig()).toEqual(QQ_SKIN_DEFAULT_CONFIG)
    expect(resolveQQSkinConfig(undefined)).toEqual(QQ_SKIN_DEFAULT_CONFIG)
    expect(resolveQQSkinConfig({})).toEqual(QQ_SKIN_DEFAULT_CONFIG)
  })

  it('merges partial config over defaults', () => {
    const config = resolveQQSkinConfig({ palette: 'vivid', bubbleTail: false })
    expect(config).toEqual({ ...QQ_SKIN_DEFAULT_CONFIG, palette: 'vivid', bubbleTail: false })
  })

  it('rejects unknown palette values', () => {
    expect(resolveQQSkinConfig({ palette: 'neon' as never }).palette).toBe('classic')
  })

  it('rejects invalid scalar values', () => {
    expect(resolveQQSkinConfig({ bubbleTail: 'yes' as never }).bubbleTail).toBe(true)
    expect(resolveQQSkinConfig({ chatMaxWidth: 0 }).chatMaxWidth).toBe(QQ_SKIN_DEFAULT_CONFIG.chatMaxWidth)
    expect(resolveQQSkinConfig({ chatMaxWidth: -10 }).chatMaxWidth).toBe(QQ_SKIN_DEFAULT_CONFIG.chatMaxWidth)
    expect(resolveQQSkinConfig({ chatMaxWidth: Number.NaN }).chatMaxWidth).toBe(QQ_SKIN_DEFAULT_CONFIG.chatMaxWidth)
  })

  it('accepts valid scalar overrides', () => {
    const config = resolveQQSkinConfig({ chatMaxWidth: 720, assistantAvatar: false })
    expect(config.chatMaxWidth).toBe(720)
    expect(config.assistantAvatar).toBe(false)
  })

  it('clamps chatMaxWidth to allowed range [480, 1600]', () => {
    expect(resolveQQSkinConfig({ chatMaxWidth: 200 }).chatMaxWidth).toBe(480)
    expect(resolveQQSkinConfig({ chatMaxWidth: 480 }).chatMaxWidth).toBe(480)
    expect(resolveQQSkinConfig({ chatMaxWidth: 1200 }).chatMaxWidth).toBe(1200)
    expect(resolveQQSkinConfig({ chatMaxWidth: 1600 }).chatMaxWidth).toBe(1600)
    expect(resolveQQSkinConfig({ chatMaxWidth: 2400 }).chatMaxWidth).toBe(1600)
  })

  it('messageSound defaults to false and toggles via override', () => {
    expect(resolveQQSkinConfig().messageSound).toBe(false)
    expect(resolveQQSkinConfig({ messageSound: true }).messageSound).toBe(true)
    expect(resolveQQSkinConfig({ messageSound: 'yes' as never }).messageSound).toBe(false)
  })

  it('typing defaults to true and toggles via override', () => {
    expect(resolveQQSkinConfig().typing).toBe(true)
    expect(resolveQQSkinConfig({ typing: false }).typing).toBe(false)
    expect(resolveQQSkinConfig({ typing: 1 as never }).typing).toBe(true)
  })

  it('messageSound and sendSound default to false and toggle via override', () => {
    expect(resolveQQSkinConfig().messageSound).toBe(false)
    expect(resolveQQSkinConfig({ messageSound: true }).messageSound).toBe(true)
    expect(resolveQQSkinConfig({ messageSound: 1 as never }).messageSound).toBe(false)

    expect(resolveQQSkinConfig().sendSound).toBe(false)
    expect(resolveQQSkinConfig({ sendSound: true }).sendSound).toBe(true)
    expect(resolveQQSkinConfig({ sendSound: 'yes' as never }).sendSound).toBe(false)
  })

  it('soundVariant defaults to beep and accepts waterdrop or knock', () => {
    expect(resolveQQSkinConfig().soundVariant).toBe('beep')
    expect(resolveQQSkinConfig({ soundVariant: 'waterdrop' }).soundVariant).toBe('waterdrop')
    expect(resolveQQSkinConfig({ soundVariant: 'knock' }).soundVariant).toBe('knock')
    expect(resolveQQSkinConfig({ soundVariant: 'invalid' as never }).soundVariant).toBe('beep')
  })

  it('windowShake and frostedGlass default to false and toggle via override', () => {
    expect(resolveQQSkinConfig().windowShake).toBe(false)
    expect(resolveQQSkinConfig({ windowShake: true }).windowShake).toBe(true)
    expect(resolveQQSkinConfig({ windowShake: 'yes' as never }).windowShake).toBe(false)

    expect(resolveQQSkinConfig().frostedGlass).toBe(false)
    expect(resolveQQSkinConfig({ frostedGlass: true }).frostedGlass).toBe(true)
    expect(resolveQQSkinConfig({ frostedGlass: 1 as never }).frostedGlass).toBe(false)
  })
})
