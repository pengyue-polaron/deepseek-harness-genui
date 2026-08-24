import { Context } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import { describe, expect, it } from 'vitest'
import { registerDesignSettingsNamespace } from '../src/runtime/settings-namespace.ts'
import { DESIGN_SETTINGS_NAMESPACE } from '../src/settings-namespace.ts'

class MemorySettingsProvider extends SettingsProvider {
  readonly writable = true

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve({})
  }

  protected persist(): Promise<void> {
    return Promise.resolve()
  }
}

describe('design settings namespace', () => {
  it('advertises the namespace used by the keyed client slot', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettingsProvider)
    try {
      await registerDesignSettingsNamespace(ctx)

      expect(ctx.settings.describe()).toEqual([
        expect.objectContaining({
          ns: DESIGN_SETTINGS_NAMESPACE,
          value: {},
        }),
      ])
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
