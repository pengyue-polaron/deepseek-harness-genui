import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'

export interface GenuiMeta {
  artifactId: string
  title: string
  versionId: string
  previewUrl?: string
}

export interface PermissionRequest {
  requestId: string
  permission: {
    id: string
    kind: 'tool' | 'external'
    label: string
    reason: string
    access: 'read' | 'write'
    destination?: string
    methods?: string[]
  }
}

export type PermissionStatus = PermissionRequest['permission'] & { granted: boolean }

const RECEIPT_MARKER_PREFIX = '<!--dsh-genui-receipt:'
const RECEIPT_MARKER_SUFFIX = '-->'
const MAX_RECEIPT_BYTES = 16 * 1024
const ARTIFACT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/
const VERSION_ID_PATTERN = /^v-[a-f0-9-]{36}$/

export interface GenuiMetaRead {
  meta: GenuiMeta
  source: 'presentation' | 'receipt'
}

function directMeta(raw: unknown): GenuiMeta | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const value = raw as Record<string, unknown>
  if (value.card !== 'genui' || typeof value.artifactId !== 'string' || typeof value.title !== 'string'
    || typeof value.versionId !== 'string') return undefined
  return {
    artifactId: value.artifactId,
    title: value.title,
    versionId: value.versionId,
    ...(typeof value.previewUrl === 'string' ? { previewUrl: value.previewUrl } : {}),
  }
}

function decodeReceipt(encoded: string): GenuiMeta | undefined {
  if (encoded.length === 0 || encoded.length > MAX_RECEIPT_BYTES || !/^[A-Za-z0-9_-]+$/.test(encoded)) return undefined
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const binary = globalThis.atob(padded)
    if (binary.length > MAX_RECEIPT_BYTES) return undefined
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const value = parsed as Record<string, unknown>
    const keys = Object.keys(value)
    if (keys.length !== 5 || keys.some(key => !['v', 'card', 'artifactId', 'title', 'versionId'].includes(key))) return undefined
    if (value.v !== 1 || value.card !== 'genui' || typeof value.artifactId !== 'string'
      || typeof value.title !== 'string' || typeof value.versionId !== 'string') return undefined
    if (!ARTIFACT_ID_PATTERN.test(value.artifactId) || !VERSION_ID_PATTERN.test(value.versionId)
      || value.title.trim().length === 0 || value.title.length > 4 * 1024
      || /[\u0000-\u001f\u007f]/.test(value.title)) return undefined
    return {
      artifactId: value.artifactId,
      title: value.title,
      versionId: value.versionId,
    }
  } catch {
    return undefined
  }
}

function receiptMeta(content: unknown): GenuiMeta | undefined {
  if (!Array.isArray(content)) return undefined
  const markers: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const value = block as Record<string, unknown>
    if (value.type !== 'text' || typeof value.text !== 'string') continue
    for (const line of value.text.split(/\r?\n/)) {
      if (line.startsWith(RECEIPT_MARKER_PREFIX) && line.endsWith(RECEIPT_MARKER_SUFFIX)) {
        markers.push(line.slice(RECEIPT_MARKER_PREFIX.length, -RECEIPT_MARKER_SUFFIX.length))
      }
    }
  }
  // Ambiguous or repeated envelopes are rejected instead of guessing which
  // metadata should control the card.
  return markers.length === 1 ? decodeReceipt(markers[0] ?? '') : undefined
}

export function readMetaResult(block: ToolCallViewProps['block']): GenuiMetaRead | undefined {
  if (!('kind' in block) || block.isError) return undefined
  const presented = directMeta(block.meta)
  if (presented !== undefined) return { meta: presented, source: 'presentation' }
  const receipt = receiptMeta(block.content)
  return receipt === undefined ? undefined : { meta: receipt, source: 'receipt' }
}

export function readMeta(block: ToolCallViewProps['block']): GenuiMeta | undefined {
  return readMetaResult(block)?.meta
}
