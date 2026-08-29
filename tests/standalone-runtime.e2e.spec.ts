import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { STANDALONE_RUNTIME, standaloneHtml } from '../src/runtime/standalone.ts'

interface FixtureOptions {
  permissionList(req: IncomingMessage, res: ServerResponse, call: number, body: Record<string, unknown>): void
  reportRuntimeFailure?(body: Record<string, unknown>): Record<string, unknown>
  runtimeErrorVersion?: string
  previewContent?(version: string): string | undefined
}

interface Fixture {
  origin: string
  permissionVersions: string[]
  runtimeFailureVersions: string[]
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

function bridgedPreview(content: string, versionId: string): string {
  const encoded = Buffer.from(content).toString('base64')
  return `<!doctype html><script>
    const artifactId = 'fixture-app'
    const versionId = ${JSON.stringify(versionId)}
    const nonce = new URLSearchParams(location.hash.slice(1)).get('bridge_nonce')
    const channel = new MessageChannel()
    const port = channel.port1
    let accepted = false
    let loaded = document.readyState === 'complete'
    let announced = false
    let started = false
    const post = value => port.postMessage({ source: 'dsh-genui', bridgeVersion: 1, nonce, artifactId, versionId, ...value })
    const announce = () => { if (accepted && loaded && !announced) { announced = true; post({ type: 'preview-loaded' }) } }
    const start = () => {
      if (started) return
      started = true
      const source = atob(${JSON.stringify(encoded)})
      const parsed = new DOMParser().parseFromString(source, 'text/html')
      const scripts = [...parsed.querySelectorAll('script')].map(script => script.textContent || '')
      parsed.querySelectorAll('script').forEach(script => script.remove())
      document.body.replaceChildren(...[...parsed.body.childNodes].map(node => document.importNode(node, true)))
      for (const scriptSource of scripts) {
        const script = document.createElement('script')
        script.textContent = scriptSource
        document.body.append(script)
      }
    }
    port.onmessage = event => {
      const value = event.data
      if (value?.nonce !== nonce) return
      if (value.type === 'bridge-accepted') { accepted = true; announce(); return }
      if (value.type === 'liveness-challenge') { post({ type: 'liveness-response', requestId: value.requestId }); return }
      if (value.type === 'start-app') start()
    }
    port.start()
    addEventListener('load', () => { loaded = true; announce() }, { once: true })
    addEventListener('pagehide', () => post({ type: 'preview-leaving' }), { once: true })
    parent.postMessage({ source: 'dsh-genui', type: 'bridge-connect', bridgeVersion: 1, nonce, artifactId, versionId }, '*', [channel.port2])
  </script>`
}

async function startFixture(options: FixtureOptions): Promise<Fixture> {
  const permissionVersions: string[] = []
  const runtimeFailureVersions: string[] = []
  const sockets = new Set<Socket>()
  let permissionCalls = 0
  const runtime = STANDALONE_RUNTIME.replace('const requestTimeoutMs = 8000', 'const requestTimeoutMs = 60')
  if (runtime === STANDALONE_RUNTIME) throw new Error('standalone timeout fixture did not shorten the production timeout')
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/app') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(standaloneHtml('/genui', 'fixture-app', options.runtimeErrorVersion ?? 'current-version', 'Fixture app', 'en'))
      return
    }
    if (url.pathname === '/genui/standalone.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
      res.end(runtime)
      return
    }
    if (url.pathname === '/genui/api/fixture-app/permission/list') {
      const body = await readJson(req)
      permissionCalls += 1
      permissionVersions.push(String(body.version_id))
      options.permissionList(req, res, permissionCalls, body)
      return
    }
    if (url.pathname === '/genui/api/fixture-app/version/report-runtime-failure') {
      const body = await readJson(req)
      runtimeFailureVersions.push(String(body.version_id))
      sendJson(res, 200, options.reportRuntimeFailure?.(body) ?? {
        reported: true,
        failed_version_id: body.version_id,
      })
      return
    }
    const preview = url.pathname.match(/^\/genui\/preview\/fixture-app\/([^/]+)$/)
    if (preview !== null) {
      const version = decodeURIComponent(preview[1] ?? '')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      const custom = options.previewContent?.(version)
      if (custom !== undefined) {
        res.end(bridgedPreview(custom, version))
        return
      }
      if (version === options.runtimeErrorVersion) {
        const message = JSON.stringify({
          source: 'dsh-genui',
          type: 'runtime-error',
          artifactId: 'fixture-app',
          versionId: version,
        })
        res.end(bridgedPreview(`<!doctype html><script>parent.postMessage(${message}, '*');parent.postMessage(${message}, '*')</script>`, version))
      } else {
        const ready = JSON.stringify({ source: 'dsh-genui', type: 'ready', artifactId: 'fixture-app', versionId: version })
        res.end(bridgedPreview(`<!doctype html><main>Preview ${version}</main><script>parent.postMessage(${ready}, '*')</script>`, version))
      }
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
  if (address === null || typeof address === 'string') throw new Error('fixture server did not bind')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    permissionVersions,
    runtimeFailureVersions,
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
    },
  }
}

