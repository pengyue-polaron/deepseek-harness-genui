declare class ArtifactCardLedger {
    private sequence;
    private readonly entries;
    private readonly listeners;
    mount(key: string, callId: string, element: HTMLElement, hasPreview: boolean): () => void;
    isPrimary(key: string, callId: string): boolean;
    focusPrimary(key: string): void;
    subscribe(key: string, listener: () => void): () => void;
    private emit;
}
export declare const artifactCardLedger: ArtifactCardLedger;
export declare function usePrimaryArtifactCard(key: string, callId: string, element: HTMLElement | null, hasPreview: boolean): boolean;
export {};
//# sourceMappingURL=ledger.d.ts.map