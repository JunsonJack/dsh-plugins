import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { apply, inject, QQ_SKIN_CONFIG_ROW_KEY, QQ_SKIN_SETTINGS_NS } from '../src/client/index.ts'
import { QQ_LAYOUT_PLUGIN } from '../src/client/qq-layout.ts'
import { QQ_SKIN_SOURCE, buildTokenOverrides } from '../src/client/qq-tokens.ts'
import { QQ_SKIN_DEFAULT_CONFIG } from '../src/client/config.ts'
import { QQ_SKIN_PLUGIN_NS, zh, en } from '../src/client/plugin-locales.ts'
import { QQSkinPluginCard } from '../src/client/plugin-page.tsx'
import type { QQSkinSettings } from '../src/client/settings.ts'

/** 可驱动的 configForms stub:模拟宿主设置表单的快照 + 订阅 + 写回。 */
function stubConfigForm(initial?: QQSkinSettings, revision = 0) {
  const listeners: Array<() => void> = []
  const written: Array<[string, unknown]> = []
  const form = {
    getSnapshot: () => ({
      status: initial === undefined ? 'loading' as const : 'ready' as const,
      value: initial,
      revision,
    }),
    subscribe: (fn: () => void) => { listeners.push(fn); return () => {} },
    set: (field: string, value: unknown) => { written.push([field, value]); return Promise.resolve(true) },
  }
  return {
    form,
    written,
    /** 模拟宿主接受写入后快照更新:改值并触发订阅者。 */
    push(section: QQSkinSettings, nextRevision = revision + 1): void {
      initial = section
      revision = nextRevision
      for (const fn of listeners) fn()
    },
  }
}

/** slots.inject 的最小 stub:同步执行回调并返回注销函数(与 SlotRegistry 语义一致)。 */
function stubSlots() {
  const injectedKeys: Array<string> = []
  const registered: Array<{ options: Record<string, unknown>; component: unknown }> = []
  const inject = vi.fn((key: string, callback: () => () => void) => {
    injectedKeys.push(key)
    const dispose = callback()
    return dispose
  })
  const register = vi.fn((options: Record<string, unknown>, component: unknown) => {
    registered.push({ options, component })
    return () => {}
  })
  return { inject, register, injectedKeys, registered }
}

/** locale 的最小 stub:记录字典注册,bind 返回键名直译(apply 需要「今天」文案)。 */
function stubLocale() {
  const registered: Array<{ ns: string; dicts: unknown }> = []
  const register = vi.fn((ns: string, dicts: unknown) => {
    registered.push({ ns, dicts })
    return () => {}
  })
  const bind = vi.fn(() => (key: string) => key)
  return { register, bind, registered }
}

/** 最小 ctx:theme + configForms stub,供 apply 走完全链。 */
function makeCtx(
  overrideTokens = vi.fn(() => vi.fn()),
  settings?: QQSkinSettings,
) {
  const ctx = new Context()
  ctx.provide('theme', { overrideTokens } as unknown as ThemeRuntime)
  const host = stubConfigForm(settings)
  ctx.provide('configForms', { get: () => host.form } as never)
  const slots = stubSlots()
  ctx.provide('slots', { inject: slots.inject, register: slots.register } as never)
  const locale = stubLocale()
  ctx.provide('locale', { register: locale.register, bind: locale.bind } as never)
  return { ctx, overrideTokens, host, slots, locale }
}

