import type { GenuiMeta, PermissionStatus } from './types.ts'

interface ArtifactAccess {
  endpoint: string
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

let managementRoot: Promise<string> | undefined

async function managementEndpoint(): Promise<string> {
  managementRoot ??= fetch('/.well-known/dsh-genui', { headers: { accept: 'application/json' } })
    .then(async response => {
      const value = await response.json() as { route_prefix?: unknown; error?: string }
      if (!response.ok || typeof value.route_prefix !== 'string') throw new Error(value.error ?? 'design settings are unavailable')
      return `${value.route_prefix}/manage/designs`
    })
  return managementRoot
}

async function managementJson<T>(path = '', init?: RequestInit): Promise<T> {
  const endpoint = await managementEndpoint()
  const response = await fetch(`${endpoint}${path}`, {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  })
  const value = await response.json() as T & { error?: string }
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
  const token = new URLSearchParams(preview.hash.slice(1)).get('token')
  const marker = '/preview/'
  const markerAt = preview.pathname.indexOf(marker)
  if (token === null || markerAt < 0) throw new Error('preview capability is missing')
  return {
    preview,
    token,
    endpoint: `${preview.origin}${preview.pathname.slice(0, markerAt)}/api/${encodeURIComponent(meta.artifactId)}`,
  }
}

async function post<T>(meta: GenuiMeta, action: string, value: Record<string, unknown>): Promise<T> {
  const { endpoint, token } = access(meta)
  const response = await fetch(`${endpoint}/${action}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(value),
  })
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `artifact request failed: ${response.status}`)
  return body
}

export function grantPermission(meta: GenuiMeta, versionId: string, capabilityId: string): Promise<{ granted: boolean }> {
  return post(meta, 'permission/grant', { version_id: versionId, capability_id: capabilityId })
}

export function grantAllPermissions(meta: GenuiMeta, versionId: string): Promise<{ granted: boolean }> {
  return post(meta, 'permission/grant-all', { version_id: versionId })
}

export function listPermissions(meta: GenuiMeta, versionId: string): Promise<{ permissions: PermissionStatus[] }> {
  return post(meta, 'permission/list', { version_id: versionId })
}

export function revokePermission(meta: GenuiMeta, capabilityId: string): Promise<{ revoked: boolean }> {
  return post(meta, 'permission/revoke', { capability_id: capabilityId })
}

export function previewUrlForLocale(meta: GenuiMeta, locale: 'en' | 'zh'): string {
  const { preview } = access(meta)
  preview.searchParams.set('lang', locale)
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
