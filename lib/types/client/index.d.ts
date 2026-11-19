import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
/** A settled result synthesized from Turn data, or the Host's own tool-call block. */
type GenuiCardBlock = ToolCallViewProps['block'] | {
    kind: 'tool-result';
    isError: false;
    meta?: unknown;
    content?: unknown;
};
/**
 * Card input shared by the tool row and the turn-tail surface. Both pass the
 * same receipt; only the mount identity differs so the card ledger keeps them
 * apart.
 */
interface GenuiCardProps {
    block: GenuiCardBlock;
    callId: string;
    sessionId: unknown;
    t: TranslateNS<'genui'>;
}
export declare function GenuiToolView({ block, callId, sessionId, t }: GenuiCardProps): import("react").JSX.Element;
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
export {};
//# sourceMappingURL=index.d.ts.map