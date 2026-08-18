import type { ArtifactCapability, ArtifactRecord, ArtifactVersion } from '../artifacts/types.ts';
export interface PermissionView {
    id: string;
    kind: 'tool' | 'external';
    label: string;
    reason: string;
    access: 'read' | 'write';
    destination?: string;
    methods?: string[];
}
export declare function capabilityFingerprint(capability: ArtifactCapability): string;
export declare function permissionView(capability: ArtifactCapability): PermissionView;
export declare function capabilityById(version: ArtifactVersion, id: string): ArtifactCapability | undefined;
export declare function toolCapability(version: ArtifactVersion, name: string): ArtifactCapability | undefined;
export declare function externalCapability(version: ArtifactVersion, url: URL, method: string): ArtifactCapability | undefined;
export declare function isGranted(record: ArtifactRecord, sessionId: string, capability: ArtifactCapability): boolean;
//# sourceMappingURL=permissions.d.ts.map