import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { chromium } from 'playwright'
import { ArtifactRegistry } from '../src/artifacts/registry.ts'
import { buildArtifact } from '../src/artifacts/builder.ts'
import { verifyArtifactInBrowser } from '../src/artifacts/browser-verifier.ts'
import { DesignStore } from '../src/designs/store.ts'
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
  let appUrl: string
  let closeServer: () => Promise<void>

  beforeAll(async () => {
    ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    ctx.tools.register(defineTool({
      name: 'test_echo',
      description: 'Echo a test message.',
      parameters: { message: { type: 'string', required: true } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { echoed: { type: 'string', required: true } } },
        render: (_args, value) => [{ type: 'text', text: value.echoed }],
      },
      async execute(args) { return { echoed: args.message } },
    }))
    root = await mkdtemp(join(tmpdir(), 'dsh-genui-browser-'))
    registry = new ArtifactRegistry(root, 128 * 1024)
    await registry.init()
    const designs = new DesignStore(join(root, '.designs'))
    await designs.init()
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
    origin = `http://127.0.0.1:${address.port}`
    previewUrl = `${origin}/genui/preview/${version.artifactId}/${version.id}?lang=en#token=${token}`
    appUrl = `${origin}/genui/app/${version.artifactId}?lang=en#token=${token}`
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

  it('runs the current app at a stable local URL and persists its state', async () => {
    await registry.updateState('sandbox-state', 'browser-e2e', state => ({ ...state, count: 7 }))
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      await page.goto(appUrl)
      await page.frameLocator('#app').locator('#root > *').first().waitFor({ state: 'visible', timeout: 10_000 })
      expect(await page.locator('#error').isHidden()).toBe(true)
      await expect.poll(async () => (await registry.readState('sandbox-state', 'browser-e2e'))?.values.count).toBe(8)
      expect(page.url()).toBe(appUrl)
    } finally {
      await browser.close()
    }
  }, 30_000)

  it('asks for permission before a stable local app calls a connected tool', async () => {
    const version = await registry.create({
      id: 'standalone-permission',
      title: 'Connected explanation',
      summary: 'Exercise the standalone permission host.',
      requirements: ['Ask before using the connected action'],
      capabilities: [{
        id: 'echo-message', kind: 'tool', label: 'Read the explanation',
        reason: 'Load the selected explanation from the connected source.', access: 'read', tool: 'test_echo',
      }, {
        id: 'public-service', kind: 'external', label: 'Check the public service',
        reason: 'Read the latest public status when you ask.', access: 'read',
        urlPrefix: 'https://api.example.com/v1/', methods: ['GET'],
      }],
      files: [{
        path: 'src/main.tsx',
        content: `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { callTool, requestExternal } from '@dsh-genui/sdk'
function App() {
  const [answer, setAnswer] = useState('Waiting')
  return <main><button onClick={async () => {
    const value = await callTool('test_echo', { message: 'Connected' }) as { echoed: string }
    setAnswer(value.echoed)
  }}>Load explanation</button><button onClick={() => {
    void requestExternal('https://api.example.com/v1/status').catch(() => undefined)
  }}>Check service</button><p>{answer}</p></main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
      }],
    })
    expect((await buildArtifact(version, registry.distPath(version.artifactId, version.id))).ok).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const token = capabilities.issue(version.artifactId, fakeAgent)
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.goto(`${origin}/genui/app/${version.artifactId}?lang=en#token=${token}`)
      const app = page.frameLocator('#app')
      await app.getByRole('button', { name: 'Load explanation' }).click()
      await page.getByRole('heading', { name: 'Read the explanation' }).waitFor({ state: 'visible' })
      await page.getByText('Load the selected explanation from the connected source.').waitFor({ state: 'visible' })
      await page.getByText('Read information', { exact: true }).waitFor({ state: 'visible' })
      await page.getByText('Once allowed, this app can keep using this capability during the current task.').waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Allow for this task' }).click()
      await app.getByText('Connected').waitFor({ state: 'visible' })

      await app.getByRole('button', { name: 'Check service' }).click()
      await page.getByRole('heading', { name: 'Check the public service' }).waitFor({ state: 'visible' })
      await page.getByText('Connect to api.example.com', { exact: true }).waitFor({ state: 'visible' })
      await page.getByText('Allowed requests GET', { exact: true }).waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Not now' }).click()
    } finally {
      await browser.close()
    }
  }, 30_000)

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
