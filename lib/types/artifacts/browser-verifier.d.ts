import type { Browser } from 'playwright';
import type { BuildDiagnostic } from './types.ts';
export interface BrowserVerificationResult {
    ok: boolean;
    diagnostics: BuildDiagnostic[];
    notes: string[];
}
export declare class BrowserVerifier {
    private readonly launchBrowser;
    private browser;
    constructor(launchBrowser?: () => Promise<Browser>);
    verify(url: string): Promise<BrowserVerificationResult>;
    close(): Promise<void>;
    private getBrowser;
}
export declare function verifyArtifactInBrowser(url: string): Promise<BrowserVerificationResult>;
//# sourceMappingURL=browser-verifier.d.ts.map