import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools';
/** One call's settled outcome, normalized across both execution APIs. */
export type ToolInvocation = {
    ok: true;
    result: ToolExecutionResult;
} | {
    ok: false;
    error: {
        message: string;
        code?: string | undefined;
    };
};
/** Whether this host takes model-shaped call batches instead of one call. */
export declare function toolsUseBatchApi(tools: unknown): boolean;
export declare function nextToolCallId(): string;
/**
 * Run one connected tool through whichever execution API the host exposes.
 * @param tools - the host's tool service, taken structurally so one bundle
 *   compiles against both the single-call and the batch generation.
 * @param call - the proxied tool name, its arguments, the owning Agent, and a
 *   cancellation signal.
 * @returns the normalized outcome; execution failures stay data, not throws.
 */
export declare function invokeTool(tools: unknown, call: {
    name: string;
    arguments: Record<string, unknown> | undefined;
    agent: Agent;
    signal: AbortSignal;
}): Promise<ToolInvocation>;
//# sourceMappingURL=tool-invocation.d.ts.map