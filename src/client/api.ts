import type { GenuiMeta, PermissionStatus } from './types.ts'

const ARTIFACT_BRIDGE_VERSION = 1
const ARTIFACT_BRIDGE_TOKEN = 'bridge-v1'
const BRIDGE_ACTIONS = new Set(['state/read', 'state/write', 'tool', 'external'])
const MAX_BRIDGE_REQUESTS = 32
const MAX_BRIDGE_BODY_BYTES = 256 * 1024

interface ArtifactAccess {
  token: string
  preview: URL
}

export interface DesignChoice {
  id: string
  title: string
  builtin: boolean
}

export interface DesignSettings {
  default_design_id: string | null
  designs: DesignChoice[]
  export_base: string
}

let runtimeRoot: Promise<string> | undefined
const REQUEST_TIMEOUT_MS = 8_000
const VERSION_ID_PATTERN = /^v-[a-f0-9-]{36}$/

async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<{ response: Response; value: T }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(input, { ...init, signal: controller.signal })
    const value = await response.json() as T
    return { response, value }
  } finally {
    clearTimeout(timeout)
  }
}

async function runtimeEndpoint(): Promise<string> {
  if (runtimeRoot !== undefined) return runtimeRoot
  const attempt = fetchJsonWithTimeout<{ route_prefix?: unknown; error?: string }>('/.well-known/dsh-genui', { headers: { accept: 'application/json' } })
    .then(({ response, value }) => {
      if (!response.ok || typeof value.route_prefix !== 'string'
        || !/^\/[a-z0-9/_-]*[a-z0-9_-]$/i.test(value.route_prefix) || value.route_prefix.includes('//')) {
        throw new Error(value.error ?? 'GenUI host is unavailable')
      }
      return value.route_prefix
    })
  runtimeRoot = attempt
  void attempt.catch(() => {
    if (runtimeRoot === attempt) runtimeRoot = undefined
  })
  return attempt
}

async function managementEndpoint(): Promise<string> {
  return `${await runtimeEndpoint()}/manage/designs`
}

async function managementJson<T>(path = '', init?: RequestInit): Promise<T> {
  const endpoint = await managementEndpoint()
  const { response, value } = await fetchJsonWithTimeout<T & { error?: string }>(`${endpoint}${path}`, {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(value.error ?? `design request failed: ${response.status}`)
  return value
}

async function withExportBase(value: Promise<Omit<DesignSettings, 'export_base'>>): Promise<DesignSettings> {
  const [settings, endpoint] = await Promise.all([value, managementEndpoint()])
  return { ...settings, export_base: endpoint }
}

function access(meta: GenuiMeta): ArtifactAccess {
  if (meta.previewUrl === undefined) throw new Error('preview is unavailable')
  const preview = new URL(meta.previewUrl, window.location.href)
  const fragment = [...new URLSearchParams(preview.hash.slice(1)).entries()]
  const token = fragment.length === 1 && fragment[0]?.[0] === 'token' ? fragment[0][1] : undefined
  const marker = '/preview/'
  const markerAt = preview.pathname.lastIndexOf(marker)
  if (token === undefined || token === '' || markerAt < 0 || preview.origin !== window.location.origin
    || preview.username !== '' || preview.password !== '') throw new Error('preview capability is missing')
  return {
    preview,
    token,
  }
}

async function verifiedAccess(meta: GenuiMeta): Promise<ArtifactAccess & { endpoint: string }> {
  const value = access(meta)
  const root = await runtimeEndpoint()
  const expectedPath = `${root}/preview/${encodeURIComponent(meta.artifactId)}/${encodeURIComponent(meta.versionId)}`
  if (value.preview.pathname !== expectedPath) throw new Error('preview capability route is invalid')
  return {
    ...value,
    endpoint: `${window.location.origin}${root}/api/${encodeURIComponent(meta.artifactId)}`,
  }
}

export async function resolveReceiptAccess(meta: GenuiMeta, sessionId: string): Promise<GenuiMeta> {
  if (meta.previewUrl !== undefined) return meta
  const root = await runtimeEndpoint()
  const { response, value } = await fetchJsonWithTimeout<{
    artifact_id?: unknown
    title?: unknown
    version_id?: unknown
    preview_url?: unknown
    error?: string
  }>(`${root}/host-control/preview-access`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ artifact_id: meta.artifactId, version_id: meta.versionId, session_id: sessionId }),
  })
  if (!response.ok) throw new Error(value.error ?? `preview access failed: ${response.status}`)
  if (value.artifact_id !== meta.artifactId || typeof value.title !== 'string' || value.title.trim() === ''
    || value.title.length > 4 * 1024 || /[\u0000-\u001f\u007f]/.test(value.title)
    || typeof value.version_id !== 'string' || !VERSION_ID_PATTERN.test(value.version_id)
    || typeof value.preview_url !== 'string' || value.preview_url.length > 8 * 1024) {
    throw new Error('preview access response is invalid')
  }
  const preview = new URL(value.preview_url, window.location.href)
  const expectedPath = `${root}/preview/${encodeURIComponent(meta.artifactId)}/${encodeURIComponent(value.version_id)}`
  const fragment = [...new URLSearchParams(preview.hash.slice(1)).entries()]
  const search = [...preview.searchParams.entries()]
  if (preview.origin !== window.location.origin || preview.pathname !== expectedPath
    || preview.username !== '' || preview.password !== '' || search.length !== 1
    || search[0]?.[0] !== 'lang' || search[0][1] !== 'en'
    || fragment.length !== 1 || fragment[0]?.[0] !== 'token' || fragment[0][1] === '') {
    throw new Error('preview access response is invalid')
  }
  return {
    artifactId: meta.artifactId,
    title: value.title,
    versionId: value.version_id,
    previewUrl: preview.toString(),
  }
}

