import z from '@deepseek-ai/schemastery';
export interface Config {
    artifactRoot?: string;
    routePrefix?: string;
    maxSourceBytes?: number;
}
export interface ResolvedConfig {
    artifactRoot: string;
    routePrefix: string;
    maxSourceBytes: number;
}
export declare const Config: z<Config>;
export declare function resolveConfig(config?: Config): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map