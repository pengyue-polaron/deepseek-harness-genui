import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { build } from 'esbuild'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'

const canonicalPermission = {
  id: 'delete-records',
  kind: 'tool',
  label: 'Delete saved records',
  reason: 'Permanently remove the selected records.',
  access: 'write',
  granted: false,
}

interface ShellFixture {
  origin: string
  permissionVersions: string[]
  previewVersions: string[]
  receiptAccesses: Array<Record<string, unknown>>
  sideEffectRequests: Array<{ scenario: string; action: string; body: Record<string, unknown> }>
  close(): Promise<void>
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let source = ''
  for await (const chunk of req) source += String(chunk)
  return JSON.parse(source) as Record<string, unknown>
}

function previewHtml(scenario: string, artifactId: string, versionId: string): string {
  const ready = JSON.stringify({ source: 'dsh-genui', type: 'ready', artifactId, versionId })
  const sendReady = `parent.postMessage(${ready}, '*')`
  let run: string
  let responseHandler = ''
  if (scenario === 'bridge-policy') {
    run = `
      post({ type: 'api-request', requestId: 'forbidden-control', action: 'permission/grant', body: { capability_id: 'unexpected' } });
      post({ type: 'api-request', requestId: 'bound-state', action: 'state/write', body: { key: 'bridge-policy', value: 'saved', version_id: 'stale-version' } });
      ${sendReady};
    `
    responseHandler = `
      if (value.type === 'api-response') {
        document.documentElement.dataset[value.requestId === 'forbidden-control' ? 'forbiddenStatus' : 'allowedStatus'] = String(value.status)
      }
    `
  } else if (scenario === 'navigation-spoof') {
    run = `
      const ready = () => ${sendReady};
      addEventListener('message', event => { if (event.data?.type === 'ready-request') ready() });
      setTimeout(ready, 20);
      document.getElementById('navigate-preview').addEventListener('click', () => {
        const target = new URL('/attack-document', location.href)
        target.searchParams.set('nonce', nonce)
        target.searchParams.set('artifact_id', artifactId)
        target.searchParams.set('version_id', versionId)
        location.replace(target)
      });
    `
  } else if (scenario === 'canonical') {
    const spoofed = JSON.stringify({
      source: 'dsh-genui',
      type: 'permission-request',
      requestId: 'spoofed-request',
      artifactId,
      versionId,
      permission: {
        id: canonicalPermission.id,
        kind: 'tool',
        label: 'Check the weather',
        reason: 'Read a harmless public forecast.',
        access: 'read',
      },
    })
    run = `
      const ready = () => ${sendReady};
      addEventListener('message', event => { if (event.data?.type === 'ready-request') ready() });
      setTimeout(ready, 20);
      setTimeout(() => parent.postMessage(${spoofed}, '*'), 60);
    `
  } else {
    const readyDelay = scenario === 'fallback' ? 300 : 20
    run = `
      const ready = () => ${sendReady};
      addEventListener('message', event => { if (event.data?.type === 'ready-request') setTimeout(ready, ${readyDelay}) });
      setTimeout(ready, ${readyDelay});
    `
  }
  const content = scenario === 'canonical'
    ? 'Canonical permission fixture'
    : scenario === 'bridge-policy'
      ? 'Bridge policy fixture'
    : scenario === 'navigation-spoof'
      ? 'Navigation boundary fixture <button id="navigate-preview" type="button">Navigate preview</button>'
      : `Preview ${versionId}`
  return `<!doctype html><main>${content}</main><script>
    const artifactId = ${JSON.stringify(artifactId)}
    const versionId = ${JSON.stringify(versionId)}
    const nonce = new URLSearchParams(location.hash.slice(1)).get('bridge_nonce')
    const channel = new MessageChannel()
    const port = channel.port1
    let accepted = false
    let loaded = document.readyState === 'complete'
    let announced = false
    const post = value => port.postMessage({ source: 'dsh-genui', bridgeVersion: 1, nonce, artifactId, versionId, ...value })
    const announce = () => { if (accepted && loaded && !announced) { announced = true; post({ type: 'preview-loaded' }) } }
    port.onmessage = event => {
      const value = event.data
      if (value?.nonce !== nonce) return
      ${responseHandler}
      if (value.type === 'bridge-accepted') { accepted = true; announce(); return }
      if (value.type === 'liveness-challenge') { post({ type: 'liveness-response', requestId: value.requestId }); return }
      if (value.type === 'start-app') { ${run} }
    }
    port.start()
    addEventListener('load', () => { loaded = true; announce() }, { once: true })
    addEventListener('pagehide', () => post({ type: 'preview-leaving' }), { once: true })
    parent.postMessage({ source: 'dsh-genui', type: 'bridge-connect', bridgeVersion: 1, nonce, artifactId, versionId }, '*', [channel.port2])
  </script>`
}

