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
import { ArtifactRegistry } from '../src/artifacts/registry.ts'
import { DesignStore } from '../src/designs/store.ts'
import { CapabilityStore } from '../src/runtime/capabilities.ts'
import { createHttpRuntime } from '../src/runtime/server.ts'

describe('real MCP artifact bridge', () => {
  let ctx: Context
  let root: string
  let registry: ArtifactRegistry
  let origin: string
  let closeServer: () => Promise<void>
  let token: string
  let verificationToken: string
  let versionId: string

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
    const capabilities = new CapabilityStore()
    const fakeAgent = {
      id: SessionId('genui-mcp-e2e'),
      ctx,
    } as unknown as Agent
    token = capabilities.issue('mcp-artifact', fakeAgent)
    verificationToken = capabilities.issue('mcp-artifact', fakeAgent, 'verification')
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
      value: { code: 'approval_required', permission: { id: 'public-weather', destination: 'api.example.com' } },
    })
    const grant = await post('permission/grant', { capability_id: 'public-weather' }, token)
    expect(grant).toMatchObject({ status: 200, value: { granted: true } })
  })

  it('serves preview document language explicitly', async () => {
    const zhResponse = await fetch(`${origin}/genui/preview/mcp-artifact/${versionId}?lang=zh#token=${token}`)
    expect(zhResponse.status).toBe(200)
    const zhDocument = await zhResponse.text()
    expect(zhDocument).toContain('<html lang="zh">')
    expect(zhDocument).toContain('app.js?runtime=0.12.1')
    expect(zhDocument).toContain('<meta name="color-scheme" content="light dark">')
    expect(zhDocument).toContain('<meta name="theme-color" content="#faf9f6" media="(prefers-color-scheme: light)">')
    expect(zhDocument).toContain('<meta name="theme-color" content="#171717" media="(prefers-color-scheme: dark)">')

    const missingLanguage = await fetch(`${origin}/genui/preview/mcp-artifact/${versionId}#token=${token}`)
    expect(missingLanguage.status).toBe(400)
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
      expect.objectContaining({ id: 'editorial-workbench', builtin: true }),
      expect.objectContaining({ id: 'field-atlas', builtin: true }),
      expect.objectContaining({ id: 'kinetic-signal', builtin: true }),
      expect.objectContaining({ id: 'ledger-grid', builtin: true }),
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
})
