import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import type { ArtifactRegistry } from '../artifacts/registry.ts';
import type { DesignStore } from '../designs/store.ts';
import type { CapabilityStore } from './capabilities.ts';
export interface GenuiHttpRuntime {
    handler(req: IncomingMessage, res: ServerResponse): Promise<void>;
}
export declare function createHttpRuntime(ctx: Context, registry: ArtifactRegistry, designs: DesignStore, capabilities: CapabilityStore, routePrefix: string): GenuiHttpRuntime;
//# sourceMappingURL=server.d.ts.map