import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
interface GenuiToolViewProps extends ToolCallViewProps, PropsLocale<'genui'> {
}
export declare function GenuiToolView({ block, callId, sessionId, t }: GenuiToolViewProps): import("react").JSX.Element;
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
export {};
//# sourceMappingURL=index.d.ts.map