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
export declare function grantPermission(meta: GenuiMeta, versionId: string, capabilityId: string): Promise<{
    granted: boolean;
}>;
export declare function grantAllPermissions(meta: GenuiMeta, versionId: string): Promise<{
    granted: boolean;
}>;
export declare function listPermissions(meta: GenuiMeta, versionId: string): Promise<{
    permissions: PermissionStatus[];
}>;
export declare function revokePermission(meta: GenuiMeta, capabilityId: string): Promise<{
    revoked: boolean;
}>;
export declare function previewUrlForLocale(meta: GenuiMeta, locale: 'en' | 'zh'): string;
export declare function readDesignSettings(): Promise<DesignSettings>;
export declare function setDefaultDesign(designId: string | null): Promise<DesignSettings>;
export declare function importDesign(designId: string, content: string): Promise<DesignSettings>;
//# sourceMappingURL=api.d.ts.map