async function post<T>(meta: GenuiMeta, action: string, value: Record<string, unknown>): Promise<T> {
  const { endpoint, token } = await verifiedAccess(meta)
  const { response, value: body } = await fetchJsonWithTimeout<T & { error?: string }>(`${endpoint}/${action}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(value),
  })
  if (!response.ok) throw new Error(body.error ?? `artifact request failed: ${response.status}`)
  return body
}

function bridgeTimeout(action: string): number {
  return action === 'tool' ? 65_000 : action === 'external' ? 35_000 : 10_000
}

async function bridgePost(
  endpoint: string,
  token: string,
  action: string,
  value: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; value: unknown }> {
  const { response, value: body } = await fetchJsonWithTimeout<unknown>(`${endpoint}/${action}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(value),
  }, bridgeTimeout(action))
  return { ok: response.ok, status: response.status, value: body }
}

export interface ArtifactBridgeCallbacks {
  onStarted?(): void
  onLeaving?(): void
}

export interface ArtifactBridgeConnection {
  close(): void
  isStarted(): boolean
  setTheme(theme: 'dark' | 'light'): void
  verifyCurrentDocument(): Promise<boolean>
}

/** Accepts the one port created by the trusted preview bootstrap. */
export function connectArtifactBridge(
  event: MessageEvent<unknown>,
  targetWindow: Window,
  meta: GenuiMeta,
  versionId: string,
  expectedNonce: string,
  callbacks: ArtifactBridgeCallbacks = {},
): ArtifactBridgeConnection | undefined {
  if (event.source !== targetWindow || event.origin !== 'null' || event.ports.length !== 1
    || typeof event.data !== 'object' || event.data === null) return undefined
  const value = event.data as Record<string, unknown>
  if (value.source !== 'dsh-genui' || value.type !== 'bridge-connect'
    || value.bridgeVersion !== ARTIFACT_BRIDGE_VERSION || value.nonce !== expectedNonce
    || value.artifactId !== meta.artifactId || value.versionId !== versionId) return undefined
  access(meta)
  const port = event.ports[0]
  if (port === undefined) return undefined
  const inFlight = new Set<string>()
  const liveness = new Map<string, (alive: boolean) => void>()
  let closed = false
  let started = false

  const send = (message: Record<string, unknown>) => {
    if (!closed) port.postMessage({
      source: 'dsh-genui', bridgeVersion: ARTIFACT_BRIDGE_VERSION, nonce: expectedNonce, ...message,
    })
  }
  const close = () => {
    if (closed) return
    send({ type: 'bridge-closed' })
    closed = true
    inFlight.clear()
    for (const settle of liveness.values()) settle(false)
    liveness.clear()
    port.close()
  }
  const leave = () => {
    if (closed) return
    callbacks.onLeaving?.()
    close()
  }

  port.onmessage = (message) => {
    if (closed || typeof message.data !== 'object' || message.data === null) return
    const request = message.data as Record<string, unknown>
    if (request.source !== 'dsh-genui' || request.bridgeVersion !== ARTIFACT_BRIDGE_VERSION
      || request.nonce !== expectedNonce || request.artifactId !== meta.artifactId
      || request.versionId !== versionId) return
    if (request.type === 'preview-loaded') {
      if (started) return
      started = true
      callbacks.onStarted?.()
      send({ type: 'start-app' })
      return
    }
    if (request.type === 'preview-leaving') {
      leave()
      return
    }
    if (request.type === 'liveness-response' && typeof request.requestId === 'string') {
      const settle = liveness.get(request.requestId)
      if (settle !== undefined) {
        liveness.delete(request.requestId)
        settle(true)
      }
      return
    }
    if (request.type !== 'api-request' || !started || typeof request.requestId !== 'string'
      || request.requestId.length === 0 || request.requestId.length > 128) return
    const requestId = request.requestId
    const action = request.action
    const body = request.body
    if (typeof action !== 'string' || !BRIDGE_ACTIONS.has(action)
      || typeof body !== 'object' || body === null || Array.isArray(body)) {
      send({ type: 'api-response', requestId, ok: false, status: 400, value: { error: 'invalid GenUI bridge request' } })
      return
    }
    let serialized: string
    try {
      serialized = JSON.stringify(body)
    } catch {
      send({ type: 'api-response', requestId, ok: false, status: 400, value: { error: 'GenUI bridge request must be JSON' } })
      return
    }
    if (new TextEncoder().encode(serialized).byteLength > MAX_BRIDGE_BODY_BYTES) {
      send({ type: 'api-response', requestId, ok: false, status: 413, value: { error: 'GenUI bridge request is too large' } })
      return
    }
    if (inFlight.has(requestId)) return
    if (inFlight.size >= MAX_BRIDGE_REQUESTS) {
      send({ type: 'api-response', requestId, ok: false, status: 429, value: { error: 'too many GenUI bridge requests' } })
      return
    }
    inFlight.add(requestId)
    void verifiedAccess(meta).then(({ endpoint, token }) => bridgePost(endpoint, token, action, {
      ...(body as Record<string, unknown>), version_id: versionId,
    })).then(result => {
      if (!closed && inFlight.has(requestId)) send({ type: 'api-response', requestId, ...result })
    }, error => {
      if (!closed && inFlight.has(requestId)) send({
        type: 'api-response', requestId, ok: false, status: 502,
        value: { error: error instanceof Error ? error.message : 'GenUI host request failed' },
      })
    }).finally(() => inFlight.delete(requestId))
  }
  port.onmessageerror = leave
  port.start()
  send({ type: 'bridge-accepted' })

  return {
    close,
    isStarted: () => started && !closed,
    setTheme: theme => send({ type: 'theme', theme }),
    verifyCurrentDocument: () => {
      if (!started || closed) return Promise.resolve(false)
      const requestId = crypto.randomUUID()
      return new Promise(resolve => {
        const timeout = window.setTimeout(() => {
          if (!liveness.delete(requestId)) return
          resolve(false)
        }, 250)
        liveness.set(requestId, alive => {
          window.clearTimeout(timeout)
          resolve(alive)
        })
        send({ type: 'liveness-challenge', requestId })
      })
    },
  }
}

