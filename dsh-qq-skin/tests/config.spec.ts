import { describe, expect, it } from 'vitest'
import {
  QQ_AVATAR_STYLES,
  QQ_SKIN_CONFIG_FIELDS,
  QQ_SKIN_DEFAULT_CONFIG,
  QQ_SKIN_PALETTES,
  normalizeAvatarImage,
  resolveQQSkinConfig,
  sameQQSkinConfig,
} from '../src/client/config.ts'

describe('QQ skin config', () => {
  it('declares the seven palette variants', () => {
    expect(QQ_SKIN_PALETTES).toEqual(['classic', 'vivid', 'clean', 'green', 'black', 'qqblue', 'custom'])
  })

  it('keeps the shared field list in step with the config shape', () => {
    // 新增配置项忘了登记到 QQ_SKIN_CONFIG_FIELDS 时,热更新比较会漏掉它
    // (字段变了却不重挂皮肤层)。这里把清单与运行时配置对象的键对齐。
    expect([...QQ_SKIN_CONFIG_FIELDS].sort()).toEqual(Object.keys(QQ_SKIN_DEFAULT_CONFIG).sort())
  })

  it('treats two configs as equal only when every shared field matches', () => {
    const base = resolveQQSkinConfig()
    expect(sameQQSkinConfig(base, { ...base })).toBe(true)
    for (const field of QQ_SKIN_CONFIG_FIELDS) {
      const value = base[field]
      const changed = typeof value === 'boolean'
        ? !value
        : typeof value === 'number'
          ? value + 1
          : `${value}x`
      expect(sameQQSkinConfig(base, { ...base, [field]: changed })).toBe(false)
    }
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

  it('typing defaults to true and toggles via override', () => {
    expect(resolveQQSkinConfig().typing).toBe(true)
    expect(resolveQQSkinConfig({ typing: false }).typing).toBe(false)
    expect(resolveQQSkinConfig({ typing: 1 as never }).typing).toBe(true)
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

  it('ignores retired fields left in older config documents', () => {
    // 0.6 删掉了提示音/壁纸/主题导入导出共 13 项;旧文档里残留的键必须被静默忽略,
    // 既不报错也不进入结果,只输出 12 个受支持的字段。
    const legacy = {
      ...QQ_SKIN_DEFAULT_CONFIG,
      palette: 'green',
      messageSound: true,
      chatWallpaper: 'https://example.com/bg.jpg',
      windowShake: true,
    } as never
    const config = resolveQQSkinConfig(legacy)
    expect(Object.keys(config).sort()).toEqual(Object.keys(QQ_SKIN_DEFAULT_CONFIG).sort())
    expect(config).toEqual({ ...QQ_SKIN_DEFAULT_CONFIG, palette: 'green' })
  })

  it('avatarCustomImage defaults to empty and normalizes invalid sources', () => {    expect(resolveQQSkinConfig().avatarCustomImage).toBe('')
    expect(resolveQQSkinConfig({ avatarCustomImage: 'https://example.com/cat.png' }).avatarCustomImage).toBe('https://example.com/cat.png')
    expect(resolveQQSkinConfig({ avatarCustomImage: '  ' }).avatarCustomImage).toBe('')
    expect(resolveQQSkinConfig({ avatarCustomImage: 'http://insecure.example/x.png' }).avatarCustomImage).toBe('')
    expect(resolveQQSkinConfig({ avatarCustomImage: 123 as never }).avatarCustomImage).toBe('')
  })
})
