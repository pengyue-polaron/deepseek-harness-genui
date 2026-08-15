import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ArtifactRegistry } from '../src/artifacts/registry.ts'
import { DesignStore } from '../src/designs/store.ts'
import { CapabilityStore } from '../src/runtime/capabilities.ts'
import { createHttpRuntime } from '../src/runtime/server.ts'
import { registerGenuiTools } from '../src/tools.ts'

describe('GenUI Harness tool lifecycle', () => {
  let ctx: Context
  let root: string
  let registry: ArtifactRegistry
  let agent: Agent
  let closeServer: () => Promise<void>
  let callCounter = 0
  let lastRenderedContent: unknown
  let lastConcludesTurn: true | undefined

  beforeAll(async () => {
    ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    root = await mkdtemp(join(tmpdir(), 'dsh-genui-tools-'))
    registry = new ArtifactRegistry(root, 128 * 1024)
    await registry.init()
    const designs = new DesignStore(join(root, '.designs'))
    await designs.init()
    agent = { id: SessionId('genui-tools-e2e'), ctx } as unknown as Agent

    const capabilities = new CapabilityStore()
    const runtime = createHttpRuntime(ctx, registry, designs, capabilities, '/genui')
    const server = createServer((req, res) => {
      runtime.handler(req, res).catch((error: unknown) => {
        res.writeHead(500)
        res.end(error instanceof Error ? error.message : String(error))
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('test HTTP server did not bind a TCP port')
    registerGenuiTools(ctx, registry, designs, capabilities, '/genui', `http://127.0.0.1:${address.port}`)
    closeServer = () => new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
  }, 60_000)

  afterAll(async () => {
    await closeServer?.()
    await ctx?.fiber.dispose()
    if (root !== undefined) await rm(root, { recursive: true, force: true })
  })

  async function execute(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await ctx.tools.execute({
      callId: CallId(`genui-e2e-${++callCounter}`),
      name,
      arguments: args,
      agent,
      signal: AbortSignal.timeout(30_000),
    })
    if (result.isError) throw result.error
    lastRenderedContent = result.content
    lastConcludesTurn = result.concludesTurn
    return result.value as Record<string, unknown>
  }

  it('repairs an initial failure, updates, inspects, and rolls back', async () => {
    const created = await execute('genui_create', {
      artifact_id: 'tool-flow',
      title: 'Tool flow',
      delivery: 'embedded',
      language: 'en',
      summary: 'Intentionally broken initial candidate.',
      requirements: ['Show the current status'],
      capabilities: [],
      files: [{ path: 'src/main.tsx', content: 'const broken =' }],
    })
    expect(created).toMatchObject({ status: 'failed' })
    expect(created.artifact_id).toMatch(/^s-[a-f0-9]{12}-tool-flow$/)
    expect(lastConcludesTurn).toBeUndefined()
    expect(created.message).toContain('using this failed version as the base')
    expect(lastRenderedContent).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: expect.stringContaining('Do not call genui_create again') }),
    ]))

    const repaired = await execute('genui_update', {
      artifact_id: 'tool-flow',
      delivery: 'embedded',
      language: 'en',
      base_version_id: created.version_id,
      summary: 'Repair the initial source.',
      patches: [{
        path: 'src/main.tsx',
        content: `import React from 'react'
import { createRoot } from 'react-dom/client'
function App() { return <main style={{padding: 24}}>Status: ready</main> }
createRoot(document.getElementById('root')!).render(<App />)`,
      }],
    })
    expect(repaired).toMatchObject({ artifact_id: created.artifact_id, status: 'ready' })
    expect(lastConcludesTurn).toBe(true)
    expect(lastRenderedContent).toEqual([{
      type: 'text',
      text: 'This successful result must be the last emitted item. Emit no text and run no tools after it.',
    }])

    await registry.updateState(created.artifact_id as string, String(agent.id), state => ({ ...state, feedback: { choice: 'quiet route' } }))
    const submitted = await execute('genui_state_read', { artifact_id: 'tool-flow' })
    expect(submitted).toMatchObject({ artifact_id: created.artifact_id, values: { feedback: { choice: 'quiet route' } } })

    const updated = await execute('genui_update', {
      artifact_id: 'tool-flow',
      delivery: 'local-link',
      language: 'en',
      base_version_id: repaired.version_id,
      summary: 'Add an interactive counter.',
      add_requirements: ['Increment a visible counter'],
      patches: [{
        path: 'src/main.tsx',
        content: `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
function App() {
  const [count, setCount] = useState(0)
  return <main style={{padding: 24}}>Status: ready <button onClick={() => setCount(value => value + 1)}>Count {count}</button></main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
      }],
    })
    expect(updated).toMatchObject({ artifact_id: created.artifact_id, status: 'ready' })
    expect(lastConcludesTurn).toBeUndefined()
    expect(updated.app_url).toBe(repaired.app_url)
    expect(lastRenderedContent).toEqual([{
      type: 'text',
      text: `Tool flow\n${String(updated.app_url)}`,
    }])
    expect(String(updated.app_url)).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/genui\/app\/s-[a-f0-9]{12}-tool-flow\?lang=en#token=/)

    const stableDocument = await fetch(String(updated.app_url)).then(response => response.text())
    expect(stableDocument).toContain(`data-version-id="${String(updated.version_id)}"`)
    expect(stableDocument).toContain('<meta name="theme-color" media="(prefers-color-scheme: light)" content="#faf9f6">')
    expect(stableDocument).toContain('<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#171717">')
    expect(stableDocument).not.toContain(new URL(String(updated.app_url)).hash.slice(1))

    const rejected = await execute('genui_update', {
      artifact_id: 'tool-flow',
      delivery: 'local-link',
      language: 'en',
      base_version_id: updated.version_id,
      summary: 'Reject a broken candidate.',
      patches: [{ path: 'src/main.tsx', content: 'const broken =' }],
    })
    expect(rejected.status).toBe('failed')
    expect((await registry.get(created.artifact_id as string)).currentVersionId).toBe(updated.version_id)
    expect(await fetch(String(updated.app_url)).then(response => response.text()))
      .toContain(`data-version-id="${String(updated.version_id)}"`)

    const inspected = await execute('genui_inspect', {
      artifact_id: 'tool-flow',
      version_id: updated.version_id,
    })
    expect(inspected.version).toMatchObject({ id: updated.version_id, status: 'ready' })
    expect((inspected.version as { requirements: Array<{ text: string }> }).requirements.map(item => item.text))
      .toEqual(['Show the current status', 'Increment a visible counter'])

    const rolledBack = await execute('genui_rollback', {
      artifact_id: 'tool-flow',
      version_id: repaired.version_id,
      delivery: 'embedded',
      language: 'en',
    })
    expect(rolledBack).toMatchObject({ version_id: repaired.version_id, status: 'ready' })
    expect((await registry.get(created.artifact_id as string)).currentVersionId).toBe(repaired.version_id)
  }, 60_000)

  it('lists, imports, and exports DESIGN.md profiles', async () => {
    const listed = await execute('genui_design_list', {})
    expect(listed.designs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'editorial-workbench' }),
      expect.objectContaining({ id: 'field-atlas' }),
      expect.objectContaining({ id: 'kinetic-signal' }),
      expect.objectContaining({ id: 'ledger-grid' }),
    ]))

    await execute('genui_design_import', {
      design_id: 'home-journal',
      content: '# Home Journal\n\nUse warm paper surfaces and compact handwritten notes.\n',
    })
    const exported = await execute('genui_design_export', { design_id: 'home-journal' })
    expect(exported).toMatchObject({ design_id: 'home-journal', filename: 'DESIGN.md' })
    expect(exported.content).toContain('warm paper surfaces')
  })

  it('scopes repeated artifact names to their task', async () => {
    const source = `import React from 'react'
import { createRoot } from 'react-dom/client'
createRoot(document.getElementById('root')!).render(<main>Ready</main>)`
    agent = { id: SessionId('first-task'), ctx } as unknown as Agent
    const first = await execute('genui_create', {
      artifact_id: 'repeated-name', title: 'First', delivery: 'embedded', language: 'en', summary: 'First task', requirements: [], capabilities: [],
      files: [{ path: 'src/main.tsx', content: source }],
    })
    agent = { id: SessionId('second-task'), ctx } as unknown as Agent
    const second = await execute('genui_create', {
      artifact_id: 'repeated-name', title: 'Second', delivery: 'embedded', language: 'en', summary: 'Second task', requirements: [], capabilities: [],
      files: [{ path: 'src/main.tsx', content: source }],
    })
    expect(first.artifact_id).not.toBe(second.artifact_id)
    expect(first.artifact_id).toMatch(/^s-[a-f0-9]{12}-repeated-name$/)
    expect(second.artifact_id).toMatch(/^s-[a-f0-9]{12}-repeated-name$/)
  }, 60_000)
})
