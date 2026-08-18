import type { ArtifactVersion, BuildDiagnostic } from './types.ts';
export interface ArtifactBuildResult {
    ok: boolean;
    diagnostics: BuildDiagnostic[];
    outputFiles: string[];
}
export declare function buildArtifact(version: ArtifactVersion, distPath: string): Promise<ArtifactBuildResult>;
//# sourceMappingURL=builder.d.ts.map