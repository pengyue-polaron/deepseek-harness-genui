export const name = 'genui'
export const inject = ['tools', 'systemPrompt', 'webServer', 'agents']

export { Config } from './config.ts'
export type { ResolvedConfig } from './config.ts'
export { apply } from './runtime.ts'
export { ArtifactRegistry } from './artifacts/registry.ts'
export { DesignStore } from './designs/store.ts'
export { DESIGN_PRESETS } from './designs/presets.ts'
export { buildArtifact } from './artifacts/builder.ts'
export type {
  ArtifactRecord,
  ArtifactVersion,
  ArtifactView,
  BuildDiagnostic,
  FilePatch,
  Requirement,
  SourceFile,
  VerificationEvidence,
} from './artifacts/types.ts'