export function grantPermission(meta: GenuiMeta, versionId: string, capabilityId: string): Promise<{ granted: boolean }> {
  return post(meta, 'permission/grant', { version_id: versionId, capability_id: capabilityId })
}

export function grantAllPermissions(meta: GenuiMeta, versionId: string): Promise<{ granted: boolean }> {
  return post(meta, 'permission/grant-all', { version_id: versionId })
}

export function listPermissions(meta: GenuiMeta, versionId: string): Promise<{ permissions: PermissionStatus[]; version_id?: string }> {
  return post(meta, 'permission/list', { version_id: versionId })
}

export function revokePermission(meta: GenuiMeta, capabilityId: string): Promise<{ revoked: boolean }> {
  return post(meta, 'permission/revoke', { capability_id: capabilityId })
}

export function reportRuntimeFailure(meta: GenuiMeta, versionId: string): Promise<{
  reported: boolean
  failed_version_id: string
  fallback_version_id?: string
}> {
  return post(meta, 'version/report-runtime-failure', { version_id: versionId })
}

export function previewUrlForLocale(
  meta: GenuiMeta,
  locale: 'en' | 'zh',
  versionId = meta.versionId,
  theme?: 'dark' | 'light',
): string {
  const { preview } = access(meta)
  const markerAt = preview.pathname.lastIndexOf('/preview/')
  if (markerAt < 0) throw new Error('preview route is unavailable')
  preview.pathname = `${preview.pathname.slice(0, markerAt)}/preview/${encodeURIComponent(meta.artifactId)}/${encodeURIComponent(versionId)}`
  preview.searchParams.set('lang', locale)
  if (theme !== undefined) preview.searchParams.set('theme', theme)
  preview.hash = new URLSearchParams({ token: ARTIFACT_BRIDGE_TOKEN }).toString()
  return preview.toString()
}

export function previewUrlWithBridgeNonce(url: string, nonce: string): string {
  if (nonce.length < 16 || nonce.length > 128 || !/^[a-z0-9._~-]+$/i.test(nonce)) {
    throw new Error('preview bridge nonce is invalid')
  }
  const preview = new URL(url, window.location.href)
  preview.hash = new URLSearchParams({ token: ARTIFACT_BRIDGE_TOKEN, bridge_nonce: nonce }).toString()
  return preview.toString()
}

export function readDesignSettings(): Promise<DesignSettings> {
  return withExportBase(managementJson())
}

export function setDefaultDesign(designId: string | null): Promise<DesignSettings> {
  return withExportBase(managementJson('/default', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ design_id: designId }),
  }))
}

export function importDesign(designId: string, content: string): Promise<DesignSettings> {
  return withExportBase(managementJson('/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ design_id: designId, content }),
  }))
}
