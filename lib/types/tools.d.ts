import type { Context } from '@deepseek-ai/cordis';
import type { ArtifactRegistry } from './artifacts/registry.ts';
import type { DesignStore } from './designs/store.ts';
import { type CapabilityStore } from './runtime/capabilities.ts';
export declare function renderReceipt(value: unknown): {
    type: 'text';
    text: string;
}[];
export declare function registerGenuiTools(ctx: Context, registry: ArtifactRegistry, designs: DesignStore, capabilities: CapabilityStore, routePrefix: string, previewOrigin: string): void;
//# sourceMappingURL=tools.d.ts.map