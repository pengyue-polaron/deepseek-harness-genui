export interface SourceFile {
  path: string
  content: string
}

export interface FilePatch {
  path: string
  content?: string
  delete?: boolean
}

export interface Requirement {
  id: string
  text: string
  status: 'active' | 'superseded'
  introducedIn: string
}

export interface BuildDiagnostic {
  severity: 'error' | 'warning'
  text: string
  file?: string
  line?: number
  column?: number
}

export interface VerificationEvidence {
  checkedAt: string
  build: 'passed' | 'failed'
  browser: 'not-run' | 'passed' | 'failed'
  diagnostics: BuildDiagnostic[]
  notes: string[]
}

export type CapabilityAccess = 'read' | 'write'

interface CapabilityBase {
  id: string
  label: string
  reason: string
  access: CapabilityAccess
}

export interface ToolCapability extends CapabilityBase {
  kind: 'tool'
  tool: string
}

export interface ExternalCapability extends CapabilityBase {
  kind: 'external'
  urlPrefix: string
  methods: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>
}

export type ArtifactCapability = ToolCapability | ExternalCapability

export interface ArtifactGrant {
  fingerprint: string
  grantedAt: string
  expiresAt: string
}

export interface ArtifactSessionState {
  updatedAt: string
  expiresAt: string
  values: Record<string, unknown>
}

export interface ArtifactVersion {
  schemaVersion?: 1
  id: string
  artifactId: string
  parentVersionId?: string
  createdAt: string
  summary: string
  files: SourceFile[]
  requirements: Requirement[]
  capabilities: ArtifactCapability[]
  status: 'candidate' | 'ready' | 'failed'
  evidence: VerificationEvidence
}

export interface ArtifactRecord {
  schemaVersion?: 1
  id: string
  title: string
  createdAt: string
  updatedAt: string
  currentVersionId?: string
  latestVersionId: string
  versions: string[]
  states: Record<string, ArtifactSessionState>
  grants: Record<string, Record<string, ArtifactGrant>>
}

export interface ArtifactView {
  artifact: ArtifactRecord
  version: ArtifactVersion
  previewUrl?: string
}
