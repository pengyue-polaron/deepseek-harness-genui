import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import type { ArtifactRegistry } from '../artifacts/registry.ts'
import { TASK_TTL_MS } from '../lifecycle.ts'
import { safeJoin } from '../artifacts/paths.ts'
import type { DesignStore } from '../designs/store.ts'
import type { CapabilityStore } from './capabilities.ts'
import { requestExternal } from './external.ts'
import {
  capabilityById, capabilityFingerprint, externalCapability, isGranted, permissionView, toolCapability,
} from './permissions.ts'
import { BRIDGE_RUNTIME } from './bridge.ts'
import { ARTIFACT_RUNTIME_VERSION, STANDALONE_RUNTIME, standaloneHtml } from './standalone.ts'

const CSP_BASE = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
]
const HOST_CSP = [...CSP_BASE, "connect-src 'self'", "frame-src 'self'"].join('; ')
const PREVIEW_CSP = [...CSP_BASE, "connect-src 'none'", "frame-src 'none'", 'sandbox allow-scripts allow-modals'].join('; ')

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

const MAX_STATE_KEYS = 128
const MAX_STATE_BYTES = 512 * 1024
const ARTIFACT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/
const VERSION_ID_PATTERN = /^v-[a-f0-9-]{36}$/
const HOST_CONTROL_ACTIONS = new Set([
  'permission/grant',
  'permission/grant-all',
  'permission/revoke',
  'version/report-runtime-failure',
])

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
  const fetchSite = req.headers['sec-fetch-site']
  if (fetchSite !== undefined && fetchSite !== 'same-origin') return false
  if (req.method !== 'POST') return true
  return req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
}

function acceptsHostControlRequest(req: IncomingMessage): boolean {
  return req.headers.origin !== 'null' && req.headers['sec-fetch-site'] !== 'cross-site'
}

function acceptsReceiptAccessRequest(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  const host = req.headers.host
  if (typeof origin !== 'string' || typeof host !== 'string' || req.headers['sec-fetch-site'] !== 'same-origin') return false
  try {
    const parsed = new URL(origin)
    return parsed.origin === origin && parsed.host === host && (parsed.protocol === 'http:' || parsed.protocol === 'https:')
  } catch {
    return false
  }
}

async function designSettings(designs: DesignStore): Promise<Record<string, unknown>> {
  return {
    default_design_id: designs.defaultId() ?? null,
    designs: (await designs.list()).map(design => ({ ...design, builtin: designs.isBuiltin(design.id) })),
  }
}