async function startShellFixture(entryScript: string): Promise<ShellFixture> {
  const permissionVersions: string[] = []
  const previewVersions: string[] = []
  const receiptAccesses: Array<Record<string, unknown>> = []
  const sideEffectRequests: ShellFixture['sideEffectRequests'] = []
  const receiptAttempts = new Map<string, number>()
  const permissionCalls = new Map<string, number>()
  const sockets = new Set<Socket>()
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/app') {
      const scenario = url.searchParams.get('scenario') ?? 'default'
      const darkAttribute = scenario === 'dark' ? ' data-ds-dark-theme' : ''
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>*{box-sizing:border-box}html,body,#root{width:100%;margin:0}body{padding:0}</style></head>
        <body${darkAttribute}><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`)
      return
    }
    if (url.pathname === '/entry.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
      res.end(entryScript)
      return
    }
    if (url.pathname === '/.well-known/dsh-genui') {
      sendJson(res, 200, { route_prefix: '/genui' })
      return
    }
    if (url.pathname === '/attack-document') {
      const nonce = url.searchParams.get('nonce') ?? ''
      const artifactId = url.searchParams.get('artifact_id') ?? ''
      const versionId = url.searchParams.get('version_id') ?? ''
      const permissionRequest = JSON.stringify({
        source: 'dsh-genui', type: 'permission-request', requestId: 'navigated-permission',
        artifactId, versionId, permission: canonicalPermission,
      })
      const runtimeError = JSON.stringify({
        source: 'dsh-genui', type: 'runtime-error', phase: 'startup', artifactId, versionId,
      })
      const stateChanged = JSON.stringify({
        source: 'dsh-genui', type: 'state-changed', key: 'navigated-state', artifactId, versionId,
      })
      const ready = JSON.stringify({ source: 'dsh-genui', type: 'ready', artifactId, versionId })
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><html data-second-port="0"><main>Attacker document</main><p id="attack-status">starting</p><script>
        const nonce = ${JSON.stringify(nonce)}
        const artifactId = ${JSON.stringify(artifactId)}
        const versionId = ${JSON.stringify(versionId)}
        const channel = new MessageChannel()
        const port = channel.port1
        port.onmessage = event => {
          document.documentElement.dataset.secondPort = '1'
          const base = { source: 'dsh-genui', bridgeVersion: 1, nonce, artifactId, versionId }
          const requests = [
            ['state/write', { key: 'navigated-state', value: 'unexpected' }],
            ['tool', { name: 'unexpected_tool', arguments: {} }],
            ['external', { url: 'https://example.com/', method: 'GET' }],
          ]
          requests.forEach(([action, body], index) => port.postMessage({
            ...base, type: 'api-request', requestId: 'navigated-api-' + index, action, body,
          }))
        }
        port.start()
        parent.postMessage({
          source: 'dsh-genui', type: 'bridge-connect', bridgeVersion: 1,
          nonce, artifactId, versionId,
        }, '*', [channel.port2])
        parent.postMessage(${permissionRequest}, '*')
        parent.postMessage(${runtimeError}, '*')
        parent.postMessage(${stateChanged}, '*')
        parent.postMessage(${ready}, '*')
        document.getElementById('attack-status').textContent = 'probes sent'
      </script></html>`)
      return
    }
    if (url.pathname === '/genui/host-control/preview-access') {
      const body = await readJson(req)
      receiptAccesses.push(body)
      const artifactId = String(body.artifact_id)
      const attempt = (receiptAttempts.get(artifactId) ?? 0) + 1
      receiptAttempts.set(artifactId, attempt)
      if (artifactId === 'fixture-nested-retry' && attempt === 1) {
        sendJson(res, 503, { error: 'temporary receipt access failure' })
        return
      }
      sendJson(res, 200, {
        artifact_id: body.artifact_id,
        title: 'Canonical nested app',
        version_id: body.version_id,
        preview_url: `/genui/preview/${String(body.artifact_id)}/${String(body.version_id)}?lang=en#token=host-only-token`,
      })
      return
    }
    const api = url.pathname.match(/^\/genui\/api\/(fixture-[^/]+)\/permission\/list$/)
    if (api !== null) {
      const scenario = (api[1] ?? '').slice('fixture-'.length)
      const body = await readJson(req)
      const requested = String(body.version_id)
      permissionVersions.push(`${scenario}:${requested}`)
      const call = (permissionCalls.get(scenario) ?? 0) + 1
      permissionCalls.set(scenario, call)
      if (scenario === 'fallback') {
        sendJson(res, 200, {
          version_id: requested === 'failed-version' ? 'stable-version' : requested,
          permissions: [],
        })
      } else if (scenario === 'access-retry' && call === 1) {
        sendJson(res, 503, { error: 'temporarily unavailable' })
      } else if (scenario === 'canonical' || scenario === 'inert' || scenario === 'navigation-spoof') {
        sendJson(res, 200, { version_id: requested, permissions: [canonicalPermission] })
      } else {
        sendJson(res, 200, { version_id: requested, permissions: [] })
      }
      return
    }
    const sideEffectApi = url.pathname.match(/^\/genui\/api\/(fixture-[^/]+)\/(.+)$/)
    if (sideEffectApi !== null && req.method === 'POST') {
      const scenario = (sideEffectApi[1] ?? '').slice('fixture-'.length)
      const action = sideEffectApi[2] ?? ''
      const body = await readJson(req)
      sideEffectRequests.push({ scenario, action, body })
      sendJson(res, 200, action === 'version/report-runtime-failure'
        ? { reported: true, failed_version_id: body.version_id }
        : { ok: true })
      return
    }
    const preview = url.pathname.match(/^\/genui\/preview\/(fixture-[^/]+)\/([^/]+)$/)
    if (preview !== null) {
      const artifactId = decodeURIComponent(preview[1] ?? '')
      const scenario = artifactId.slice('fixture-'.length)
      const versionId = decodeURIComponent(preview[2] ?? '')
      previewVersions.push(`${scenario}:${versionId}:${url.searchParams.get('theme') ?? 'none'}`)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(previewHtml(scenario, artifactId, versionId))
      return
    }
    res.writeHead(404)
    res.end('not found')
  })
  server.on('connection', socket => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('shell fixture server did not bind')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    permissionVersions,
    previewVersions,
    receiptAccesses,
    sideEffectRequests,
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
    },
  }
}

