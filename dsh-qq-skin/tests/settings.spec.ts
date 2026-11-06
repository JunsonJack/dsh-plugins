import { describe, expect, it } from 'vitest'
import { QQ_SKIN_SETTINGS_NS, settingsToConfig, type QQSkinSettings } from '../src/client/settings.ts'

describe('QQ skin settings', () => {
  it('addresses the profile entry id as its settings namespace', () => {
    expect(QQ_SKIN_SETTINGS_NS).toBe('qq-skin')
  })

  it('resolves to defaults when no setting section and no fallback', () => {
    expect(settingsToConfig(undefined)).toEqual({
      palette: 'classic', bubbleTail: true, assistantAvatar: true,
      chatMaxWidth: 880, messageSound: false, soundVariant: 'beep',
      windowShake: false, frostedGlass: false, typing: true,
    })
  })

  it('prefers settings fields over fallback config', () => {
    const section: QQSkinSettings = { palette: 'vivid', chatMaxWidth: 720, soundVariant: 'waterdrop' }
    const config = settingsToConfig(section, { palette: 'clean', bubbleTail: false, soundVariant: 'knock' })
    expect(config).toEqual({
      palette: 'vivid', bubbleTail: false, assistantAvatar: true,
      chatMaxWidth: 720, messageSound: false, soundVariant: 'waterdrop',
      windowShake: false, frostedGlass: false, typing: true,
    })
  })

  it('fills unset settings fields from the fallback config', () => {
    const section: QQSkinSettings = { bubbleTail: false }
    const config = settingsToConfig(section, { palette: 'green', chatMaxWidth: 640, windowShake: true })
    expect(config).toEqual({
      palette: 'green', bubbleTail: false, assistantAvatar: true,
      chatMaxWidth: 640, messageSound: false, soundVariant: 'beep',
      windowShake: true, frostedGlass: false, typing: true,
    })
  })

  it('messageSound and typing flow through settings to config', () => {
    const section: QQSkinSettings = { messageSound: true, typing: false }
    const config = settingsToConfig(section, {})
    expect(config.messageSound).toBe(true)
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

  it('sanitizes invalid or out-of-range fields from settings section', () => {
    const section: QQSkinSettings = { palette: 'unknown' as never, chatMaxWidth: 200 }
    const config = settingsToConfig(section)
    expect(config.palette).toBe('classic')
    expect(config.chatMaxWidth).toBe(480)
  })
})