describe('standalone runtime recovery', { timeout: 45_000 }, () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser?.close()
  })

  it('times out a stalled permission bootstrap and retries without a blank page', async () => {
    const fixture = await startFixture({
      permissionList(_req, res, call) {
        if (call === 1) return
        sendJson(res, 200, { permissions: [] })
      },
    })
    const page = await browser.newPage()
    try {
      await page.goto(`${fixture.origin}/app#token=fixture-token`)
      await page.getByRole('heading', { name: 'Access could not be checked' }).waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Try again' }).click()
      await page.frameLocator('#app').getByText('Preview current-version').waitFor({ state: 'visible' })
      expect(fixture.permissionVersions).toEqual(['current-version', 'current-version'])
      expect(await page.locator('#error').isHidden()).toBe(true)
    } finally {
      await page.close()
      await fixture.close()
    }
  })

  it('lets the user open the app after a failed permission bootstrap', async () => {
    const fixture = await startFixture({
      permissionList(_req, res) {
        sendJson(res, 503, { error: 'temporarily unavailable' })
      },
    })
    const page = await browser.newPage()
    try {
      await page.goto(`${fixture.origin}/app#token=fixture-token`)
      await page.getByRole('heading', { name: 'Access could not be checked' }).waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Open app' }).click()
      await page.frameLocator('#app').getByText('Preview current-version').waitFor({ state: 'visible' })
      expect(fixture.permissionVersions).toEqual(['current-version'])
    } finally {
      await page.close()
      await fixture.close()
    }
  })

  it('reports a runtime error once and opens the server-selected fallback version', async () => {
    const fixture = await startFixture({
      runtimeErrorVersion: 'broken-version',
      permissionList(_req, res) {
        sendJson(res, 200, { permissions: [] })
      },
      reportRuntimeFailure(body) {
        return {
          reported: true,
          failed_version_id: body.version_id,
          fallback_version_id: 'stable-version',
        }
      },
    })
    const page = await browser.newPage()
    try {
      await page.goto(`${fixture.origin}/app#token=fixture-token`)
      await page.frameLocator('#app').getByText('Preview stable-version').waitFor({ state: 'visible' })
      expect(fixture.runtimeFailureVersions).toEqual(['broken-version'])
      expect(fixture.permissionVersions).toEqual(['broken-version', 'stable-version'])
      expect(await page.locator('body').getAttribute('data-version-id')).toBe('stable-version')
      await page.getByText('Restored the last working version', { exact: true }).waitFor({ state: 'visible' })
    } finally {
      await page.close()
      await fixture.close()
    }
  })

  it('keeps the recovery error visible when the server has no fallback', async () => {
    const fixture = await startFixture({
      runtimeErrorVersion: 'only-version',
      permissionList(_req, res) {
        sendJson(res, 200, { permissions: [] })
      },
    })
    const page = await browser.newPage()
    try {
      await page.goto(`${fixture.origin}/app#token=fixture-token`)
      await page.getByRole('alert').getByText('This app did not open correctly. Return to the task and ask me to repair it.').waitFor({ state: 'visible' })
      expect(fixture.runtimeFailureVersions).toEqual(['only-version'])
      expect(await page.locator('#app').isHidden()).toBe(true)
    } finally {
      await page.close()
      await fixture.close()
    }
  })

  it('uses the server-selected current version again after a page refresh', async () => {
    const fixture = await startFixture({
      runtimeErrorVersion: 'failed-version',
      permissionList(_req, res, _call, body) {
        const requested = String(body.version_id)
        sendJson(res, 200, { version_id: requested === 'failed-version' ? 'stable-version' : requested, permissions: [] })
      },
    })
    const page = await browser.newPage()
    try {
      await page.goto(`${fixture.origin}/app#token=fixture-token`)
      await page.frameLocator('#app').getByText('Preview stable-version').waitFor({ state: 'visible' })
      await page.reload()
      await page.frameLocator('#app').getByText('Preview stable-version').waitFor({ state: 'visible' })
      expect(fixture.permissionVersions).toEqual(['failed-version', 'stable-version', 'failed-version', 'stable-version'])
      expect(fixture.runtimeFailureVersions).toEqual([])
    } finally {
      await page.close()
      await fixture.close()
    }
  })

  it('does not reuse permission details from a failed version when fallback access cannot be checked', async () => {
    const runtimeError = JSON.stringify({
      source: 'dsh-genui', type: 'runtime-error', artifactId: 'fixture-app', versionId: 'current-version',
    })
    const fallbackRequest = JSON.stringify({
      source: 'dsh-genui', type: 'permission-request', requestId: 'fallback-request',
      artifactId: 'fixture-app', versionId: 'stable-version',
      permission: { id: 'shared-id', kind: 'tool', label: 'Harmless fallback copy', reason: 'Spoofed.', access: 'read' },
    })
    const fixture = await startFixture({
      runtimeErrorVersion: 'current-version',
      permissionList(_req, res, call) {
        if (call === 1) {
          sendJson(res, 200, { version_id: 'current-version', permissions: [{
            id: 'shared-id', kind: 'tool', label: 'Delete current records',
            reason: 'Permanently delete saved records.', access: 'write', granted: true,
          }] })
          return
        }
        sendJson(res, 503, { error: 'fallback permissions unavailable' })
      },
      reportRuntimeFailure() {
        return { reported: true, failed_version_id: 'current-version', fallback_version_id: 'stable-version' }
      },
      previewContent(version) {
        if (version === 'current-version') return `<!doctype html><script>parent.postMessage(${runtimeError}, '*')</script>`
        return `<!doctype html><main id="result">Waiting</main><script>
          addEventListener('message', event => {
            if (event.data?.type === 'permission-result' && event.data.requestId === 'fallback-request') {
              document.getElementById('result').textContent = event.data.granted ? 'Unexpectedly granted' : 'Connected access unavailable'
            }
          });
          parent.postMessage(${fallbackRequest}, '*')
        </script>`
      },
    })
    const page = await browser.newPage()
    try {
      await page.goto(`${fixture.origin}/app#token=fixture-token`)
      await page.getByRole('heading', { name: 'Access could not be checked' }).waitFor({ state: 'visible' })
      expect(await page.locator('#permission-reason').textContent())
        .toBe('Try again, or open the parts that do not need connected access. Connected capabilities stay unavailable until the access check recovers.')
      await page.getByRole('button', { name: 'Open app' }).click()
      await page.frameLocator('#app').getByText('Connected access unavailable', { exact: true }).waitFor({ state: 'visible' })
      expect(await page.getByRole('heading', { name: 'Delete current records' }).count()).toBe(0)
      expect(fixture.permissionVersions).toEqual(['current-version', 'stable-version'])
    } finally {
      await page.close()
      await fixture.close()
    }
  })

  it('shows canonical server permission details instead of iframe-supplied text', async () => {
    const canonical = {
      id: 'delete-records', kind: 'tool', label: 'Delete saved records',
      reason: 'Permanently remove the selected records.', access: 'write', granted: false,
    }
    const fakeRequest = JSON.stringify({
      source: 'dsh-genui', type: 'permission-request', requestId: 'spoofed-request',
      artifactId: 'fixture-app', versionId: 'current-version',
      permission: { id: canonical.id, kind: 'tool', label: 'Check the weather', reason: 'Read a public forecast.', access: 'read' },
    })
    const fixture = await startFixture({
      permissionList(_req, res) {
        sendJson(res, 200, { version_id: 'current-version', permissions: [canonical] })
      },
      previewContent() {
        return `<!doctype html><main>Permission spoof fixture</main><script>parent.postMessage(${fakeRequest}, '*')</script>`
      },
    })
    const page = await browser.newPage()
    try {
      await page.goto(`${fixture.origin}/app#token=fixture-token`)
      await page.getByRole('heading', { name: 'This app needs the following access' }).waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Not now' }).click()
      await page.getByRole('heading', { name: canonical.label }).waitFor({ state: 'visible' })
      await page.getByText(canonical.reason, { exact: true }).waitFor({ state: 'visible' })
      await page.getByText('Make changes', { exact: true }).waitFor({ state: 'visible' })
      expect(await page.getByText('Check the weather', { exact: true }).count()).toBe(0)
    } finally {
      await page.close()
      await fixture.close()
    }
  })

  it('does not globally quarantine an interactive-session error', async () => {
    const ready = JSON.stringify({ source: 'dsh-genui', type: 'ready', artifactId: 'fixture-app', versionId: 'current-version' })
    const interactiveError = JSON.stringify({ source: 'dsh-genui', type: 'runtime-error', phase: 'startup', artifactId: 'fixture-app', versionId: 'current-version' })
    const fixture = await startFixture({
      permissionList(_req, res) {
        sendJson(res, 200, { version_id: 'current-version', permissions: [] })
      },
      previewContent() {
        return `<!doctype html><main>Interactive fixture</main><script>parent.postMessage(${ready}, '*');setTimeout(() => parent.postMessage(${interactiveError}, '*'), 20)</script>`
      },
    })
    const page = await browser.newPage()
    try {
      await page.goto(`${fixture.origin}/app#token=fixture-token`)
      await page.getByRole('alert').getByText('This app just hit a problem. You can reopen it without affecting other users.').waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Reopen app' }).waitFor({ state: 'visible' })
      expect(fixture.runtimeFailureVersions).toEqual([])
    } finally {
      await page.close()
      await fixture.close()
    }
  })
})
