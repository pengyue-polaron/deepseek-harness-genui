import { describe, expect, it } from 'vitest'
import { settingsSlotRegistration } from '../src/client/settings-slot.ts'

describe('settings.plugin.item slot registration', () => {
  it('carries the keyed-slot dispatch key for newer hosts', () => {
    expect(settingsSlotRegistration().key).toBe('genui-design')
  })

  it('carries the list-slot cell id for 0.1.0-rc.6 hosts', () => {
    expect(settingsSlotRegistration().id).toBe('genui-design')
  })

  it('targets the settings.plugin.item slot in a stable order and locale', () => {
    const registration = settingsSlotRegistration()
    expect(registration.name).toBe('settings.plugin.item')
    expect(registration.order).toBe(30)
    expect(registration.locale).toBe('genui')
  })
})
