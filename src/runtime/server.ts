import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import { TASK_STATE_TTL_MS, type ArtifactRegistry } from '../artifacts/registry.ts'
import { safeJoin } from '../artifacts/paths.ts'
import type { DesignStore } from '../designs/store.ts'
import type { CapabilityStore } from './capabilities.ts'
import { requestExternal } from './external.ts'
import {
  capabilityById, capabilityFingerprint, externalCapability, isGranted, permissionView, toolCapability,
} from './permissions.ts'

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join('; ')

const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

const ARTIFACT_RUNTIME_VERSION = '0.10.1'

function json(res: ServerResponse, status: number, value: unknown, req?: IncomingMessage): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(req?.headers.origin === 'null' ? { 'access-control-allow-origin': 'null', vary: 'Origin' } : {}),
  })
  res.end(JSON.stringify(value))
}

async function body(req: IncomingMessage, limit = 256 * 1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw new Error('request body is too large')
    chunks.push(buffer)
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('request body must be an object')
  return parsed as Record<string, unknown>
}

function bearer(req: IncomingMessage): string | undefined {
  const value = req.headers.authorization
  return value?.startsWith('Bearer ') ? value.slice(7) : undefined
}

function acceptsManagementRequest(req: IncomingMessage): boolean {
  return req.headers['sec-fetch-site'] !== 'cross-site'
}

async function designSettings(designs: DesignStore): Promise<Record<string, unknown>> {
  return {
    default_design_id: designs.defaultId() ?? null,
    designs: (await designs.list()).map(design => ({ ...design, builtin: designs.isBuiltin(design.id) })),
  }
}

function html(routePrefix: string, artifactId: string, versionId: string, hasCss: boolean, language: 'en' | 'zh'): string {
  const css = hasCss ? `<link rel="stylesheet" href="${routePrefix}/assets/${artifactId}/${versionId}/app.css?runtime=${ARTIFACT_RUNTIME_VERSION}">` : ''
  return `<!doctype html>
<html lang="${language}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="theme-color" content="#faf9f6" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#171717" media="(prefers-color-scheme: dark)">${css}</head>
<body><div id="root" data-artifact-id="${artifactId}" data-version-id="${versionId}" data-api-base="${routePrefix}/api/${artifactId}"></div><script type="module" src="${routePrefix}/assets/${artifactId}/${versionId}/app.js?runtime=${ARTIFACT_RUNTIME_VERSION}"></script></body></html>`
}

export interface GenuiHttpRuntime {
  handler(req: IncomingMessage, res: ServerResponse): Promise<void>
}

