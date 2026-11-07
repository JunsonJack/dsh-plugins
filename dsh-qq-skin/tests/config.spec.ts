import { describe, expect, it } from 'vitest'
import {
  QQ_AVATAR_STYLES,
  QQ_SKIN_DEFAULT_CONFIG,
  QQ_SKIN_PALETTES,
  currentLocalMinutes,
  isWithinQuietHours,
  normalizeAvatarImage,
  normalizeQuietTime,
  resolveQQSkinConfig,
} from '../src/client/config.ts'

describe('QQ skin config', () => {
  it('declares the seven palette variants', () => {
    expect(QQ_SKIN_PALETTES).toEqual(['classic', 'vivid', 'clean', 'green', 'black', 'qqblue', 'custom'])
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

  it('avatarSize defaults to 22 and clamps into [16, 40]', () => {
    expect(resolveQQSkinConfig().avatarSize).toBe(22)
    expect(resolveQQSkinConfig({ avatarSize: 28 }).avatarSize).toBe(28)
    expect(resolveQQSkinConfig({ avatarSize: 10 }).avatarSize).toBe(16)
    expect(resolveQQSkinConfig({ avatarSize: 64 }).avatarSize).toBe(40)
    expect(resolveQQSkinConfig({ avatarSize: 26.4 }).avatarSize).toBe(26)
    expect(resolveQQSkinConfig({ avatarSize: 0 }).avatarSize).toBe(22)
    expect(resolveQQSkinConfig({ avatarSize: -8 }).avatarSize).toBe(22)
    expect(resolveQQSkinConfig({ avatarSize: Number.NaN }).avatarSize).toBe(22)
    expect(resolveQQSkinConfig({ avatarSize: 'big' as never }).avatarSize).toBe(22)
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

  it('soundVolume defaults to 1 and clamps into [0, 1]', () => {
    expect(resolveQQSkinConfig().soundVolume).toBe(1)
    expect(resolveQQSkinConfig({ soundVolume: 0.5 }).soundVolume).toBe(0.5)
    expect(resolveQQSkinConfig({ soundVolume: 0 }).soundVolume).toBe(0)
    expect(resolveQQSkinConfig({ soundVolume: 1 }).soundVolume).toBe(1)
    expect(resolveQQSkinConfig({ soundVolume: 1.7 }).soundVolume).toBe(1)
    expect(resolveQQSkinConfig({ soundVolume: -0.5 }).soundVolume).toBe(0)
    expect(resolveQQSkinConfig({ soundVolume: Number.NaN }).soundVolume).toBe(1)
    expect(resolveQQSkinConfig({ soundVolume: 'loud' as never }).soundVolume).toBe(1)
  })

  it('quiet hours default to disabled and normalize invalid times to empty', () => {
    expect(resolveQQSkinConfig().quietHoursStart).toBe('')
    expect(resolveQQSkinConfig().quietHoursEnd).toBe('')
    expect(resolveQQSkinConfig({ quietHoursStart: '22:00', quietHoursEnd: '08:00' }).quietHoursStart).toBe('22:00')
    expect(resolveQQSkinConfig({ quietHoursStart: '22:00' }).quietHoursEnd).toBe('')
    expect(normalizeQuietTime(' 07:30 ')).toBe('07:30')
    expect(normalizeQuietTime('24:00')).toBe('')
    expect(normalizeQuietTime('7:30')).toBe('')
    expect(normalizeQuietTime('07:5')).toBe('')
    expect(normalizeQuietTime('abc')).toBe('')
    expect(normalizeQuietTime(123 as never)).toBe('')
  })

  it('isWithinQuietHours covers normal and overnight ranges', () => {
    // 未启用:任一端为空。
    expect(isWithinQuietHours(600, '', '08:00')).toBe(false)
    expect(isWithinQuietHours(600, '22:00', '')).toBe(false)
    // 普通区间 09:00→12:00。
    expect(isWithinQuietHours(9 * 60, '09:00', '12:00')).toBe(true)
    expect(isWithinQuietHours(10 * 60 + 30, '09:00', '12:00')).toBe(true)
    expect(isWithinQuietHours(11 * 60 + 59, '09:00', '12:00')).toBe(true)
    expect(isWithinQuietHours(12 * 60, '09:00', '12:00')).toBe(false)
    expect(isWithinQuietHours(8 * 60 + 59, '09:00', '12:00')).toBe(false)
    // 跨午夜区间 22:00→08:00。
    expect(isWithinQuietHours(22 * 60, '22:00', '08:00')).toBe(true)
    expect(isWithinQuietHours(23 * 60 + 59, '22:00', '08:00')).toBe(true)
    expect(isWithinQuietHours(0, '22:00', '08:00')).toBe(true)
    expect(isWithinQuietHours(7 * 60 + 59, '22:00', '08:00')).toBe(true)
    expect(isWithinQuietHours(8 * 60, '22:00', '08:00')).toBe(false)
    expect(isWithinQuietHours(12 * 60, '22:00', '08:00')).toBe(false)
    // 起止相同 = 全天免打扰。
    expect(isWithinQuietHours(0, '00:00', '00:00')).toBe(true)
  })

  it('currentLocalMinutes derives minutes from a Date', () => {
    expect(currentLocalMinutes(new Date(2026, 10, 7, 0, 0))).toBe(0)
    expect(currentLocalMinutes(new Date(2026, 10, 7, 8, 5))).toBe(8 * 60 + 5)
    expect(currentLocalMinutes(new Date(2026, 10, 7, 23, 59))).toBe(23 * 60 + 59)
  })

  it('normalizeAvatarImage accepts data URIs and https URLs only', () => {
    // 空值/非串一律回落空串(= 官方企鹅)。
    expect(normalizeAvatarImage('')).toBe('')
    expect(normalizeAvatarImage('   ')).toBe('')
    expect(normalizeAvatarImage(undefined as never)).toBe('')
    expect(normalizeAvatarImage(42 as never)).toBe('')
    // data URI:支持常见光栅与矢量格式。
    expect(normalizeAvatarImage('data:image/png;base64,iVBORw0K')).toBe('data:image/png;base64,iVBORw0K')
    expect(normalizeAvatarImage('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')
    expect(normalizeAvatarImage('data:image/webp;base64,UklGR')).toBe('data:image/webp;base64,UklGR')
    // https URL:原样保留并 trim。
    expect(normalizeAvatarImage(' https://example.com/penguin.png ')).toBe('https://example.com/penguin.png')
    // http 明文与未知 scheme 不收。
    expect(normalizeAvatarImage('http://example.com/penguin.png')).toBe('')
    expect(normalizeAvatarImage('ftp://example.com/penguin.png')).toBe('')
    expect(normalizeAvatarImage('javascript:alert(1)')).toBe('')
  })

  it('avatarCustomImage defaults to empty and normalizes invalid sources', () => {
    expect(resolveQQSkinConfig().avatarCustomImage).toBe('')
    expect(resolveQQSkinConfig({ avatarCustomImage: 'https://example.com/cat.png' }).avatarCustomImage).toBe('https://example.com/cat.png')
    expect(resolveQQSkinConfig({ avatarCustomImage: '  ' }).avatarCustomImage).toBe('')
    expect(resolveQQSkinConfig({ avatarCustomImage: 'http://insecure.example/x.png' }).avatarCustomImage).toBe('')
    expect(resolveQQSkinConfig({ avatarCustomImage: 123 as never }).avatarCustomImage).toBe('')
  })

  it('remindOnlyWhenUnfocused defaults to false and toggles via override', () => {
    expect(resolveQQSkinConfig().remindOnlyWhenUnfocused).toBe(false)
    expect(resolveQQSkinConfig({ remindOnlyWhenUnfocused: true }).remindOnlyWhenUnfocused).toBe(true)
    expect(resolveQQSkinConfig({ remindOnlyWhenUnfocused: 1 as never }).remindOnlyWhenUnfocused).toBe(false)
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
