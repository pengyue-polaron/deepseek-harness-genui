export declare const EXTERNAL_USER_AGENT = "dsh-plugin-genui";
export interface ExternalRequestInput {
    url: string;
    method: string;
    headers?: Record<string, unknown>;
    body?: unknown;
}
export interface ExternalResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
}
export declare function buildExternalHeaders(input: ExternalRequestInput): Record<string, string>;
export declare function requestExternal(input: ExternalRequestInput, signal: AbortSignal): Promise<ExternalResponse>;
//# sourceMappingURL=external.d.ts.map