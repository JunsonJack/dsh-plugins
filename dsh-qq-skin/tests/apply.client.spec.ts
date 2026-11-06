import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { apply, inject, QQ_SKIN_SETTINGS_NS } from '../src/client/index.ts'
import { QQ_LAYOUT_PLUGIN } from '../src/client/qq-layout.ts'
import { QQ_SKIN_SOURCE, buildTokenOverrides } from '../src/client/qq-tokens.ts'
import { QQ_SKIN_DEFAULT_CONFIG } from '../src/client/config.ts'
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

/** 最小 ctx:theme + configForms + slots + locale stub,供 apply 走完全链。 */
function makeCtx(
  overrideTokens = vi.fn(() => vi.fn()),
  settings?: QQSkinSettings,
) {
  const ctx = new Context()
  ctx.provide('theme', { overrideTokens } as unknown as ThemeRuntime)
  const host = stubConfigForm(settings)
  ctx.provide('configForms', { get: () => host.form } as never)
  ctx.provide('slots', { inject: () => {}, register: () => () => {} } as never)
  ctx.provide('locale', { register: () => () => {} } as never)
  return { ctx, overrideTokens, host }
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
    expect(inject).toEqual(['theme', 'slots', 'locale', 'remote', 'configForms'])
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
    ctx.provide('slots', { inject: () => {}, register: () => () => {} } as never)
    ctx.provide('locale', { register: () => () => {} } as never)

    apply(ctx as never)

    expect(get).toHaveBeenCalledWith(QQ_SKIN_SETTINGS_NS)
    expect(QQ_SKIN_SETTINGS_NS).toBe('qq-skin')
  })

  it('hot-updates both layers when the settings section changes', () => {
    const nodes = stubDocument()
    const overrideTokens = vi.fn(() => vi.fn())
    const { ctx, host } = makeCtx(overrideTokens)

    apply(ctx as never)

    // 首次:配置未到达 → 出厂默认 classic,单次挂载。
    expect(nodes).toHaveLength(1)

    // 模拟设置持久化:palette → vivid,订阅者把旧的 <style> 重建为 vivid。
    nodes[0].remove.mockClear()
    host.push({ palette: 'vivid' })

    expect(overrideTokens).toHaveBeenLastCalledWith(QQ_SKIN_SOURCE, buildTokenOverrides('vivid'))
    expect(nodes).toHaveLength(2)
    expect(nodes[0].remove).toHaveBeenCalledTimes(1)
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
    const host = stubConfigForm()
    let injected: Record<string, (value: never) => void> | undefined
    const ctx = new Context()
    ctx.provide('theme', { overrideTokens: vi.fn(() => vi.fn()) } as unknown as ThemeRuntime)
    ctx.provide('configForms', { get: () => host.form } as never)
    ctx.provide('slots', {
      inject: (_: string, thunk: () => () => void) => { thunk() },
      register: (options: { inject: (actions: never) => Record<string, (value: never) => void> }) => {
        injected = options.inject({ sync: vi.fn() } as never)
        return () => {}
      },
    } as never)
    ctx.provide('locale', { register: () => () => {} } as never)

    apply(ctx as never)
    injected!.setPalette!('green' as never)
    injected!.setChatMaxWidth!(640 as never)

    expect(host.written).toEqual([['palette', 'green'], ['chatMaxWidth', 640]])
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
    ctx.provide('slots', { inject: () => {}, register: () => () => {} } as never)
    ctx.provide('locale', { register: () => () => {} } as never)

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

  it('registers the QQ skin settings row entry', () => {
    const register = vi.fn(() => () => {})
    const ctx = new Context()
    ctx.provide('theme', { overrideTokens: vi.fn(() => vi.fn()) } as unknown as ThemeRuntime)
    ctx.provide('configForms', { get: () => stubConfigForm().form } as never)
    ctx.provide('slots', {
      inject: (_: string, thunk: () => () => void) => { thunk() },
      register,
    } as never)
    ctx.provide('locale', { register: () => () => {} } as never)

    apply(ctx as never)

    expect(register).toHaveBeenCalledTimes(1)
    const options = register.mock.calls[0]![0]
    expect(options.id).toBe('qq-skin')
    expect(options.name).toBe('settings.general.item')
  })
})
