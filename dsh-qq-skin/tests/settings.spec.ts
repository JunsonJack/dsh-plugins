import { describe, expect, it } from 'vitest'
import { QQ_SKIN_SETTINGS_NS, settingsToConfig, type QQSkinSettings } from '../src/client/settings.ts'

const DEFAULTS = {
  palette: 'classic', customColor: '#12B7F5', density: 'normal', avatarStyle: 'classic', avatarCustomImage: '',
  bubbleTail: true, assistantAvatar: true, avatarSize: 22,
  chatMaxWidth: 880, frostedGlass: false, typing: true,
}

describe('QQ skin settings', () => {
  it('addresses the profile entry id as its settings namespace', () => {
    expect(QQ_SKIN_SETTINGS_NS).toBe('qq-skin')
  })

  it('resolves to defaults when no setting section and no fallback', () => {
    expect(settingsToConfig(undefined)).toEqual(DEFAULTS)
  })

  it('prefers settings fields over fallback config', () => {
    const section: QQSkinSettings = { palette: 'vivid', chatMaxWidth: 720, avatarStyle: 'sunglasses' }
    const config = settingsToConfig(section, { palette: 'clean', bubbleTail: false, avatarStyle: 'scarf' })
    expect(config).toEqual({ ...DEFAULTS, palette: 'vivid', avatarStyle: 'sunglasses', chatMaxWidth: 720, bubbleTail: false })
  })

  it('fills unset settings fields from the fallback config', () => {
    const section: QQSkinSettings = { bubbleTail: false }
    const config = settingsToConfig(section, { palette: 'green', chatMaxWidth: 640, avatarStyle: 'scarf' })
    expect(config).toEqual({ ...DEFAULTS, palette: 'green', avatarStyle: 'scarf', chatMaxWidth: 640, bubbleTail: false })
  })

  it('typing flows through settings to config', () => {
    expect(settingsToConfig({ typing: false }, {}).typing).toBe(false)
    expect(settingsToConfig(undefined, { typing: false }).typing).toBe(false)
  })

  it('density flows through settings and rejects unknown values', () => {
    expect(settingsToConfig({ density: 'compact' }).density).toBe('compact')
    expect(settingsToConfig({ density: 'roomy' as never }).density).toBe('normal')
    expect(settingsToConfig(undefined, { density: 'compact' }).density).toBe('compact')
  })

  it('frostedGlass flows through settings and rejects non-boolean', () => {
    expect(settingsToConfig({ frostedGlass: true }).frostedGlass).toBe(true)
    expect(settingsToConfig({ frostedGlass: 'yes' as never }).frostedGlass).toBe(false)
    expect(settingsToConfig(undefined, { frostedGlass: true }).frostedGlass).toBe(true)
  })

  it('drops the removed timeDivider field from legacy sections', () => {
    // 分隔条功能整体移除后，用户旧配置里残留的 timeDivider 不应出现在
    // 解析结果里（否则会被热更新比较当成未知字段）。
    const merged: Record<string, unknown> = settingsToConfig({ timeDivider: false } as never)
    expect('timeDivider' in merged).toBe(false)
    expect(merged).toEqual(DEFAULTS)
  })

  it('avatarCustomImage flows through settings and rejects insecure sources', () => {
    expect(settingsToConfig({ avatarCustomImage: 'https://example.com/penguin.png' }).avatarCustomImage).toBe('https://example.com/penguin.png')
    expect(settingsToConfig({ avatarCustomImage: 'data:image/png;base64,iVBORw0K' }).avatarCustomImage).toBe('data:image/png;base64,iVBORw0K')
    expect(settingsToConfig({ avatarCustomImage: 'http://example.com/x.png' }).avatarCustomImage).toBe('')
    expect(settingsToConfig({ avatarCustomImage: 'not a url' }).avatarCustomImage).toBe('')
    expect(settingsToConfig(undefined, { avatarCustomImage: 'https://fallback.example/y.png' }).avatarCustomImage).toBe('https://fallback.example/y.png')
  })

  it('avatarSize flows through settings and clamps to the 16~40 range', () => {
    expect(settingsToConfig({ avatarSize: 32 }).avatarSize).toBe(32)
    expect(settingsToConfig({ avatarSize: 8 }).avatarSize).toBe(16)
    expect(settingsToConfig({ avatarSize: 96 }).avatarSize).toBe(40)
    expect(settingsToConfig({ avatarSize: 26.4 }).avatarSize).toBe(26)
    expect(settingsToConfig({ avatarSize: Number.NaN }).avatarSize).toBe(22)
    expect(settingsToConfig(undefined, { avatarSize: 28 }).avatarSize).toBe(28)
  })

  it('sanitizes invalid or out-of-range fields from settings section', () => {
    const section: QQSkinSettings = { palette: 'unknown' as never, chatMaxWidth: 200 }
    const config = settingsToConfig(section)
    expect(config.palette).toBe('classic')
    expect(config.chatMaxWidth).toBe(480)
  })
})
