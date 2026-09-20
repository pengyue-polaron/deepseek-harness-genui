import type { Context } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { DESIGN_SETTINGS_NAMESPACE } from '../settings-namespace.ts'

const DesignSettingsMarker = z.object({})

/**
 * Advertise the design card to keyed-slot settings hosts.
 *
 * DSH 0.1.0-rc.7+ renders `settings.plugin.item` only for namespaces returned
 * by the Host settings service. Design data itself remains owned by DesignStore
 * and the capability-scoped management endpoint; this empty namespace is the
 * composition marker that makes the custom card eligible for dispatch. The
 * injection stays optional so older compositions without a settings provider
 * continue to load and use the legacy list slot.
 */
export function registerDesignSettingsNamespace(ctx: Context) {
  return ctx.inject(['settings'], settingsCtx => {
    settingsCtx.settings.register(
      // This fixed kebab-case namespace is valid on both old branded-string
      // APIs and newer hosts that validate strings directly in register().
      DESIGN_SETTINGS_NAMESPACE as SettingsNamespace,
      DesignSettingsMarker,
    )
  })
}
