type Listener = () => void;
export interface CanvasSurface {
    mode: 'split' | 'full';
    width: number;
}
export declare function solveCanvasSurface(frameWidth: number, workspaceWidth: number): CanvasSurface;
declare class CanvasController {
    private readonly activeBySession;
    private readonly listeners;
    open(sessionId: string, artifactId: string): void;
    close(sessionId: string, artifactId: string): void;
    isOpen(sessionId: string, artifactId: string): boolean;
    subscribe(sessionId: string, listener: Listener): () => void;
    private emit;
}
export declare const canvasController: CanvasController;
export declare function useCanvasArtifact(sessionId: string, artifactId: string): boolean;
export declare function useCanvasSurface(open: boolean, card: HTMLElement | null): CanvasSurface;
export {};
//# sourceMappingURL=canvas.d.ts.map