import { createHash } from 'node:crypto'
import type { ArtifactCapability, ArtifactRecord, ArtifactVersion } from '../artifacts/types.ts'

export interface PermissionView {
  id: string
  kind: 'tool' | 'external'
  label: string
  reason: string
  access: 'read' | 'write'
  destination?: string
  methods?: string[]
}

export function capabilityFingerprint(capability: ArtifactCapability): string {
  return createHash('sha256').update(JSON.stringify(capability)).digest('base64url')
}

export function permissionView(capability: ArtifactCapability): PermissionView {
  return {
    id: capability.id,
    kind: capability.kind,
    label: capability.label,
    reason: capability.reason,
    access: capability.access,
    ...(capability.kind === 'external'
      ? { destination: new URL(capability.urlPrefix).host, methods: capability.methods }
      : {}),
  }
}

export function capabilityById(version: ArtifactVersion, id: string): ArtifactCapability | undefined {
  return version.capabilities.find(capability => capability.id === id)
}

export function toolCapability(version: ArtifactVersion, name: string): ArtifactCapability | undefined {
  return version.capabilities.find(capability => capability.kind === 'tool' && capability.tool === name)
}

export function externalCapability(
  version: ArtifactVersion,
  url: URL,
  method: string,
): ArtifactCapability | undefined {
  return version.capabilities.find(capability => {
    if (capability.kind !== 'external' || !capability.methods.includes(method as never)) return false
    const prefix = new URL(capability.urlPrefix)
    return url.origin === prefix.origin && url.href.startsWith(prefix.href)
  })
}

export function isGranted(record: ArtifactRecord, sessionId: string, capability: ArtifactCapability): boolean {
  const grant = record.grants[sessionId]?.[capability.id]
  return grant?.fingerprint === capabilityFingerprint(capability) && Date.parse(grant.expiresAt) > Date.now()
}