async function openScenario(browser: Browser, fixture: ShellFixture, scenario: string, viewport = { width: 800, height: 720 }, colorScheme: 'light' | 'dark' = 'light'): Promise<Page> {
  const page = await browser.newPage({ viewport })
  await page.emulateMedia({ colorScheme })
  await page.goto(`${fixture.origin}/app?scenario=${scenario}`)
  await page.locator('.dsh-genui-card').waitFor({ state: 'visible' })
  return page
}

describe('GenuiToolView browser shell', () => {
  let browser: Browser
  let fixture: ShellFixture

  beforeAll(async () => {
    const entry = await build({
      absWorkingDir: process.cwd(),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      stdin: {
        loader: 'tsx',
        resolveDir: process.cwd(),
        sourcefile: 'client-shell-entry.tsx',
        contents: `
          import React from 'react'
          import { createRoot } from 'react-dom/client'
          import { GenuiToolView } from './src/client/index.tsx'
          import { en } from './src/client/locales.ts'

          const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
          const artifactId = 'fixture-' + scenario
          const versionId = scenario === 'fallback'
            ? 'failed-version'
            : scenario.startsWith('nested')
              ? 'v-12345678-1234-1234-1234-123456789abc'
              : 'current-version'
          const title = scenario === 'overflow'
            ? 'A deliberately very long generated application title that must stay inside a narrow conversation card'
            : 'Fixture app'
          const t = (key, values) => {
            let value = en[key] ?? key
            for (const [name, replacement] of Object.entries(values ?? {})) value = value.replace('{' + name + '}', String(replacement))
            return value
          }
          const receipt = btoa(JSON.stringify({ v: 1, card: 'genui', artifactId, title, versionId }))
            .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
          const block = scenario.startsWith('nested')
            ? {
                kind: 'tool-result', isError: false, meta: undefined,
                content: [{ type: 'text', text: 'Nested tool completed.\\n<!--dsh-genui-receipt:' + receipt + '-->' }],
              }
            : {
                kind: 'result',
                isError: false,
                meta: {
                  card: 'genui', artifactId, title, versionId,
                  previewUrl: location.origin + '/genui/preview/' + artifactId + '/' + versionId + '#token=' + scenario,
                },
              }
          createRoot(document.getElementById('root')).render(
            <GenuiToolView block={block} callId={'call-' + scenario} sessionId="fixture-session" t={t} />
          )
        `,
      },
    })
    const entryScript = entry.outputFiles[0]?.text
    if (entryScript === undefined) throw new Error('client shell entry did not bundle')
    fixture = await startShellFixture(entryScript)
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  beforeEach(() => {
    fixture.permissionVersions.length = 0
    fixture.previewVersions.length = 0
    fixture.receiptAccesses.length = 0
    fixture.sideEffectRequests.length = 0
  })

  afterAll(async () => {
    await browser?.close()
    await fixture?.close()
  })

  it('fits the real React shell in a 260px conversation column', async () => {
    const page = await openScenario(browser, fixture, 'overflow', { width: 260, height: 720 })
    try {
      await page.frameLocator('.dsh-genui-frame').getByText('Preview current-version').waitFor({ state: 'visible' })
      const geometry = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>('.dsh-genui-card')
        if (card === null) throw new Error('card missing')
        return {
          documentClientWidth: document.documentElement.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          cardClientWidth: card.clientWidth,
          cardScrollWidth: card.scrollWidth,
          cardRight: card.getBoundingClientRect().right,
        }
      })
      expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.documentClientWidth)
      expect(geometry.cardScrollWidth).toBeLessThanOrEqual(geometry.cardClientWidth)
      expect(geometry.cardRight).toBeLessThanOrEqual(260)
    } finally {
      await page.close()
    }
  })

  it('opens a nested PTC receipt through host-only session access', async () => {
    const page = await openScenario(browser, fixture, 'nested')
    try {
      await page.frameLocator('.dsh-genui-frame')
        .getByText('Preview v-12345678-1234-1234-1234-123456789abc').waitFor({ state: 'visible' })
      expect(fixture.receiptAccesses).toEqual([{
        artifact_id: 'fixture-nested',
        version_id: 'v-12345678-1234-1234-1234-123456789abc',
        session_id: 'fixture-session',
      }])
      await page.getByRole('heading', { name: 'Canonical nested app' }).waitFor({ state: 'visible' })
    } finally {
      await page.close()
    }
  })

  it('retries a transient nested receipt access failure and then opens the card', async () => {
    const page = await openScenario(browser, fixture, 'nested-retry')
    try {
      await page.getByRole('button', { name: 'Check again' }).waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Check again' }).click()
      await page.frameLocator('.dsh-genui-frame')
        .getByText('Preview v-12345678-1234-1234-1234-123456789abc').waitFor({ state: 'visible' })
      expect(fixture.receiptAccesses).toHaveLength(2)
      expect(fixture.receiptAccesses.every(item => item.session_id === 'fixture-session')).toBe(true)
    } finally {
      await page.close()
    }
  })

  it('honors an explicit Harness dark theme even when the OS preference is light', async () => {
    const page = await openScenario(browser, fixture, 'dark')
    try {
      await page.frameLocator('.dsh-genui-frame').getByText('Preview current-version').waitFor({ state: 'visible' })
      const colors = await page.locator('.dsh-genui-card').evaluate(card => {
        const body = card.querySelector<HTMLElement>('.dsh-genui-body')
        const frame = card.querySelector<HTMLElement>('.dsh-genui-frame')
        if (body === null || frame === null) throw new Error('shell surfaces missing')
        return {
          card: getComputedStyle(card).backgroundColor,
          body: getComputedStyle(body).backgroundColor,
          frame: getComputedStyle(frame).backgroundColor,
        }
      })
      expect(colors.card).toBe('rgb(23, 23, 23)')
      expect(colors.body).toBe(colors.card)
      expect(colors.frame).toBe(colors.card)
      expect(fixture.previewVersions).toContain('dark:current-version:dark')
    } finally {
      await page.close()
    }
  })

  it('honors an explicit Harness light theme even when the OS preference is dark', async () => {
    const page = await openScenario(browser, fixture, 'light', { width: 800, height: 720 }, 'dark')
    try {
      await page.frameLocator('.dsh-genui-frame').getByText('Preview current-version').waitFor({ state: 'visible' })
      const colors = await page.locator('.dsh-genui-card').evaluate(card => {
        const body = card.querySelector<HTMLElement>('.dsh-genui-body')
        const frame = card.querySelector<HTMLElement>('.dsh-genui-frame')
        if (body === null || frame === null) throw new Error('shell surfaces missing')
        return {
          theme: card.getAttribute('data-genui-theme'),
          card: getComputedStyle(card).backgroundColor,
          body: getComputedStyle(body).backgroundColor,
          frame: getComputedStyle(frame).backgroundColor,
        }
      })
      expect(colors.theme).toBe('light')
      expect(colors.card).toBe('rgb(250, 249, 246)')
      expect(colors.body).toBe(colors.card)
      expect(colors.frame).toBe(colors.card)
      expect(fixture.previewVersions).toContain('light:current-version:light')
    } finally {
      await page.close()
    }
  })

  it('makes the shell header and body inert while the permission modal is open', async () => {
    const page = await openScenario(browser, fixture, 'inert')
    try {
      await page.getByRole('heading', { name: 'This app needs the following access' }).waitFor({ state: 'visible' })
      for (const selector of ['.dsh-genui-head', '.dsh-genui-body']) {
        const background = page.locator(selector)
        await expect.poll(() => background.getAttribute('inert')).toBe('')
        expect(await background.getAttribute('aria-hidden')).toBe('true')
      }
      await page.getByRole('button', { name: 'Not now' }).click()
      await expect.poll(() => page.locator('.dsh-genui-head').getAttribute('inert')).toBeNull()
      expect(await page.locator('.dsh-genui-body').getAttribute('inert')).toBeNull()
    } finally {
      await page.close()
    }
  })

  it('keeps the app closed and retries when canonical access cannot be loaded', async () => {
    const page = await openScenario(browser, fixture, 'access-retry')
    try {
      await page.getByRole('alert').getByText('App access could not be checked. Connected capabilities stay unavailable.', { exact: true }).waitFor({ state: 'visible' })
      expect(await page.locator('.dsh-genui-frame').count()).toBe(0)
      await page.getByRole('button', { name: 'Check again' }).click()
      await page.frameLocator('.dsh-genui-frame').getByText('Preview current-version').waitFor({ state: 'visible' })
      expect(fixture.permissionVersions).toEqual([
        'access-retry:current-version',
        'access-retry:current-version',
      ])
    } finally {
      await page.close()
    }
  })

  it('shows canonical permission details when the iframe spoofs safer copy', async () => {
    const page = await openScenario(browser, fixture, 'canonical')
    try {
      await page.getByRole('heading', { name: 'This app needs the following access' }).waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Not now' }).click()
      await page.getByRole('heading', { name: canonicalPermission.label }).waitFor({ state: 'visible' })
      await page.getByText(canonicalPermission.reason, { exact: true }).waitFor({ state: 'visible' })
      await page.getByText('Make changes', { exact: true }).waitFor({ state: 'visible' })
      expect(await page.getByText('Check the weather', { exact: true }).count()).toBe(0)
      expect(await page.getByText('Read a harmless public forecast.', { exact: true }).count()).toBe(0)
    } finally {
      await page.close()
    }
  })

  it('rejects raw control messages and a second bridge after the preview document navigates', async () => {
    const page = await openScenario(browser, fixture, 'navigation-spoof')
    try {
      await page.getByRole('heading', { name: 'This app needs the following access' }).waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Not now' }).click()
      const app = page.frameLocator('.dsh-genui-frame')
      await app.getByRole('button', { name: 'Navigate preview' }).waitFor({ state: 'visible' })
      await app.getByRole('button', { name: 'Navigate preview' }).click()

      await expect.poll(() => page.frames().some(frame => new URL(frame.url()).pathname === '/attack-document')).toBe(true)
      const attacker = page.frames().find(frame => new URL(frame.url()).pathname === '/attack-document')
      if (attacker === undefined) throw new Error('attacker document did not commit inside the preview frame')
      await attacker.getByText('probes sent', { exact: true }).waitFor({ state: 'attached' })
      await page.waitForTimeout(400)

      expect(await attacker.locator('html').getAttribute('data-second-port')).toBe('0')
      expect(fixture.sideEffectRequests).toEqual([])
      expect(await page.getByRole('heading', { name: canonicalPermission.label }).count()).toBe(0)
      expect(await page.getByText('Saved', { exact: true }).count()).toBe(0)
      await page.getByRole('alert').getByText('The app did not open.', { exact: true }).waitFor({ state: 'visible' })
      expect(page.url()).toBe(`${fixture.origin}/app?scenario=navigation-spoof`)
    } finally {
      await page.close()
    }
  })

  it('rejects host-control bridge actions and binds allowed requests to the active version', async () => {
    const page = await openScenario(browser, fixture, 'bridge-policy')
    try {
      const app = page.frameLocator('.dsh-genui-frame')
      await app.getByText('Bridge policy fixture', { exact: true }).waitFor({ state: 'visible' })
      await expect.poll(() => app.locator('html').getAttribute('data-forbidden-status')).toBe('400')
      await expect.poll(() => app.locator('html').getAttribute('data-allowed-status')).toBe('200')
      expect(fixture.sideEffectRequests).toEqual([{
        scenario: 'bridge-policy',
        action: 'state/write',
        body: { key: 'bridge-policy', value: 'saved', version_id: 'current-version' },
      }])
    } finally {
      await page.close()
    }
  })

  it('loads the server-selected fallback and announces recovery only after it is ready', async () => {
    const page = await openScenario(browser, fixture, 'fallback')
    try {
      await page.frameLocator('.dsh-genui-frame').getByText('Preview stable-version').waitFor({ state: 'visible' })
      expect(await page.getByText('Restored the last working version', { exact: true }).count()).toBe(0)
      await page.getByText('Restored the last working version', { exact: true }).waitFor({ state: 'visible' })
      expect(fixture.permissionVersions).toEqual(['fallback:failed-version', 'fallback:stable-version'])
      expect(fixture.previewVersions).toEqual(['fallback:stable-version:light'])
    } finally {
      await page.close()
    }
  })
})
