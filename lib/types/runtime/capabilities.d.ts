import type { Agent } from '@deepseek-ai/dsh-agent';
export type CapabilityMode = 'interactive' | 'verification';
interface Capability {
    artifactId: string;
    sessionId: string;
    agent: Agent;
    mode: CapabilityMode;
}
type AgentResolver = (sessionId: string) => Agent | undefined;
export declare function artifactSessionPrefix(sessionId: string): string;
export declare class CapabilityStore {
    private readonly resolveAgent?;
    private readonly secret;
    private readonly agents;
    private readonly revoked;
    private readonly interactiveTokens;
    constructor(resolveAgent?: AgentResolver | undefined, secret?: Buffer<ArrayBufferLike>);
    static persistent(path: string, resolveAgent: AgentResolver): Promise<CapabilityStore>;
    issue(artifactId: string, agent: Agent, mode?: CapabilityMode): string;
    issueForSession(artifactId: string, sessionId: string): string | undefined;
    resolve(token: string, artifactId: string): Capability | undefined;
    revoke(token: string): void;
    clear(): void;
    private sign;
}
export {};
//# sourceMappingURL=capabilities.d.ts.map