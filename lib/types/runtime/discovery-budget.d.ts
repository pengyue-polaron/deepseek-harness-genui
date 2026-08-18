import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
export declare class DiscoveryBudget {
    private readonly usage;
    reset(agent: Agent): void;
    check(exec: ToolExecution): string | undefined;
}
export declare function registerDiscoveryBudget(ctx: Context): void;
//# sourceMappingURL=discovery-budget.d.ts.map