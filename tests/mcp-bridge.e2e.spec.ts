import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { apply as applyMcp } from '@deepseek-ai/dsh-mcp-client'
import { chromium } from 'playwright'
import { ArtifactRegistry } from '../src/artifacts/registry.ts'
import { DesignStore } from '../src/designs/store.ts'
import { artifactSessionPrefix, CapabilityStore } from '../src/runtime/capabilities.ts'
import { createHttpRuntime } from '../src/runtime/server.ts'
import { ARTIFACT_RUNTIME_VERSION } from '../src/runtime/standalone.ts'

describe('real MCP artifact bridge', () => {
  let ctx: Context
  let root: string
  let registry: ArtifactRegistry
  let origin: string
  let closeServer: () => Promise<void>
  let token: string
  let verificationToken: string
  let versionId: string
  let capabilities: CapabilityStore
  let receiptArtifactId: string
  let receiptVersionId: string
  let receiptCurrentVersionId: string

  beforeAll(async () => {
    ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)

    const require = createRequire(import.meta.url)
    const packageDir = dirname(require.resolve('@modelcontextprotocol/server-everything/package.json'))
    await applyMcp(ctx, {
      transport: 'stdio',
      serverName: 'everything',
      command: process.execPath,
      args: [join(packageDir, 'dist/index.js'), 'stdio'],
      env: {},
      cwd: '',
      toolCallTimeoutMs: 30_000,
      failOnStartupError: true,
    })

    root = await mkdtemp(join(tmpdir(), 'dsh-genui-mcp-'))
    registry = new ArtifactRegistry(root, 128 * 1024)
    await registry.init()
    const designs = new DesignStore(join(root, '.designs'))
    await designs.init()
    const version = await registry.create({
      id: 'mcp-artifact', title: 'MCP artifact', summary: 'Runtime bridge fixture', requirements: [],
      capabilities: [
        { id: 'echo-service', kind: 'tool', label: 'Echo a message', reason: 'Return the message through the connected service.', access: 'read', tool: 'mcp__everything__echo' },
        { id: 'sum-service', kind: 'tool', label: 'Add two numbers', reason: 'Calculate the requested total through the connected service.', access: 'read', tool: 'mcp__everything__get-sum' },
        { id: 'public-weather', kind: 'external', label: 'Read the forecast', reason: 'Load the current public forecast for the selected place.', access: 'read', urlPrefix: 'https://api.example.com/v1/', methods: ['GET'] },
      ],
      files: [{ path: 'src/main.tsx', content: 'export {}' }],
    })
    versionId = version.id
    await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    capabilities = new CapabilityStore()
    const fakeAgent = {
      id: SessionId('genui-mcp-e2e'),
      ctx,
    } as unknown as Agent
    token = capabilities.issue('mcp-artifact', fakeAgent)
    verificationToken = capabilities.issue('mcp-artifact', fakeAgent, 'verification')
    receiptArtifactId = `${artifactSessionPrefix(String(fakeAgent.id))}nested-app`
    const receiptVersion = await registry.create({
      id: receiptArtifactId, title: 'Nested app', summary: 'Receipt access fixture', requirements: [], capabilities: [],
      files: [{ path: 'src/main.tsx', content: 'export {}' }],
    })
    receiptVersionId = receiptVersion.id
    await registry.settle(receiptArtifactId, receiptVersionId, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const receiptCurrent = await registry.update({
      id: receiptArtifactId, baseVersionId: receiptVersionId, summary: 'Current receipt fixture', patches: [],
    })
    receiptCurrentVersionId = receiptCurrent.id
    await registry.settle(receiptArtifactId, receiptCurrentVersionId, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
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
    closeServer = () => new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
  }, 60_000)

  afterAll(async () => {
    await closeServer?.()
    await ctx?.fiber.dispose()
    if (root !== undefined) await rm(root, { recursive: true, force: true })
  })

  async function call(name: string, args: Record<string, unknown>): Promise<{ status: number; value: unknown }> {
    const response = await fetch(`${origin}/genui/api/mcp-artifact/tool`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ version_id: versionId, name, arguments: args }),
    })
    return { status: response.status, value: await response.json() }
  }

  async function post(action: string, value: Record<string, unknown>, bearer: string): Promise<{ status: number; value: unknown }> {
    const response = await fetch(`${origin}/genui/api/mcp-artifact/${action}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
      body: JSON.stringify({ version_id: versionId, ...value }),
    })
    return { status: response.status, value: await response.json() }
  }

  it('round-trips echo through the artifact capability and real MCP process', async () => {
    const pending = await call('mcp__everything__echo', { message: 'Code First' })
    expect(pending).toMatchObject({ status: 403, value: { code: 'approval_required', permission: { id: 'echo-service' } } })
    const grant = await post('permission/grant', { capability_id: 'echo-service' }, token)
    expect(grant).toMatchObject({ status: 200, value: { granted: true } })
    const listed = await post('permission/list', {}, token)
    expect(listed).toMatchObject({
      status: 200,
      value: { permissions: expect.arrayContaining([expect.objectContaining({ id: 'echo-service', granted: true })]) },
    })
    const result = await call('mcp__everything__echo', { message: 'Code First' })
    expect(result.status).toBe(200)
    expect(result.value).toMatchObject({ content: [{ type: 'text', text: 'Echo: Code First' }] })
  })

  it('revokes access from the task host', async () => {
    await post('permission/grant', { capability_id: 'echo-service' }, token)
    const revoked = await post('permission/revoke', { capability_id: 'echo-service' }, token)
    expect(revoked).toEqual({ status: 200, value: { revoked: true } })
    const listed = await post('permission/list', {}, token)
    expect(listed).toMatchObject({
      status: 200,
      value: { permissions: expect.arrayContaining([expect.objectContaining({ id: 'echo-service', granted: false })]) },
    })
    const result = await call('mcp__everything__echo', { message: 'blocked again' })
    expect(result).toMatchObject({ status: 403, value: { code: 'approval_required' } })
  })

  it('round-trips structured arithmetic through the real MCP process', async () => {
    await post('permission/grant', { capability_id: 'sum-service' }, token)
    const result = await call('mcp__everything__get-sum', { a: 19, b: 23 })
    expect(result.status).toBe(200)
    expect(JSON.stringify(result.value)).toContain('42')
  })

  it('blocks tools the artifact did not declare', async () => {
    const result = await call('mcp__everything__get-tiny-image', {})
    expect(result.status).toBe(403)
  })

  it('asks before connecting to a declared external API', async () => {
    const pending = await post('external', { url: 'https://api.example.com/v1/forecast', method: 'GET' }, token)
    expect(pending).toMatchObject({
      status: 403,
      value: { code: 'approval_required', permission: { id: 'public-weather', destination: 'api.example.com/v1/' } },
    })
    const grant = await post('permission/grant', { capability_id: 'public-weather' }, token)
    expect(grant).toMatchObject({ status: 200, value: { granted: true } })
  })

  it('grants every capability declared by one version in a single confirmation', async () => {
    for (const capabilityId of ['echo-service', 'sum-service', 'public-weather']) {
      await post('permission/revoke', { capability_id: capabilityId }, token)
    }
    const granted = await post('permission/grant-all', {}, token)
    expect(granted).toMatchObject({
      status: 200,
      value: {
        granted: true,
        permissions: expect.arrayContaining([
          expect.objectContaining({ id: 'echo-service' }),
          expect.objectContaining({ id: 'sum-service' }),
          expect.objectContaining({ id: 'public-weather' }),
        ]),
      },
    })
    const listed = await post('permission/list', {}, token)
    expect(listed).toMatchObject({
      status: 200,
      value: { version_id: versionId, permissions: expect.arrayContaining([
        expect.objectContaining({ id: 'echo-service', granted: true }),
        expect.objectContaining({ id: 'sum-service', granted: true }),
        expect.objectContaining({ id: 'public-weather', granted: true }),
      ]) },
    })
  })

  it('resolves stale and failed permission versions to the current ready version', async () => {
    const pruned = await post('permission/list', { version_id: 'pruned-version-no-longer-on-disk' }, token)
    expect(pruned).toMatchObject({ status: 200, value: { version_id: versionId } })

    const original = await registry.getVersion('mcp-artifact', versionId)
    const replacement = await registry.update({
      id: 'mcp-artifact',
      baseVersionId: versionId,
      summary: 'Replacement permission surface',
      patches: [],
      capabilities: [
        ...original.capabilities,
        { id: 'replacement-only', kind: 'tool', label: 'Replacement source', reason: 'Read data exposed only by the replacement version.', access: 'read', tool: 'mcp__everything__echo' },
      ],
    })
    await registry.settle('mcp-artifact', replacement.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })

    const stale = await post('permission/list', { version_id: versionId }, token)
    expect(stale).toMatchObject({
      status: 200,
      value: {
        version_id: replacement.id,
        permissions: expect.arrayContaining([expect.objectContaining({ id: 'replacement-only' })]),
      },
    })

    const recovery = await post('version/report-runtime-failure', { version_id: replacement.id }, token)
    expect(recovery).toMatchObject({
      status: 200,
      value: { failed_version_id: replacement.id, fallback_version_id: versionId },
    })
    const failed = await post('permission/list', { version_id: replacement.id }, token)
    expect(failed).toMatchObject({ status: 200, value: { version_id: versionId } })
    expect((failed.value as { permissions: Array<{ id: string }> }).permissions)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'replacement-only' })]))
  })

  it('cannot replay an older version capability after the current version removes it', async () => {
    await post('permission/grant', { version_id: versionId, capability_id: 'echo-service' }, token)
    await post('permission/grant', { version_id: versionId, capability_id: 'public-weather' }, token)
    const replacement = await registry.update({
      id: 'mcp-artifact',
      baseVersionId: versionId,
      summary: 'Remove capabilities from the current app',
      patches: [],
      capabilities: [],
    })
    await registry.settle('mcp-artifact', replacement.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })

    const replayedTool = await post('tool', {
      version_id: versionId,
      name: 'mcp__everything__echo',
      arguments: { message: 'must not run' },
    }, token)
    expect(replayedTool).toEqual({
      status: 409,
      value: { code: 'version_not_current', error: 'this app version is no longer active' },
    })
    const replayedExternal = await post('external', {
      version_id: versionId,
      url: 'https://api.example.com/v1/forecast',
      method: 'GET',
    }, token)
    expect(replayedExternal).toEqual({
      status: 409,
      value: { code: 'version_not_current', error: 'this app version is no longer active' },
    })

    const recovery = await post('version/report-runtime-failure', { version_id: replacement.id }, token)
    expect(recovery).toMatchObject({ status: 200, value: { fallback_version_id: versionId } })
  })

  it('blocks host-control actions attempted from a real opaque-origin iframe', async () => {
    for (const capabilityId of ['echo-service', 'sum-service', 'public-weather']) {
      await registry.revokeCapability('mcp-artifact', 'genui-mcp-e2e', capabilityId)
    }
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.goto(`${origin}/.well-known/dsh-genui`)
      const attempts = await page.evaluate(async config => {
        return new Promise<Array<{ status: number; error?: string }>>((resolve, reject) => {
          const channel = `host-control-${Math.random()}`
          const timeout = window.setTimeout(() => reject(new Error('opaque iframe did not answer')), 10_000)
          window.addEventListener('message', event => {
            if (event.data?.channel !== channel) return
            window.clearTimeout(timeout)
            if (typeof event.data.failure === 'string') reject(new Error(event.data.failure))
            else resolve(event.data.attempts as Array<{ status: number; error?: string }>)
          }, { once: false })
          const frame = document.createElement('iframe')
          frame.setAttribute('sandbox', 'allow-scripts')
          frame.srcdoc = `<script>
            const config = ${JSON.stringify({
              origin: config.origin, token: config.token, versionId: config.versionId,
              receiptArtifactId: config.receiptArtifactId, receiptVersionId: config.receiptVersionId, channel: '',
            })};
            config.channel = ${JSON.stringify(channel)};
            const actions = [
              ['permission/grant', { version_id: config.versionId, capability_id: 'echo-service' }],
              ['permission/grant-all', { version_id: config.versionId }],
              ['permission/revoke', { capability_id: 'echo-service' }],
              ['version/report-runtime-failure', { version_id: config.versionId }],
            ];
            const apiAttempts = actions.map(async ([action, body]) => {
              const response = await fetch(config.origin + '/genui/api/mcp-artifact/' + action, {
                method: 'POST',
                headers: { authorization: 'Bearer ' + config.token, 'content-type': 'application/json' },
                body: JSON.stringify(body),
              });
              const value = await response.json();
              return { status: response.status, error: value.error };
            });
            const receiptAttempt = fetch(config.origin + '/genui/host-control/preview-access', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                artifact_id: config.receiptArtifactId,
                version_id: config.receiptVersionId,
                session_id: 'genui-mcp-e2e',
              }),
            }).then(
              async response => ({ status: response.status, error: (await response.json()).error }),
              () => ({ status: 0, error: 'blocked by browser preflight' }),
            );
            Promise.all([...apiAttempts, receiptAttempt]).then(attempts => parent.postMessage({ channel: config.channel, attempts }, '*'))
              .catch(error => parent.postMessage({ channel: config.channel, failure: String(error) }, '*'));
          <\/script>`
          document.body.append(frame)
        })
      }, { origin, token, versionId, receiptArtifactId, receiptVersionId })

      expect(attempts.slice(0, 4)).toEqual(Array.from({ length: 4 }, () => ({
        status: 403,
        error: 'sandboxed apps cannot perform host control actions',
      })))
      expect(attempts[4]).toEqual({
        status: 0,
        error: 'blocked by browser preflight',
      })
    } finally {
      await browser.close()
    }
    expect(await registry.readGrants('mcp-artifact', 'genui-mcp-e2e')).toEqual({})
    expect(await registry.getVersion('mcp-artifact', versionId)).toMatchObject({ status: 'ready' })
    expect((await registry.get('mcp-artifact')).currentVersionId).toBe(versionId)
  }, 30_000)

  it('also rejects a cross-site host-control request without an opaque Origin header', async () => {
    const response = await fetch(`${origin}/genui/api/mcp-artifact/permission/grant`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        origin,
        'sec-fetch-site': 'cross-site',
      },
      body: JSON.stringify({ version_id: versionId, capability_id: 'echo-service' }),
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'sandboxed apps cannot perform host control actions' })
  })

  it('exchanges a pruned secret-free receipt for the owner session and binds it to current', async () => {
    const prunedVersionId = 'v-00000000-0000-0000-0000-000000000000'
    const browser = await chromium.launch({ headless: true })
    let result!: { status: number; value: {
      artifact_id: string
      title: string
      version_id: string
      preview_url: string
    } }
    try {
      const page = await browser.newPage()
      await page.goto(`${origin}/.well-known/dsh-genui`)
      result = await page.evaluate(async input => {
        const response = await fetch('/genui/host-control/preview-access', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
        })
        return { status: response.status, value: await response.json() as {
          artifact_id: string; title: string; version_id: string; preview_url: string
        } }
      }, {
        artifact_id: receiptArtifactId,
        version_id: prunedVersionId,
        session_id: 'genui-mcp-e2e',
      })
    } finally {
      await browser.close()
    }
    expect(result.status).toBe(200)
    const value = result.value
    expect(value).toMatchObject({
      artifact_id: receiptArtifactId,
      title: 'Nested app',
      version_id: receiptCurrentVersionId,
      preview_url: expect.stringMatching(new RegExp(`^/genui/preview/${receiptArtifactId}/${receiptCurrentVersionId}\\?lang=en#token=.+$`)),
    })
    const issued = new URL(value.preview_url, origin).hash.slice('#token='.length)
    expect(capabilities.resolve(issued, receiptArtifactId)).toMatchObject({
      sessionId: 'genui-mcp-e2e', mode: 'interactive',
    })
  })

  it('rejects opaque-origin, cross-site, wrong-session, and malformed receipt access', async () => {
    const request = (headers: Record<string, string>, body: Record<string, unknown>) => fetch(
      `${origin}/genui/host-control/preview-access`, {
        method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
      },
    )
    const valid = { artifact_id: receiptArtifactId, version_id: receiptVersionId, session_id: 'genui-mcp-e2e' }
    const opaque = await request({ origin: 'null', 'sec-fetch-site': 'same-origin' }, valid)
    expect(opaque.status).toBe(403)
    const crossSite = await request({ origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' }, valid)
    expect(crossSite.status).toBe(403)
    const wrongSession = await request({ origin, 'sec-fetch-site': 'same-origin' }, { ...valid, session_id: 'another-session' })
    expect(wrongSession.status).toBe(403)
    const malicious = await request({ origin, 'sec-fetch-site': 'same-origin' }, {
      ...valid, preview_url: `https://attacker.example/#token=stolen`,
    })
    expect(malicious.status).toBe(400)
  })

  it('serves preview document language explicitly', async () => {
    const zhResponse = await fetch(`${origin}/genui/preview/mcp-artifact/${versionId}?lang=zh#token=${token}`)
    expect(zhResponse.status).toBe(200)
    const previewCsp = zhResponse.headers.get('content-security-policy') ?? ''
    expect(previewCsp).toContain("connect-src 'none'")
    expect(previewCsp).toContain("frame-src 'none'")
    expect(previewCsp).toContain("form-action 'none'")
    expect(previewCsp).toContain('sandbox allow-scripts allow-modals')
    const zhDocument = await zhResponse.text()
    expect(zhDocument).toContain('<html lang="zh">')
    expect(zhDocument).toContain(`data-app-src="/genui/assets/mcp-artifact/${versionId}/app.js?runtime=${ARTIFACT_RUNTIME_VERSION}"`)
    expect(zhDocument).toContain(`<script src="/genui/bridge.js?runtime=${ARTIFACT_RUNTIME_VERSION}"></script>`)
    expect(zhDocument).not.toContain(`<script type="module" src="/genui/assets/mcp-artifact/${versionId}/app.js`)
    expect(zhDocument).toContain('<meta name="color-scheme" content="light dark">')
    expect(zhDocument).toContain('<meta name="theme-color" content="#faf9f6" media="(prefers-color-scheme: light)">')
    expect(zhDocument).toContain('<meta name="theme-color" content="#171717" media="(prefers-color-scheme: dark)">')

    const darkResponse = await fetch(`${origin}/genui/preview/mcp-artifact/${versionId}?lang=en&theme=dark#token=${token}`)
    expect(darkResponse.status).toBe(200)
    expect(await darkResponse.text()).toContain('<html lang="en" data-ds-dark-theme style="color-scheme:dark">')

    const lightResponse = await fetch(`${origin}/genui/preview/mcp-artifact/${versionId}?lang=en&theme=light#token=${token}`)
    expect(lightResponse.status).toBe(200)
    expect(await lightResponse.text()).toContain('<html lang="en" data-ds-light-theme style="color-scheme:light">')

    const invalidTheme = await fetch(`${origin}/genui/preview/mcp-artifact/${versionId}?lang=en&theme=sepia#token=${token}`)
    expect(invalidTheme.status).toBe(400)

    const missingLanguage = await fetch(`${origin}/genui/preview/mcp-artifact/${versionId}#token=${token}`)
    expect(missingLanguage.status).toBe(400)

    const bridge = await fetch(`${origin}/genui/bridge.js?runtime=${ARTIFACT_RUNTIME_VERSION}`)
    expect(bridge.status).toBe(200)
    expect(bridge.headers.get('content-type')).toContain('text/javascript')
    expect(await bridge.text()).toContain("const BRIDGE_TOKEN = 'bridge-v1'")

    const standalone = await fetch(`${origin}/genui/app/mcp-artifact?lang=en#token=${token}`)
    expect(standalone.status).toBe(200)
    const hostCsp = standalone.headers.get('content-security-policy') ?? ''
    expect(hostCsp).toContain("connect-src 'self'")
    expect(hostCsp).toContain("frame-src 'self'")
    expect(hostCsp).not.toContain('sandbox')
  })

  it('manages the default DESIGN.md through the same-origin Harness surface', async () => {
    const discovery = await fetch(`${origin}/.well-known/dsh-genui`)
    expect(await discovery.json()).toEqual({ route_prefix: '/genui' })

    const initial = await fetch(`${origin}/genui/manage/designs`).then(response => response.json()) as {
      default_design_id: string | null
      designs: Array<{ id: string; builtin: boolean }>
    }
    expect(initial.default_design_id).toBeNull()
    expect(initial.designs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'material-3', builtin: true }),
      expect.objectContaining({ id: 'apple-human-interface', builtin: true }),
      expect.objectContaining({ id: 'shadcn-ui', builtin: true }),
    ]))

    const imported = await fetch(`${origin}/genui/manage/designs/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ design_id: 'home-journal', content: '# Home Journal\n\nUse warm paper.\n' }),
    }).then(response => response.json()) as { default_design_id: string }
    expect(imported.default_design_id).toBe('home-journal')

    const exported = await fetch(`${origin}/genui/manage/designs/home-journal`).then(response => response.json()) as {
      filename: string
      content: string
    }
    expect(exported).toMatchObject({ filename: 'DESIGN.md', content: expect.stringContaining('warm paper') })
    const download = await fetch(`${origin}/genui/manage/designs/home-journal?download=1`)
    expect(download.headers.get('content-disposition')).toBe('attachment; filename="DESIGN.md"')
    expect(await download.text()).toContain('warm paper')

    const automatic = await fetch(`${origin}/genui/manage/designs/default`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ design_id: null }),
    }).then(response => response.json()) as { default_design_id: null }
    expect(automatic.default_design_id).toBeNull()

    const crossSite = await fetch(`${origin}/genui/manage/designs`, { headers: { 'sec-fetch-site': 'cross-site' } })
    expect(crossSite.status).toBe(403)

    const differentPortSameSite = await fetch(`${origin}/genui/manage/designs`, { headers: { 'sec-fetch-site': 'same-site' } })
    expect(differentPortSameSite.status).toBe(403)

    const plainTextMutation = await fetch(`${origin}/genui/manage/designs/default`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ design_id: 'home-journal' }),
    })
    expect(plainTextMutation.status).toBe(403)
    const unchanged = await fetch(`${origin}/genui/manage/designs`).then(response => response.json()) as { default_design_id: string | null }
    expect(unchanged.default_design_id).toBeNull()
  })

  it('dry-runs state writes and returns inert tool data during browser verification', async () => {
    const write = await post('state/write', { key: 'candidate', value: 1 }, verificationToken)
    expect(write).toEqual({ status: 200, value: { ok: true, persisted: false } })
    const tool = await post('tool', { name: 'mcp__everything__echo', arguments: { message: 'blocked' } }, verificationToken)
    expect(tool).toEqual({ status: 200, value: { content: [], structuredContent: null, verification: true } })
    const external = await post('external', { url: 'https://api.example.com/v1/forecast', method: 'GET' }, verificationToken)
    expect(external).toEqual({ status: 200, value: { status: 204, headers: {}, body: 'null', verification: true } })
    const undeclared = await post('tool', { name: 'mcp__everything__get-tiny-image', arguments: {} }, verificationToken)
    expect(undeclared.status).toBe(403)
    expect((await registry.get('mcp-artifact')).states).toEqual({})
  })

  it('bounds persisted task state by encoded size and key count', async () => {
    const sessionId = 'genui-mcp-e2e'
    await registry.updateState('mcp-artifact', sessionId, () => Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [`chunk-${index}`, 'x'.repeat(60 * 1024)]),
    ))
    const tooLarge = await post('state/write', { key: 'chunk-8', value: 'x'.repeat(60 * 1024) }, token)
    expect(tooLarge).toMatchObject({ status: 400, value: { error: expect.stringContaining('524288 bytes') } })

    await registry.updateState('mcp-artifact', sessionId, () => Object.fromEntries(
      Array.from({ length: 128 }, (_, index) => [`key-${index}`, index]),
    ))
    const tooMany = await post('state/write', { key: 'key-128', value: true }, token)
    expect(tooMany).toMatchObject({ status: 400, value: { error: expect.stringContaining('128 keys') } })

    await registry.updateState('mcp-artifact', sessionId, () => Object.fromEntries(
      Array.from({ length: 129 }, (_, index) => [`legacy-key-${index}`, index]),
    ))
    const replaceLegacyKey = await post('state/write', { key: 'legacy-key-0', value: 0 }, token)
    expect(replaceLegacyKey).toEqual({ status: 200, value: { ok: true, persisted: true } })
    const growLegacyKeys = await post('state/write', { key: 'legacy-key-129', value: true }, token)
    expect(growLegacyKeys).toMatchObject({ status: 400, value: { error: expect.stringContaining('128 keys') } })

    await registry.updateState('mcp-artifact', sessionId, () => ({ 'legacy-large-value': 'x'.repeat(70 * 1024) }))
    const shrinkLegacyValue = await post('state/write', { key: 'legacy-large-value', value: 'x'.repeat(69 * 1024) }, token)
    expect(shrinkLegacyValue).toEqual({ status: 200, value: { ok: true, persisted: true } })
    const growLegacyValue = await post('state/write', { key: 'legacy-large-value', value: 'x'.repeat(71 * 1024) }, token)
    expect(growLegacyValue).toMatchObject({ status: 400, value: { error: expect.stringContaining('64 KiB') } })

    await registry.updateState('mcp-artifact', sessionId, () => Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [`legacy-chunk-${index}`, 'x'.repeat(60 * 1024)]),
    ))
    const shrinkLegacyBytes = await post('state/write', { key: 'legacy-chunk-0', value: 'x'.repeat(59 * 1024) }, token)
    expect(shrinkLegacyBytes).toEqual({ status: 200, value: { ok: true, persisted: true } })
    const growLegacyBytes = await post('state/write', { key: 'legacy-chunk-0', value: 'x'.repeat(60 * 1024) }, token)
    expect(growLegacyBytes).toMatchObject({ status: 400, value: { error: expect.stringContaining('524288 bytes') } })
  })
})