function html(
  routePrefix: string,
  artifactId: string,
  versionId: string,
  hasCss: boolean,
  language: 'en' | 'zh',
  theme?: 'dark' | 'light',
): string {
  const css = hasCss ? `<link rel="stylesheet" href="${routePrefix}/assets/${artifactId}/${versionId}/app.css?runtime=${ARTIFACT_RUNTIME_VERSION}">` : ''
  const appSrc = `${routePrefix}/assets/${artifactId}/${versionId}/app.js?runtime=${ARTIFACT_RUNTIME_VERSION}`
  return `<!doctype html>
	<html lang="${language}"${theme === 'dark' ? ' data-ds-dark-theme' : theme === 'light' ? ' data-ds-light-theme' : ''}${theme === undefined ? '' : ` style="color-scheme:${theme}"`}><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="theme-color" content="#faf9f6" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#171717" media="(prefers-color-scheme: dark)">${css}</head>
	<body><div id="root" data-artifact-id="${artifactId}" data-version-id="${versionId}" data-api-base="${routePrefix}/api/${artifactId}" data-app-src="${appSrc}"></div><script src="${routePrefix}/bridge.js?runtime=${ARTIFACT_RUNTIME_VERSION}"></script></body></html>`
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
        if (req.method === 'GET' && relative.length === 1 && relative[0] === 'standalone.js') {
          res.writeHead(200, {
            'content-type': 'text/javascript; charset=utf-8',
            'content-security-policy': HOST_CSP,
            'cache-control': 'private, max-age=31536000, immutable',
            'x-content-type-options': 'nosniff',
          })
          res.end(STANDALONE_RUNTIME)
          return
        }
        if (req.method === 'GET' && relative.length === 1 && relative[0] === 'bridge.js') {
          res.writeHead(200, {
            'content-type': 'text/javascript; charset=utf-8',
            'content-security-policy': HOST_CSP,
            'cache-control': 'private, max-age=31536000, immutable',
            'x-content-type-options': 'nosniff',
          })
          res.end(BRIDGE_RUNTIME)
          return
        }
        if (req.method === 'GET' && relative[0] === 'app' && relative.length === 2) {
          const artifactId = relative[1] ?? ''
          const language = url.searchParams.get('lang')
          if (language !== 'en' && language !== 'zh') return json(res, 400, { error: 'app language must be en or zh' })
          const artifact = await registry.get(artifactId)
          if (artifact.currentVersionId === undefined) return json(res, 409, { error: 'app has no ready version' })
          const version = await registry.getVersion(artifactId, artifact.currentVersionId)
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': HOST_CSP,
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
          })
          res.end(standaloneHtml(routePrefix, artifactId, version.id, artifact.title, language))
          return
        }
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
        if (req.method === 'OPTIONS' && relative.length === 2
          && relative[0] === 'host-control' && relative[1] === 'preview-access') {
          return json(res, 403, { error: 'preview access requires the same-origin Harness host' }, req)
        }
        if (req.method === 'POST' && relative.length === 2
          && relative[0] === 'host-control' && relative[1] === 'preview-access') {
          if (!acceptsReceiptAccessRequest(req)) {
            return json(res, 403, { error: 'preview access requires the same-origin Harness host' }, req)
          }
          const input = await body(req, 16 * 1024)
          if (Object.keys(input).some(key => !['artifact_id', 'version_id', 'session_id'].includes(key))
            || typeof input.artifact_id !== 'string' || typeof input.version_id !== 'string'
            || typeof input.session_id !== 'string' || input.session_id.length === 0 || input.session_id.length > 512
            || !ARTIFACT_ID_PATTERN.test(input.artifact_id) || !VERSION_ID_PATTERN.test(input.version_id)) {
            throw new Error('artifact_id, version_id, and session_id are required')
          }
          const artifactId = input.artifact_id
          const artifact = await registry.get(artifactId)
          if (artifact.currentVersionId === undefined) return json(res, 409, { error: 'app has no ready version' }, req)
          const currentVersion = await registry.getVersion(artifactId, artifact.currentVersionId)
          if (currentVersion.status !== 'ready' || currentVersion.artifactId !== artifactId) {
            return json(res, 409, { error: 'app has no current ready version' }, req)
          }
          const token = capabilities.issueForSession(artifactId, input.session_id)
          if (token === undefined) return json(res, 403, { error: 'artifact does not belong to this live task' }, req)
          json(res, 200, {
            artifact_id: artifactId,
            title: artifact.title,
            version_id: currentVersion.id,
            preview_url: `${routePrefix}/preview/${encodeURIComponent(artifactId)}/${encodeURIComponent(currentVersion.id)}?lang=en#token=${token}`,
          }, req)
          return
        }
        if (req.method === 'GET' && relative[0] === 'preview' && relative.length === 3) {
          const [, artifactId = '', versionId = ''] = relative
          const language = url.searchParams.get('lang')
          const requestedTheme = url.searchParams.get('theme')
          if (language !== 'en' && language !== 'zh') return json(res, 400, { error: 'preview language must be en or zh' })
          if (requestedTheme !== null && requestedTheme !== 'dark' && requestedTheme !== 'light') return json(res, 400, { error: 'preview theme must be dark or light' })
          const version = await registry.getVersion(artifactId, versionId)
          if (version.status === 'failed') return json(res, 409, { error: 'artifact version failed validation' })
          const cssPath = safeJoin(registry.distPath(artifactId, versionId), 'app.css')
          const hasCss = await stat(cssPath).then(() => true, () => false)
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': PREVIEW_CSP,
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
          })
          res.end(html(routePrefix, artifactId, versionId, hasCss, language, requestedTheme ?? undefined))
          return
        }
        if (req.method === 'GET' && relative[0] === 'assets' && relative.length >= 4) {
          const [, artifactId = '', versionId = '', ...assetParts] = relative
          await registry.getVersion(artifactId, versionId)
          const assetPath = safeJoin(registry.distPath(artifactId, versionId), ...assetParts)
          const content = await readFile(assetPath)
          res.writeHead(200, {
            'content-type': MIME[extname(assetPath)] ?? 'application/octet-stream',
            'content-security-policy': PREVIEW_CSP,
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
          const action = actionParts.join('/')
          if (HOST_CONTROL_ACTIONS.has(action) && !acceptsHostControlRequest(req)) {
            return json(res, 403, { error: 'sandboxed apps cannot perform host control actions' }, req)
          }
          const input = await body(req)
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
            if (serialized === undefined) throw new Error('state value must be JSON')
            const nextValueBytes = Buffer.byteLength(serialized)
            if (capability.mode === 'verification') {
              json(res, 200, { ok: true, persisted: false }, req)
              return
            }
            await registry.updateState(artifactId, capability.sessionId, state => {
              const currentSerialized = JSON.stringify(state[input.key as string])
              const currentValueBytes = currentSerialized === undefined ? 0 : Buffer.byteLength(currentSerialized)
              if (nextValueBytes > 64 * 1024 && nextValueBytes > currentValueBytes) {
                throw new Error('state value cannot grow beyond 64 KiB')
              }
              const next = { ...state, [input.key as string]: input.value }
              const currentKeyCount = Object.keys(state).length
              const nextKeyCount = Object.keys(next).length
              const currentBytes = Buffer.byteLength(JSON.stringify(state))
              const nextBytes = Buffer.byteLength(JSON.stringify(next))
              if (nextKeyCount > MAX_STATE_KEYS && nextKeyCount > currentKeyCount) {
                throw new Error(`task state cannot exceed ${MAX_STATE_KEYS} keys`)
              }
              if (nextBytes > MAX_STATE_BYTES && nextBytes > currentBytes) {
                throw new Error(`task state cannot exceed ${MAX_STATE_BYTES} bytes`)
              }
              return next
            })
            json(res, 200, { ok: true, persisted: true }, req)
            return
          }
          if (action === 'version/report-runtime-failure') {
            if (capability.mode === 'verification') return json(res, 403, { error: 'runtime failures cannot be reported during verification' }, req)
            if (typeof input.version_id !== 'string') throw new Error('version_id is required')
            const recovery = await registry.reportRuntimeFailure(artifactId, input.version_id)
            json(res, 200, {
              reported: true,
              failed_version_id: recovery.failedVersionId,
              ...(recovery.fallbackVersionId === undefined ? {} : { fallback_version_id: recovery.fallbackVersionId }),
            }, req)
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
              expiresAt: new Date(Date.now() + TASK_TTL_MS).toISOString(),
            })
            json(res, 200, { granted: true, permission: permissionView(requested) }, req)
            return
          }
          if (action === 'permission/grant-all') {
            if (capability.mode === 'verification') return json(res, 403, { error: 'permissions cannot be granted during verification' }, req)
            if (typeof input.version_id !== 'string') throw new Error('version_id is required')
            const version = await registry.getVersion(artifactId, input.version_id)
            const grantedAt = new Date()
            const expiresAt = new Date(grantedAt.valueOf() + TASK_TTL_MS).toISOString()
            await registry.grantCapabilities(artifactId, capability.sessionId, Object.fromEntries(
              version.capabilities.map(item => [item.id, {
                fingerprint: capabilityFingerprint(item),
                grantedAt: grantedAt.toISOString(),
                expiresAt,
              }]),
            ))
            json(res, 200, { granted: true, permissions: version.capabilities.map(permissionView) }, req)
            return
          }
          if (action === 'permission/list') {
            if (typeof input.version_id !== 'string') throw new Error('version_id is required')
            const artifact = await registry.get(artifactId)
            if (artifact.currentVersionId === undefined) {
              return json(res, 409, { code: 'no_ready_version', error: 'app has no ready version' }, req)
            }
            const canonicalVersionId = artifact.currentVersionId
            const version = await registry.getVersion(artifactId, canonicalVersionId)
            const grants = capability.mode === 'verification' ? {} : await registry.readGrants(artifactId, capability.sessionId)
            json(res, 200, {
              version_id: version.id,
              permissions: version.capabilities.map(item => ({
                ...permissionView(item),
                granted: grants[item.id]?.fingerprint === capabilityFingerprint(item),
              })),
            }, req)
            return
          }
          if (action === 'permission/revoke') {
            if (capability.mode === 'verification') return json(res, 403, { error: 'permissions cannot be changed during verification' }, req)
            if (typeof input.capability_id !== 'string') throw new Error('capability_id is required')
            const revoked = await registry.revokeCapability(artifactId, capability.sessionId, input.capability_id)
            json(res, 200, { revoked }, req)
            return
          }
          if (action === 'tool') {
            if (typeof input.version_id !== 'string' || typeof input.name !== 'string' || input.name.startsWith('genui_')) throw new Error('invalid connected action')
            const version = await registry.getVersion(artifactId, input.version_id)
            const record = capability.mode === 'verification' ? undefined : await registry.get(artifactId)
            if (record !== undefined && record.currentVersionId !== version.id) {
              return json(res, 409, { code: 'version_not_current', error: 'this app version is no longer active' }, req)
            }
            const requested = toolCapability(version, input.name)
            if (requested === undefined) return json(res, 403, { code: 'capability_not_declared', error: 'this app did not declare the connected action' }, req)
            if (capability.mode === 'verification') {
              return json(res, 200, { content: [], structuredContent: null, verification: true }, req)
            }
            if (!isGranted(record!, capability.sessionId, requested)) {
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
            const record = capability.mode === 'verification' ? undefined : await registry.get(artifactId)
            if (record !== undefined && record.currentVersionId !== version.id) {
              return json(res, 409, { code: 'version_not_current', error: 'this app version is no longer active' }, req)
            }
            const requested = externalCapability(version, target, method)
            if (requested === undefined) return json(res, 403, { code: 'capability_not_declared', error: 'this app did not declare access to that service' }, req)
            if (capability.mode === 'verification') {
              return json(res, 200, { status: 204, headers: {}, body: 'null', verification: true }, req)
            }
            if (!isGranted(record!, capability.sessionId, requested)) {
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
