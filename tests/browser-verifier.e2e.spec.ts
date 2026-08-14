import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ArtifactRegistry } from '../src/artifacts/registry.ts'
import { buildArtifact } from '../src/artifacts/builder.ts'
import { verifyArtifactInBrowser } from '../src/artifacts/browser-verifier.ts'
import { CapabilityStore } from '../src/runtime/capabilities.ts'
import { createHttpRuntime } from '../src/runtime/server.ts'

describe('sandboxed browser verification', () => {
  let ctx: Context
  let root: string
  let registry: ArtifactRegistry
  let capabilities: CapabilityStore
  let fakeAgent: Agent
  let origin: string
  let previewUrl: string
  let closeServer: () => Promise<void>

  beforeAll(async () => {
    ctx = new Context()
    await ctx.plugin(ToolRuntime)
    root = await mkdtemp(join(tmpdir(), 'dsh-genui-browser-'))
    registry = new ArtifactRegistry(root, 128 * 1024)
    await registry.init()
    const version = await registry.create({
      id: 'sandbox-state',
      title: 'Sandbox state',
      summary: 'Exercise the SDK through an opaque-origin iframe.',
      requirements: ['Persist state from the isolated preview'],
      capabilities: [],
      files: [
        {
          path: 'src/main.tsx',
          content: `import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { useArtifactState } from '@dsh-genui/sdk'
function App() {
  const [count, setCount, status] = useArtifactState('count', 7)
  useEffect(() => { if (status.ready && count === 7) setCount(8) }, [status.ready, count, setCount])
  return <main style={{width:'100%',maxWidth:600}}>{status.error ? status.error.message : 'count:' + count}</main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
        },
      ],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })

    capabilities = new CapabilityStore()
    fakeAgent = { id: SessionId('browser-e2e'), ctx } as unknown as Agent
    const token = capabilities.issue(version.artifactId, fakeAgent)
    const runtime = createHttpRuntime(ctx, registry, capabilities, '/genui')
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
    origin = `http://127.0.0.1:${address.port}`
    previewUrl = `${origin}/genui/preview/${version.artifactId}/${version.id}?lang=en#token=${token}`
    closeServer = () => new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
  }, 60_000)

  afterAll(async () => {
    await closeServer?.()
    await ctx?.fiber.dispose()
    if (root !== undefined) await rm(root, { recursive: true, force: true })
  })

  it('mounts desktop/mobile and persists SDK state from an opaque-origin iframe', async () => {
    const result = await verifyArtifactInBrowser(previewUrl)
    expect(result).toMatchObject({ ok: true, diagnostics: [] })
    await expect.poll(async () => (await registry.readState('sandbox-state', 'browser-e2e'))?.values.count).toBe(8)
    expect(result.notes).toEqual([
      'light desktop mounted at 1280px without horizontal overflow',
      'dark desktop mounted at 1280px without horizontal overflow',
      'reduced-motion desktop mounted at 1280px without horizontal overflow',
      'mobile mounted at 390px without horizontal overflow',
    ])
  }, 60_000)

  it('rejects visible controls without names and images without alt text', async () => {
    const version = await registry.create({
      id: 'accessibility-failure',
      title: 'Accessibility failure',
      summary: 'Browser gate fixture.',
      requirements: [],
      capabilities: [],
      files: [{
        path: 'src/main.tsx',
        content: `import React from 'react'
import { createRoot } from 'react-dom/client'
function App() { return <main><button /><img width="16" height="16" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" /></main> }
createRoot(document.getElementById('root')!).render(<App />)`,
      }],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const token = capabilities.issue(version.artifactId, fakeAgent)
    const result = await verifyArtifactInBrowser(`${origin}/genui/preview/${version.artifactId}/${version.id}?lang=en#token=${token}`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map(item => item.text)).toEqual(expect.arrayContaining([
      expect.stringContaining('visible interactive control has no accessible name: button'),
      expect.stringContaining('visible image is missing alt text: img'),
    ]))
  }, 60_000)
})