/** stub <style> 注入用的最小 document。 */
function stubDocument() {
  const nodes: Array<{ dataset: Record<string, string>; textContent: string; remove: ReturnType<typeof vi.fn> }> = []
  vi.stubGlobal('document', {
    head: { appendChild: vi.fn((el: (typeof nodes)[number]) => { nodes.push(el) }) },
    createElement: vi.fn(() => ({ dataset: {}, textContent: '', remove: vi.fn() })),
  })
  return nodes
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('dsh-qq-skin client apply', () => {
  it('declares theme plus settings-collaboration services', () => {
    // 插件页配置卡片需要 slots(注册条目)与 locale(卡片文案)。
    expect(inject).toEqual(['theme', 'remote', 'configForms', 'slots', 'locale'])
  })

  it('registers the plugin page config card through plugins.row.config', () => {
    // 配置卡片:keyed 槽位,key = `<package name>#<row id>`,并挂自有字典。
    const overrideTokens = vi.fn(() => vi.fn())
    const { ctx, slots, locale } = makeCtx(overrideTokens)

    apply(ctx as never)

    expect(slots.injectedKeys).toEqual(['plugins.row.config'])
    expect(slots.registered).toHaveLength(1)
    const entry = slots.registered[0].options
    expect(entry.name).toBe('plugins.row.config')
    expect(entry.key).toBe(QQ_SKIN_CONFIG_ROW_KEY)
    expect(entry.key).toBe('dsh-qq-skin#qq-skin')
    expect(entry.locale).toBe(QQ_SKIN_PLUGIN_NS)
    // 注册进槽位的就是卡片组件本身(不是包了一层的中转组件)。
    expect(slots.registered[0].component).toBe(QQSkinPluginCard)
    // 卡片组件与字典同轮注册:字典键为插件页命名空间,ZH 文案可读。
    expect(locale.registered).toHaveLength(1)
    expect(locale.registered[0].ns).toBe(QQ_SKIN_PLUGIN_NS)
    expect(zh['card.summary']).toContain('QQ')
    // typed register 保证键集一致;这里钉住数量,防止增删键时漏改字典。
    expect(Object.keys(zh)).toHaveLength(43)
    expect(Object.keys(en)).toHaveLength(43)
  })

  it('stacks the QQ override layer on activation with the default palette', () => {
    const overrideTokens = vi.fn(() => vi.fn())
    const { ctx } = makeCtx(overrideTokens)

    apply(ctx as never)

    expect(overrideTokens).toHaveBeenCalledTimes(1)
    expect(overrideTokens).toHaveBeenCalledWith(QQ_SKIN_SOURCE, buildTokenOverrides('classic'))
  })

  it('selects the palette from the settings section on activation', () => {
    const overrideTokens = vi.fn(() => vi.fn())
    const { ctx } = makeCtx(overrideTokens, { palette: 'vivid' })

    apply(ctx as never)

    expect(overrideTokens).toHaveBeenLastCalledWith(QQ_SKIN_SOURCE, buildTokenOverrides('vivid'))
  })

  it('falls back to defaults for unknown settings values', () => {
    const overrideTokens = vi.fn(() => vi.fn())
    const { ctx } = makeCtx(overrideTokens, { palette: 'neon' as never, chatMaxWidth: -1 })

    apply(ctx as never)

    expect(overrideTokens).toHaveBeenLastCalledWith(QQ_SKIN_SOURCE, buildTokenOverrides('classic'))
  })

  it('reads the namespace owned by the profile entry', () => {
    const get = vi.fn(() => stubConfigForm().form)
    const ctx = new Context()
    ctx.provide('theme', { overrideTokens: vi.fn(() => vi.fn()) } as unknown as ThemeRuntime)
    ctx.provide('configForms', { get } as never)
    ctx.provide('slots', { inject: vi.fn(), register: vi.fn() } as never)
    ctx.provide('locale', { register: vi.fn(), bind: vi.fn(() => (key: string) => key) } as never)

    apply(ctx as never)

    expect(get).toHaveBeenCalledWith(QQ_SKIN_SETTINGS_NS)
    expect(QQ_SKIN_SETTINGS_NS).toBe('qq-skin')
  })

  it('hot-updates both layers in place when the settings section changes', () => {
    const nodes = stubDocument()
    const overrideTokens = vi.fn(() => vi.fn())
    const { ctx, host } = makeCtx(overrideTokens)

    apply(ctx as never)

    // 首次:配置未到达 → 出厂默认 classic,单次挂载。
    expect(nodes).toHaveLength(1)

    // 模拟设置持久化:palette → vivid + 宽度调整,订阅者把同一 <style>
    // 原地改写为 vivid(不移除不重建,避免调色时闪回裸题)。
    nodes[0].remove.mockClear()
    host.push({ palette: 'vivid', chatMaxWidth: 720 })

    expect(overrideTokens).toHaveBeenLastCalledWith(QQ_SKIN_SOURCE, buildTokenOverrides('vivid'))
    expect(nodes).toHaveLength(1)
    expect(nodes[0].remove).not.toHaveBeenCalled()
    expect(nodes[0].textContent).toContain('max-width: 720px')
  })

  it('does not remount the layers when the ready snapshot matches the first paint', () => {
    const nodes = stubDocument()
    const overrideTokens = vi.fn(() => vi.fn())
    const { ctx } = makeCtx(overrideTokens, QQ_SKIN_DEFAULT_CONFIG)

    apply(ctx as never)

    expect(nodes).toHaveLength(1)
    expect(overrideTokens).toHaveBeenCalledTimes(1)
  })

  it('writes settings fields back through the config form', () => {
    // 插件页配置卡片是唯一写入口:宿主把整节快照推过来,adopt 合并
    // (settingsToConfig)后驱动两层——token 层换色板,布局层换宽度。
    const nodes = stubDocument()
    const overrideTokens = vi.fn(() => vi.fn())
    const { ctx, host } = makeCtx(overrideTokens)

    apply(ctx as never)
    host.push({ palette: 'green', chatMaxWidth: 640, avatarSize: 32 })

    expect(overrideTokens).toHaveBeenLastCalledWith(QQ_SKIN_SOURCE, buildTokenOverrides('green'))
    expect(nodes[0].textContent).toContain('max-width: 640px')
  })

  it('adopts plugin-page config edits by rebuilding the token layer', () => {
    // 插件页是唯一配置入口:表单变更(快照更新)必须热更新两层。
    const overrideTokens = vi.fn(() => vi.fn())
    const { ctx, host } = makeCtx(overrideTokens)

    apply(ctx as never)
    host.push({ palette: 'qqblue', chatMaxWidth: 940, frostedGlass: true })

    expect(overrideTokens).toHaveBeenLastCalledWith(QQ_SKIN_SOURCE, buildTokenOverrides('qqblue'))
  })

  it('removes the layer through the effect cleanup on dispose', async () => {
    const dispose = vi.fn()
    const overrideTokens = vi.fn(() => dispose)
    const { ctx } = makeCtx(overrideTokens)

    apply(ctx as never)
    expect(dispose).not.toHaveBeenCalled()

    await ctx.fiber.dispose()

    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('leaves the theme preference untouched', async () => {
    const dispose = vi.fn()
    const overrideTokens = vi.fn(() => dispose)
    const setTheme = vi.fn()
    const ctx = new Context()
    ctx.provide('theme', { overrideTokens, setTheme } as unknown as ThemeRuntime)
    ctx.provide('configForms', { get: () => stubConfigForm().form } as never)
    ctx.provide('slots', { inject: vi.fn(), register: vi.fn() } as never)
    ctx.provide('locale', { register: vi.fn(), bind: vi.fn(() => (key: string) => key) } as never)

    apply(ctx as never)
    await ctx.fiber.dispose()

    expect(setTheme).not.toHaveBeenCalled()
  })

  it('mounts the layout stylesheet alongside the token layer', () => {
    const nodes = stubDocument()
    const overrideTokens = vi.fn(() => vi.fn())
    const { ctx } = makeCtx(overrideTokens)

    apply(ctx as never)

    expect(nodes).toHaveLength(1)
    expect(nodes[0].dataset.plugin).toBe(QQ_LAYOUT_PLUGIN)
  })

  it('keeps the local-image picker copy in both dictionaries', () => {
    // 本地图片支持:选择/清除/错误文案双语齐全(typed register 已保证键集,
    // 这里钉住可读性与键名,防止后续重命名悄悄破坏卡片)。
    expect(zh['card.pickImage']).toContain('本地图片')
    expect(zh['card.imageClear']).toContain('企鹅')
    expect(zh['card.imageError']).toContain('图片')
    expect(zh['card.imageSet']).toContain('保存')
  })
})
