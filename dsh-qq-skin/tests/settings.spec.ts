import { describe, expect, it } from 'vitest'
import { QQ_SKIN_SETTINGS_NS, settingsToConfig, type QQSkinSettings } from '../src/client/settings.ts'

describe('QQ skin settings', () => {
  it('addresses the profile entry id as its settings namespace', () => {
    expect(QQ_SKIN_SETTINGS_NS).toBe('qq-skin')
  })

  it('resolves to defaults when no setting section and no fallback', () => {
    expect(settingsToConfig(undefined)).toEqual({
      palette: 'classic', customColor: '#12B7F5', avatarStyle: 'classic',
      bubbleTail: true, assistantAvatar: true,
      chatMaxWidth: 880, messageSound: false, sendSound: false, soundVariant: 'beep',
      soundVolume: 1, remindOnlyWhenUnfocused: false, windowShake: false, frostedGlass: false, typing: true,
    })
  })

  it('prefers settings fields over fallback config', () => {
    const section: QQSkinSettings = { palette: 'vivid', chatMaxWidth: 720, soundVariant: 'waterdrop', avatarStyle: 'sunglasses' }
    const config = settingsToConfig(section, { palette: 'clean', bubbleTail: false, soundVariant: 'knock', avatarStyle: 'scarf' })
    expect(config).toEqual({
      palette: 'vivid', customColor: '#12B7F5', avatarStyle: 'sunglasses',
      bubbleTail: false, assistantAvatar: true,
      chatMaxWidth: 720, messageSound: false, sendSound: false, soundVariant: 'waterdrop',
      soundVolume: 1, remindOnlyWhenUnfocused: false, windowShake: false, frostedGlass: false, typing: true,
    })
  })

  it('fills unset settings fields from the fallback config', () => {
    const section: QQSkinSettings = { bubbleTail: false }
    const config = settingsToConfig(section, { palette: 'green', chatMaxWidth: 640, windowShake: true, avatarStyle: 'scarf' })
    expect(config).toEqual({
      palette: 'green', customColor: '#12B7F5', avatarStyle: 'scarf',
      bubbleTail: false, assistantAvatar: true,
      chatMaxWidth: 640, messageSound: false, sendSound: false, soundVariant: 'beep',
      soundVolume: 1, remindOnlyWhenUnfocused: false, windowShake: true, frostedGlass: false, typing: true,
    })
  })

  it('messageSound, sendSound and typing flow through settings to config', () => {
    const section: QQSkinSettings = { messageSound: true, sendSound: true, typing: false }
    const config = settingsToConfig(section, {})
    expect(config.messageSound).toBe(true)
    expect(config.sendSound).toBe(true)
    expect(config.typing).toBe(false)
  })

  it('fallback config supplies messageSound and typing when settings omit them', () => {
    const config = settingsToConfig(undefined, { messageSound: true, typing: false })
    expect(config.messageSound).toBe(true)
    expect(config.typing).toBe(false)
  })

  it('new visual and sound options flow through settings to config', () => {
    const section: QQSkinSettings = { soundVariant: 'waterdrop', windowShake: true, frostedGlass: true }
    const config = settingsToConfig(section)
    expect(config.soundVariant).toBe('waterdrop')
    expect(config.windowShake).toBe(true)
    expect(config.frostedGlass).toBe(true)
  })

  it('soundVolume flows through settings and clamps out-of-range values', () => {
    expect(settingsToConfig({ soundVolume: 0.4 }).soundVolume).toBe(0.4)
    expect(settingsToConfig({ soundVolume: 1.5 }).soundVolume).toBe(1)
    expect(settingsToConfig({ soundVolume: -0.2 }).soundVolume).toBe(0)
    expect(settingsToConfig({ soundVolume: Number.NaN }).soundVolume).toBe(1)
    expect(settingsToConfig(undefined, { soundVolume: 0.6 }).soundVolume).toBe(0.6)
  })

  it('remindOnlyWhenUnfocused flows through settings and rejects non-boolean', () => {
    expect(settingsToConfig({ remindOnlyWhenUnfocused: true }).remindOnlyWhenUnfocused).toBe(true)
    expect(settingsToConfig({ remindOnlyWhenUnfocused: 'yes' as never }).remindOnlyWhenUnfocused).toBe(false)
    expect(settingsToConfig(undefined, { remindOnlyWhenUnfocused: true }).remindOnlyWhenUnfocused).toBe(true)
  })

  it('quiet hours flow through settings and reject malformed times', () => {
    const config = settingsToConfig({ quietHoursStart: '22:00', quietHoursEnd: '08:00' })
    expect(config.quietHoursStart).toBe('22:00')
    expect(config.quietHoursEnd).toBe('08:00')
    expect(settingsToConfig({ quietHoursStart: '25:00' }).quietHoursStart).toBe('')
    expect(settingsToConfig({ quietHoursEnd: 'noon' as never }).quietHoursEnd).toBe('')
  })

  it('sanitizes invalid or out-of-range fields from settings section', () => {
    const section: QQSkinSettings = { palette: 'unknown' as never, chatMaxWidth: 200 }
    const config = settingsToConfig(section)
    expect(config.palette).toBe('classic')
    expect(config.chatMaxWidth).toBe(480)
  })
})