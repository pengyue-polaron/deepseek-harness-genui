import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
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
export declare function readMeta(block: ToolCallViewProps['block']): GenuiMeta | undefined;
//# sourceMappingURL=types.d.ts.map