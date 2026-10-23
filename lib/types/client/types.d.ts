export interface GenuiMeta {
    artifactId: string;
    title: string;
    versionId: string;
    previewUrl?: string;
}
export interface PermissionRequest {
    requestId: string;
    permission: {
        id: string;
        kind: 'tool' | 'external';
        label: string;
        reason: string;
        access: 'read' | 'write';
        destination?: string;
        methods?: string[];
    };
}
export type PermissionStatus = PermissionRequest['permission'] & {
    granted: boolean;
};
export interface GenuiMetaRead {
    meta: GenuiMeta;
    source: 'presentation' | 'receipt';
}
export declare function readMetaResult(block: unknown): GenuiMetaRead | undefined;
export declare function readMeta(block: unknown): GenuiMeta | undefined;
/** Read only the displayed field on DSH 0.2.1; retain complete-JSON support for older hosts. */
export declare function pendingTitle(block: unknown): string | undefined;
//# sourceMappingURL=types.d.ts.map