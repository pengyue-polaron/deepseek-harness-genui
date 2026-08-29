import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import {
  ArtifactRegistry as LegacyArtifactRegistry,
  buildArtifact as buildLegacyArtifact,
} from 'dsh-plugin-genui-v0132'
import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'
import { ArtifactRegistry } from '../src/artifacts/registry.ts'
import { DesignStore } from '../src/designs/store.ts'
import { artifactSessionPrefix, CapabilityStore } from '../src/runtime/capabilities.ts'
import { createHttpRuntime } from '../src/runtime/server.ts'

const sha256 = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex')

describe('v0.13.2 generated-app bridge compatibility', () => {
  it('runs an unchanged legacy bundle through the tokenless child bridge and preserves state across reloads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-genui-legacy-bridge-'))
    const sessionId = 'legacy-bridge-session'
    const artifactId = `${artifactSessionPrefix(sessionId)}legacy-journey`
    const ctx = new Context()
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
    let closeServer: (() => Promise<void>) | undefined

    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)

      const legacyRegistry = new LegacyArtifactRegistry(root, 128 * 1024)
      await legacyRegistry.init()
      const candidate = await legacyRegistry.create({
        id: artifactId,
        title: 'Legacy journey',
        summary: 'Exercise the exact v0.13.2 SDK after upgrading the runtime.',
        requirements: ['Restore a saved route and passenger count, then save a new route.'],
        capabilities: [],
        files: [{
          path: 'src/main.tsx',
          content: `import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useArtifactState } from '@dsh-genui/sdk'
function App() {
  const [route, setRoute, routeState] = useArtifactState('route', 'direct')
  const [passengers, , passengerState] = useArtifactState('passengers', 1)
  const [policy, setPolicy] = useState('pending')
  useEffect(() => {
    const bridge = (globalThis as any).__dshGenuiBridge
    Promise.all([
      bridge.request('permission/grant', { capability_id: 'unexpected' }).then(() => 'unexpected', () => 'rejected'),
      bridge.request('state/write', { key: 'bridge-policy', value: 'bound', version_id: 'stale-version' }),
    ]).then(([forbidden, allowed]) => setPolicy(forbidden + '/' + allowed.status))
  }, [])
  if (!routeState.ready || !passengerState.ready) return <main>Restoring legacy journey…</main>
  return <main><button data-genui-primary-action onClick={() => setRoute('coastal')}>Route: {route} · Passengers: {passengers}</button><p>Policy: {policy}</p></main>
}
createRoot(document.getElementById('root')!).render(<App />)`,
        }],
      })
      const built = await buildLegacyArtifact(candidate, legacyRegistry.distPath(artifactId, candidate.id))
      expect(built.ok, JSON.stringify(built.diagnostics)).toBe(true)
      const version = await legacyRegistry.settle(artifactId, candidate.id, {
        checkedAt: new Date().toISOString(),
        build: 'passed',
        browser: 'passed',
        diagnostics: [],
        notes: ['real dsh-plugin-genui@0.13.2 compatibility fixture'],
      })
      await legacyRegistry.updateState(artifactId, sessionId, () => ({
        route: 'scenic',
        passengers: 3,
        nested: { seats: ['A1', 'A2'] },
      }))

      const appPath = join(legacyRegistry.distPath(artifactId, version.id), 'app.js')
      const mapPath = join(legacyRegistry.distPath(artifactId, version.id), 'app.js.map')
      const legacyAppBytes = await readFile(appPath)
      const legacyMapBytes = await readFile(mapPath)
      const legacyAppHash = sha256(legacyAppBytes)
      const legacyMapHash = sha256(legacyMapBytes)

      const registry = new ArtifactRegistry(root, 128 * 1024)
      await registry.init()
      const designs = new DesignStore(join(root, '.designs'))
      await designs.init()
      const capabilities = new CapabilityStore()
      const fakeAgent = { id: SessionId(sessionId), ctx } as unknown as Agent
      const realToken = capabilities.issue(artifactId, fakeAgent)
      const runtime = createHttpRuntime(ctx, registry, designs, capabilities, '/genui')
      const stateRequests: Array<{
        mainFrame: boolean
        headers: Promise<Record<string, string>>
      }> = []
      const hostControlRequests: string[] = []
      const policyWriteVersions: string[] = []
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
      closeServer = () => new Promise<void>((resolve, reject) => {
        server.close(error => error === undefined ? resolve() : reject(error))
      })
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('legacy bridge server did not bind a TCP port')
      const origin = `http://127.0.0.1:${address.port}`

      browser = await chromium.launch({ headless: true })
      const page = await browser.newPage()
      page.on('request', request => {
        const pathname = new URL(request.url()).pathname
        if (pathname.endsWith('/permission/grant')) hostControlRequests.push(pathname)
        if (!pathname.endsWith('/state/read') && !pathname.endsWith('/state/write')) return
        if (pathname.endsWith('/state/write')) {
          const body = request.postDataJSON() as Record<string, unknown> | null
          if (body?.key === 'bridge-policy') policyWriteVersions.push(String(body.version_id))
        }
        stateRequests.push({
          mainFrame: request.frame() === page.mainFrame(),
          headers: request.allHeaders(),
        })
      })

      await page.goto(`${origin}/genui/app/${artifactId}?lang=en#token=${encodeURIComponent(realToken)}`)
      const app = page.frameLocator('#app')
      await app.getByRole('button', { name: 'Route: scenic · Passengers: 3' }).waitFor({ state: 'visible' })
      await app.getByText('Policy: rejected/200', { exact: true }).waitFor({ state: 'visible' })

      const previewFrame = page.frames().find(frame => {
        try {
          return new URL(frame.url()).pathname === `/genui/preview/${artifactId}/${version.id}`
        } catch {
          return false
        }
      })
      expect(previewFrame).toBeDefined()
      const childUrl = new URL(previewFrame!.url())
      const childFragment = new URLSearchParams(childUrl.hash.slice(1))
      expect(childFragment.get('token')).toBe('bridge-v1')
      expect(childFragment.get('bridge_nonce')).toMatch(/^[0-9a-f-]{36}$/i)
      expect(previewFrame!.url()).not.toContain(realToken)

      await app.getByRole('button', { name: 'Route: scenic · Passengers: 3' }).click()
      await app.getByRole('button', { name: 'Route: coastal · Passengers: 3' }).waitFor({ state: 'visible' })
      await expect.poll(async () => (await registry.readState(artifactId, sessionId))?.values.route).toBe('coastal')

      await page.reload()
      await app.getByRole('button', { name: 'Route: coastal · Passengers: 3' }).waitFor({ state: 'visible' })
      await app.getByText('Policy: rejected/200', { exact: true }).waitFor({ state: 'visible' })
      await expect.poll(() => stateRequests.length).toBeGreaterThanOrEqual(5)
      expect(hostControlRequests).toEqual([])
      expect(policyWriteVersions.length).toBeGreaterThanOrEqual(2)
      expect(policyWriteVersions.every(observed => observed === version.id)).toBe(true)
      await expect.poll(async () => (await registry.readState(artifactId, sessionId))?.values['bridge-policy']).toBe('bound')
      expect(stateRequests.every(request => request.mainFrame)).toBe(true)
      const observedHeaders = await Promise.all(stateRequests.map(request => request.headers))
      expect(observedHeaders.every(headers => headers.authorization === `Bearer ${realToken}`)).toBe(true)
      expect(observedHeaders.every(headers => headers.authorization !== 'Bearer bridge-v1')).toBe(true)

      const servedApp = await fetch(`${origin}/genui/assets/${artifactId}/${version.id}/app.js`)
      const servedMap = await fetch(`${origin}/genui/assets/${artifactId}/${version.id}/app.js.map`)
      expect(servedApp.ok).toBe(true)
      expect(servedMap.ok).toBe(true)
      expect(sha256(new Uint8Array(await servedApp.arrayBuffer()))).toBe(legacyAppHash)
      expect(sha256(new Uint8Array(await servedMap.arrayBuffer()))).toBe(legacyMapHash)
      expect(sha256(await readFile(appPath))).toBe(legacyAppHash)
      expect(sha256(await readFile(mapPath))).toBe(legacyMapHash)

      const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
        dependencies?: Record<string, string>
      }
      expect(Object.keys(manifest.dependencies ?? {}).join('\n')).not.toMatch(/playwright|puppeteer|chromium|chromedriver|selenium/i)
    } finally {
      await browser?.close()
      await closeServer?.()
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)
})
