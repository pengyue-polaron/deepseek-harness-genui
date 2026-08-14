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
    const result = await call('mcp__everything__echo', { message: 'Code First' })
    expect(result.status).toBe(200)
    expect(result.value).toMatchObject({ content: [{ type: 'text', text: 'Echo: Code First' }] })
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
    expect(zhDocument).toContain('app.js?runtime=0.8.4')
    expect(zhDocument).toContain('<meta name="color-scheme" content="light dark">')

    const missingLanguage = await fetch(`${origin}/genui/preview/mcp-artifact/${versionId}#token=${token}`)
    expect(missingLanguage.status).toBe(400)
  })

  it('dry-runs state writes and returns inert tool data during browser verification', async () => {
    const write = await post('state/write', { key: 'candidate', value: 1 }, verificationToken)
    expect(write).toEqual({ status: 200, value: { ok: true, persisted: false } })
    const tool = await post('tool', { name: 'mcp__everything__echo', arguments: { message: 'blocked' } }, verificationToken)
    expect(tool).toEqual({ status: 200, value: { content: [], structuredContent: null, verification: true } })
    const external = await post('external', { url: 'https://api.example.com/v1/forecast', method: 'GET' }, verificationToken)
    expect(external).toEqual({ status: 200, value: { status: 204, headers: {}, body: null, verification: true } })
    const undeclared = await post('tool', { name: 'mcp__everything__get-tiny-image', arguments: {} }, verificationToken)
    expect(undeclared.status).toBe(403)
    expect((await registry.get('mcp-artifact')).states).toEqual({})
  })
})
