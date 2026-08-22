import { NS } from './locales.ts'

/**
 * Registration contract for the `settings.plugin.item` slot.
 *
 * This slot changed kind across DSH host generations:
 * - `0.1.0-rc.6` and earlier declare it as a *list* slot → registration
 *   requires `id` (order/label drive list display);
 * - newer hosts (0.1.0-rc.7+ / the 0.1.1 rc train) declare it as a *keyed*
 *   slot → registration requires `key`, and passing only `id` aborts plugin
 *   startup with `keyed slot "settings.plugin.item" requires options.key`
 *   (see https://github.com/pengyue-polaron/deepseek-harness-genui/issues/4).
 *
 * The DSH slot store accepts both optional `key` and `id` fields and only
 * *requires* the one matching the host's declared kind, so providing both
 * keeps the plugin loadable on every host version. Kept as a pure, exported
 * helper so this contract is unit-testable without booting the client
 * runtime.
 */
export interface SettingsSlotRegistration {
  name: 'settings.plugin.item'
  /** Dispatch key on keyed-slot hosts (0.1.0-rc.7+ / 0.1.1 train). */
  key: string
  /** List cell id on list-slot hosts (0.1.0-rc.6 and earlier). */
  id: string
  order: number
  locale: typeof NS
}

export function settingsSlotRegistration(): SettingsSlotRegistration {
  return {
    name: 'settings.plugin.item',
    key: 'genui-design',
    id: 'genui-design',
    order: 30,
    locale: NS,
  }
}
