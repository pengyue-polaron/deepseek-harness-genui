import type { GenuiMeta } from './types.ts'

interface ArtifactAccess {
  endpoint: string
  token: string
  preview: URL
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

export function previewUrlForLocale(meta: GenuiMeta, locale: 'en' | 'zh'): string {
  const { preview } = access(meta)
  preview.searchParams.set('lang', locale)
  return preview.toString()
}
