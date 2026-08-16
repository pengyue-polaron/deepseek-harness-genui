import { describe, expect, it } from 'vitest'
import { GENUI_BEHAVIOR_PROMPT, GENUI_SYSTEM_PROMPT, genuiSystemPrompt } from '../src/prompt.ts'

describe('GenUI system prompt', () => {
  it('keeps the product boundary explicit', () => {
    expect(GENUI_SYSTEM_PROMPT).toContain('Use genui_* only when interaction materially improves')
    expect(GENUI_SYSTEM_PROMPT).toContain('Complexity alone is not a reason')
    expect(GENUI_SYSTEM_PROMPT).toContain('In coding, CLI, terminal, or localhost work, always require explicit intent')
    expect(GENUI_SYSTEM_PROMPT).toContain('one focused decision or working surface')
    expect(GENUI_SYSTEM_PROMPT).toContain('Keep explanation in the conversation and put only the interactive part in the app')
    expect(GENUI_SYSTEM_PROMPT).toContain('Use embedded delivery by default')
    expect(GENUI_SYSTEM_PROMPT).toContain('After a successful local-link result')
    expect(GENUI_SYSTEM_PROMPT).toContain('A successful embedded genui_create or genui_update is the final emitted item')
  })

  it('preserves the code, state, capability, design, and evolution contracts', () => {
    expect(GENUI_SYSTEM_PROMPT).toContain('Write normal React + TypeScript, never a component-tree IR')
    expect(GENUI_SYSTEM_PROMPT).toContain('normally use 3–5 files including styles')
    expect(GENUI_SYSTEM_PROMPT).toContain('Never include index.html')
    expect(GENUI_SYSTEM_PROMPT).toContain('genui_state_read must be the first tool call')
    expect(GENUI_SYSTEM_PROMPT).toContain('Treat its values and __result as authoritative')
    expect(GENUI_SYSTEM_PROMPT).toContain('Do not invent venue availability, popularity, prices, travel times, or booking rules')
    expect(GENUI_SYSTEM_PROMPT).toContain('Declare only the exact tool or credential-free HTTPS prefix needed')
    expect(GENUI_SYSTEM_PROMPT).toContain('Use requestExternal only when no matching connected tool exists')
    expect(GENUI_SYSTEM_PROMPT).toContain('Do not fetch the same data before creation and again on open')
    expect(GENUI_SYSTEM_PROMPT).toContain('Repair a failed creation with genui_update, never another genui_create')
    expect(GENUI_SYSTEM_PROMPT).toContain('Pin the exported profile as root DESIGN.md')
    expect(GENUI_SYSTEM_PROMPT).toContain('one control group, one main visual, and one changing takeaway')
    expect(GENUI_SYSTEM_PROMPT).toContain('Use semantic controls, accessible names, visible keyboard focus')
    expect(GENUI_SYSTEM_PROMPT).toContain('without horizontal overflow at 260 CSS pixels')
    expect(GENUI_SYSTEM_PROMPT).toContain('Treat permission denial as a normal recoverable outcome')
    expect(GENUI_SYSTEM_PROMPT).toContain('Never render raw Error messages')
    expect(GENUI_SYSTEM_PROMPT).toContain('mark exactly one main control with data-genui-primary-action')
  })

  it('keeps the prompt compact enough to remain legible to the model', () => {
    expect(GENUI_SYSTEM_PROMPT.length).toBeLessThan(11_000)
    expect(GENUI_SYSTEM_PROMPT.match(/^## /gm)).toHaveLength(1)
    expect(GENUI_SYSTEM_PROMPT).not.toContain('genui_verify')
    expect(GENUI_SYSTEM_PROMPT).not.toContain('subscribeArtifactState')
  })

  it('keeps execution discipline and source budgets near the persona', () => {
    expect(GENUI_BEHAVIOR_PROMPT).toContain('Before any read, search, shell, state-read, inspection, retry, or repair call')
    expect(GENUI_BEHAVIOR_PROMPT).toContain('Visible prose must be final user-facing content')
    expect(GENUI_BEHAVIOR_PROMPT).toContain('at most two discovery calls per connected source, four reads from one source, and six connected reads')
    expect(GENUI_BEHAVIOR_PROMPT).toContain('Prefer a matching connected MCP tool')
    expect(GENUI_BEHAVIOR_PROMPT).toContain('"only", "只用", and "仅根据" create a hard allowlist')
  })

  it('honors a Harness default design without changing the automatic default', () => {
    expect(GENUI_SYSTEM_PROMPT).toContain('silently choose and export the best bundled design')
    const custom = genuiSystemPrompt('home-journal')
    expect(custom).toContain('The Harness default design is home-journal')
    expect(custom).toContain('Silently export and use it for new apps unless the user asks for another direction')
    expect(custom).not.toContain('silently choose and export the best bundled design')
  })
})
