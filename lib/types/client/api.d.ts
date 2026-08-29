import type { GenuiMeta, PermissionStatus } from './types.ts';
export interface DesignChoice {
    id: string;
    title: string;
    builtin: boolean;
}
export interface DesignSettings {
    default_design_id: string | null;
    designs: DesignChoice[];
    export_base: string;
}
export declare function resolveReceiptAccess(meta: GenuiMeta, sessionId: string): Promise<GenuiMeta>;
export interface ArtifactBridgeCallbacks {
    onStarted?(): void;
    onLeaving?(): void;
}
export interface ArtifactBridgeConnection {
    close(): void;
    isStarted(): boolean;
    setTheme(theme: 'dark' | 'light'): void;
    verifyCurrentDocument(): Promise<boolean>;
}
/** Accepts the one port created by the trusted preview bootstrap. */
export declare function connectArtifactBridge(event: MessageEvent<unknown>, targetWindow: Window, meta: GenuiMeta, versionId: string, expectedNonce: string, callbacks?: ArtifactBridgeCallbacks): ArtifactBridgeConnection | undefined;
export declare function grantPermission(meta: GenuiMeta, versionId: string, capabilityId: string): Promise<{
    granted: boolean;
}>;
export declare function grantAllPermissions(meta: GenuiMeta, versionId: string): Promise<{
    granted: boolean;
}>;
export declare function listPermissions(meta: GenuiMeta, versionId: string): Promise<{
    permissions: PermissionStatus[];
    version_id?: string;
}>;
export declare function revokePermission(meta: GenuiMeta, capabilityId: string): Promise<{
    revoked: boolean;
}>;
export declare function reportRuntimeFailure(meta: GenuiMeta, versionId: string): Promise<{
    reported: boolean;
    failed_version_id: string;
    fallback_version_id?: string;
}>;
export declare function previewUrlForLocale(meta: GenuiMeta, locale: 'en' | 'zh', versionId?: string, theme?: 'dark' | 'light'): string;
export declare function previewUrlWithBridgeNonce(url: string, nonce: string): string;
export declare function readDesignSettings(): Promise<DesignSettings>;
export declare function setDefaultDesign(designId: string | null): Promise<DesignSettings>;
export declare function importDesign(designId: string, content: string): Promise<DesignSettings>;
//# sourceMappingURL=api.d.ts.map