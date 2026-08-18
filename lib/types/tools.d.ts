import type { Context } from '@deepseek-ai/cordis';
import type { ArtifactRegistry } from './artifacts/registry.ts';
import type { BrowserVerificationResult } from './artifacts/browser-verifier.ts';
import type { DesignStore } from './designs/store.ts';
import type { CapabilityStore } from './runtime/capabilities.ts';
export declare function registerGenuiTools(ctx: Context, registry: ArtifactRegistry, designs: DesignStore, capabilities: CapabilityStore, routePrefix: string, previewOrigin: string, verifyBrowser?: (url: string) => Promise<BrowserVerificationResult>): void;
//# sourceMappingURL=tools.d.ts.map