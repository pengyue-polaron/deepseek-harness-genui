export interface GenuiReadyMessage {
    source: 'dsh-genui';
    type: 'ready';
    artifactId: string;
    versionId: string;
}
export declare function isGenuiReadyMessage(event: MessageEvent<unknown>, frameWindow: Window | null, artifactId: string, versionId: string): event is MessageEvent<GenuiReadyMessage>;
//# sourceMappingURL=readiness.d.ts.map