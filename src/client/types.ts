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

export function readMeta(block: ToolCallViewProps['block']): GenuiMeta | undefined {
  if (!('kind' in block) || block.isError) return undefined
  const raw: unknown = block.meta
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