export function createHttpRuntime(
  ctx: Context,
  registry: ArtifactRegistry,
  designs: DesignStore,
  capabilities: CapabilityStore,
  routePrefix: string,
): GenuiHttpRuntime {
  return {
    async handler(req, res) {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (req.method === 'GET' && url.pathname === '/.well-known/dsh-genui') {
          if (!acceptsManagementRequest(req)) return json(res, 403, { error: 'cross-site management requests are not allowed' })
          json(res, 200, { route_prefix: routePrefix })
          return
        }
        const relative = url.pathname.slice(routePrefix.length).split('/').filter(Boolean).map(decodeURIComponent)
        if (relative[0] === 'manage') {
          if (!acceptsManagementRequest(req)) return json(res, 403, { error: 'cross-site management requests are not allowed' })
          if (req.method === 'GET' && relative.length === 2 && relative[1] === 'designs') {
            json(res, 200, await designSettings(designs))
            return
          }
          if (req.method === 'GET' && relative.length === 3 && relative[1] === 'designs') {
            const design = await designs.get(relative[2] ?? '')
            if (url.searchParams.get('download') === '1') {
              res.writeHead(200, {
                'content-type': 'text/markdown; charset=utf-8',
                'content-disposition': 'attachment; filename="DESIGN.md"',
                'cache-control': 'no-store',
                'x-content-type-options': 'nosniff',
              })
              res.end(design.content)
              return
            }
            json(res, 200, { design_id: design.id, title: design.title, filename: 'DESIGN.md', content: design.content })
            return
          }
          if (req.method === 'POST' && relative.length === 3 && relative[1] === 'designs' && relative[2] === 'default') {
            const input = await body(req)
            if (input.design_id !== null && typeof input.design_id !== 'string') throw new Error('design_id must be a design id or null')
            await designs.setDefault(typeof input.design_id === 'string' ? input.design_id : undefined)
            json(res, 200, await designSettings(designs))
            return
          }
          if (req.method === 'POST' && relative.length === 3 && relative[1] === 'designs' && relative[2] === 'import') {
            const input = await body(req, 128 * 1024)
            if (typeof input.design_id !== 'string' || typeof input.content !== 'string') throw new Error('design_id and content are required')
            const design = await designs.put(input.design_id, input.content)
            await designs.setDefault(design.id)
            json(res, 200, await designSettings(designs))
            return
          }
          return json(res, 404, { error: 'unknown GenUI management action' })
        }
        if (req.method === 'GET' && relative[0] === 'preview' && relative.length === 3) {
          const [, artifactId = '', versionId = ''] = relative
          const language = url.searchParams.get('lang')
          if (language !== 'en' && language !== 'zh') return json(res, 400, { error: 'preview language must be en or zh' })
          const version = await registry.getVersion(artifactId, versionId)
          if (version.status === 'failed') return json(res, 409, { error: 'artifact version failed validation' })
          const cssPath = safeJoin(registry.distPath(artifactId, versionId), 'app.css')
          const hasCss = await stat(cssPath).then(() => true, () => false)
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': CSP,
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
          })
          res.end(html(routePrefix, artifactId, versionId, hasCss, language))
          return
        }
        if (req.method === 'GET' && relative[0] === 'assets' && relative.length >= 4) {
          const [, artifactId = '', versionId = '', ...assetParts] = relative
          await registry.getVersion(artifactId, versionId)
          const assetPath = safeJoin(registry.distPath(artifactId, versionId), ...assetParts)
          const content = await readFile(assetPath)
          res.writeHead(200, {
            'content-type': MIME[extname(assetPath)] ?? 'application/octet-stream',
            'content-security-policy': CSP,
            'cache-control': 'private, max-age=31536000, immutable',
            'x-content-type-options': 'nosniff',
            ...(req.headers.origin === 'null' ? { 'access-control-allow-origin': 'null', vary: 'Origin' } : {}),
          })
          res.end(content)
          return
        }
        if (req.method === 'OPTIONS' && relative[0] === 'api' && relative.length >= 3) {
          if (req.headers.origin !== 'null') return json(res, 403, { error: 'artifact API preflight requires a sandboxed origin' })
          res.writeHead(204, {
            'access-control-allow-origin': 'null',
            'access-control-allow-methods': 'POST',
            'access-control-allow-headers': 'authorization, content-type',
            'access-control-max-age': '600',
            vary: 'Origin',
          })
          res.end()
          return
        }
        if (req.method === 'POST' && relative[0] === 'api' && relative.length >= 3) {
          const [, artifactId = '', ...actionParts] = relative
          const capability = capabilities.resolve(bearer(req) ?? '', artifactId)
          if (capability === undefined) return json(res, 401, { error: 'invalid or expired artifact capability' }, req)
          const input = await body(req)
          const action = actionParts.join('/')
          if (action === 'state/read') {
            if (typeof input.key !== 'string' || input.key.length > 128) throw new Error('invalid state key')
            if (capability.mode === 'verification') return json(res, 200, { found: false }, req)
            const state = await registry.readState(artifactId, capability.sessionId)
            const found = state !== undefined && Object.hasOwn(state.values, input.key)
            json(res, 200, { found, ...(found ? { value: state.values[input.key] } : {}) }, req)
            return
          }
          if (action === 'state/write') {
            if (typeof input.key !== 'string' || input.key.length > 128) throw new Error('invalid state key')
            const serialized = JSON.stringify(input.value)
            if (serialized === undefined || Buffer.byteLength(serialized) > 64 * 1024) throw new Error('state value must be JSON under 64 KiB')
            if (capability.mode === 'verification') {
              json(res, 200, { ok: true, persisted: false }, req)
              return
            }
            await registry.updateState(artifactId, capability.sessionId, state => ({ ...state, [input.key as string]: input.value }))
            json(res, 200, { ok: true, persisted: true }, req)
            return
          }
          if (action === 'permission/grant') {
            if (capability.mode === 'verification') return json(res, 403, { error: 'permissions cannot be granted during verification' }, req)
            if (typeof input.version_id !== 'string' || typeof input.capability_id !== 'string') throw new Error('version_id and capability_id are required')
            const version = await registry.getVersion(artifactId, input.version_id)
            const requested = capabilityById(version, input.capability_id)
            if (requested === undefined) return json(res, 404, { error: 'requested permission no longer exists' }, req)
            await registry.grantCapability(artifactId, capability.sessionId, requested.id, {
              fingerprint: capabilityFingerprint(requested),
              grantedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + TASK_STATE_TTL_MS).toISOString(),
            })
            json(res, 200, { granted: true, permission: permissionView(requested) }, req)
            return
          }
          if (action === 'tool') {
            if (typeof input.version_id !== 'string' || typeof input.name !== 'string' || input.name.startsWith('genui_')) throw new Error('invalid connected action')
            const version = await registry.getVersion(artifactId, input.version_id)
            const requested = toolCapability(version, input.name)
            if (requested === undefined) return json(res, 403, { code: 'capability_not_declared', error: 'this app did not declare the connected action' }, req)
            if (capability.mode === 'verification') {
              return json(res, 200, { content: [], structuredContent: null, verification: true }, req)
            }
            const record = await registry.get(artifactId)
            if (!isGranted(record, capability.sessionId, requested)) {
              return json(res, 403, { code: 'approval_required', permission: permissionView(requested) }, req)
            }
            const result = await ctx.tools.execute({
              callId: CallId(`genui-${Date.now()}-${Math.random().toString(36).slice(2)}`),
              name: input.name,
              arguments: input.arguments ?? {},
              agent: capability.agent,
              signal: AbortSignal.timeout(60_000),
            })
            if (result.isError) return json(res, 502, { error: result.error.message, code: result.error.info?.code }, req)
            json(res, 200, result.value, req)
            return
          }
          if (action === 'external') {
            if (typeof input.version_id !== 'string' || typeof input.url !== 'string') throw new Error('version_id and url are required')
            const method = typeof input.method === 'string' ? input.method.toUpperCase() : 'GET'
            const target = new URL(input.url)
            const version = await registry.getVersion(artifactId, input.version_id)
            const requested = externalCapability(version, target, method)
            if (requested === undefined) return json(res, 403, { code: 'capability_not_declared', error: 'this app did not declare access to that service' }, req)
            if (capability.mode === 'verification') {
              return json(res, 200, { status: 204, headers: {}, body: 'null', verification: true }, req)
            }
            const record = await registry.get(artifactId)
            if (!isGranted(record, capability.sessionId, requested)) {
              return json(res, 403, { code: 'approval_required', permission: permissionView(requested) }, req)
            }
            const result = await requestExternal({
              url: target.toString(),
              method,
              ...(typeof input.headers === 'object' && input.headers !== null && !Array.isArray(input.headers)
                ? { headers: input.headers as Record<string, unknown> } : {}),
              ...(input.body === undefined ? {} : { body: input.body }),
            }, AbortSignal.timeout(30_000))
            json(res, 200, result, req)
            return
          }
          return json(res, 404, { error: 'unknown GenUI API action' }, req)
        }
        json(res, 404, { error: 'not found' })
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') return json(res, 404, { error: 'artifact resource not found' })
        json(res, 400, { error: error instanceof Error ? error.message : String(error) }, req)
      }
    },
  }
}
