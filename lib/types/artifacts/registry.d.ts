import type { ArtifactCapability, ArtifactGrant, ArtifactRecord, ArtifactSessionState, ArtifactVersion, FilePatch, SourceFile, VerificationEvidence } from './types.ts';
export declare class ArtifactRegistry {
    private readonly maxSourceBytes;
    readonly root: string;
    private readonly mutationQueues;
    constructor(root: string, maxSourceBytes: number);
    init(): Promise<void>;
    private recordPath;
    private versionPath;
    distPath(id: string, versionId: string): string;
    get(id: string): Promise<ArtifactRecord>;
    getVersion(id: string, versionId?: string): Promise<ArtifactVersion>;
    create(input: {
        id: string;
        title: string;
        summary: string;
        requirements: string[];
        capabilities: ArtifactCapability[];
        files: SourceFile[];
    }): Promise<ArtifactVersion>;
    update(input: {
        id: string;
        baseVersionId: string;
        summary: string;
        patches: FilePatch[];
        addRequirements?: string[];
        supersedeRequirements?: string[];
        capabilities?: ArtifactCapability[];
    }): Promise<ArtifactVersion>;
    settle(id: string, versionId: string, evidence: VerificationEvidence): Promise<ArtifactVersion>;
    rollback(id: string, versionId: string): Promise<ArtifactRecord>;
    reportRuntimeFailure(id: string, versionId: string): Promise<{
        failedVersionId: string;
        fallbackVersionId?: string;
    }>;
    readState(id: string, sessionId: string): Promise<ArtifactSessionState | undefined>;
    updateState(id: string, sessionId: string, updater: (state: Record<string, unknown>) => Record<string, unknown>): Promise<ArtifactRecord>;
    grantCapability(id: string, sessionId: string, capabilityId: string, grant: ArtifactGrant): Promise<ArtifactRecord>;
    grantCapabilities(id: string, sessionId: string, incoming: Record<string, ArtifactGrant>): Promise<ArtifactRecord>;
    readGrants(id: string, sessionId: string): Promise<Record<string, ArtifactGrant>>;
    revokeCapability(id: string, sessionId: string, capabilityId: string): Promise<boolean>;
    private saveRecord;
    private withMutationLock;
    private makeCandidate;
}
//# sourceMappingURL=registry.d.ts.map