export interface GenuiReadyMessage {
    source: 'dsh-genui';
    type: 'ready';
    artifactId: string;
    versionId: string;
}
export interface GenuiRuntimeErrorMessage {
    source: 'dsh-genui';
    type: 'runtime-error';
    artifactId: string;
    versionId: string;
}
export declare function isGenuiReadyMessage(event: MessageEvent<unknown>, frameWindow: Window | null, artifactId: string, versionId: string): event is MessageEvent<GenuiReadyMessage>;
export declare function isGenuiRuntimeErrorMessage(event: MessageEvent<unknown>, frameWindow: Window | null, artifactId: string, versionId: string): event is MessageEvent<GenuiRuntimeErrorMessage>;
//# sourceMappingURL=readiness.d.ts.map