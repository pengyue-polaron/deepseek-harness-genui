import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** One completed Turn's app receipt, republished for the turn-tail card. */
export interface GenuiTurnReceipt {
    /** Root call identity of the render the card reproduces. */
    readonly callId: string;
    /** Presentation payload the tool result carried, when the Host projected one. */
    readonly meta?: unknown;
    /** Result content blocks, which carry the receipt marker on older hosts. */
    readonly content?: unknown;
}
/** App receipts a completed Turn published, in first-seen artifact order. */
export interface GenuiTurnReceipts {
    readonly receipts: readonly GenuiTurnReceipt[];
}
declare module '@deepseek-ai/dsh-client-runtime/client' {
    interface ConversationTurnDataMap {
        /** App receipts of one completed Turn. */
        genui: GenuiTurnReceipts;
    }
}
interface GenuiTurnState {
    readonly turn: number;
    readonly calls: ReadonlyMap<string, string>;
    readonly receipts: readonly GenuiTurnReceipt[];
}
interface EventLike {
    readonly type: string;
    readonly seq: number;
    readonly data: unknown;
}
/** Track GenUI root calls across the Turn and keep their successful receipts. */
export declare const genuiTurnDefinition: {
    kind: string;
    match: (event: EventLike) => {
        id: string;
        role: string;
    } | null;
    start: (_context: unknown, match: {
        event: EventLike;
    }) => GenuiTurnState;
    update: (context: {
        state: GenuiTurnState;
    }, match: {
        event: EventLike;
    }) => GenuiTurnState;
    buildLocationData: (context: {
        state?: GenuiTurnState;
    }, scope: string, previous: unknown) => {
        kind: string;
        turn: number;
        key: string;
        value: GenuiTurnReceipts;
    } | null;
};
/**
 * Publish the Turn's receipts for the turn-tail card.
 *
 * `uiConversation` is not in this plugin's static `inject` list: the 0.1.0
 * hosts do not provide it, and a required dependency that never appears would
 * keep the whole client plugin from activating there. A scoped injection waits
 * for it where it exists and stays pending otherwise.
 * @param ctx - client plugin root.
 */
export declare function registerGenuiTurnReceipts(ctx: ClientContext): void;
/**
 * Read the receipts published for one Turn.
 * @param turn - Turn location supplied to the turn-tail slot.
 * @returns successful receipts in order.
 */
export declare function genuiTurnReceipts(turn: unknown): readonly GenuiTurnReceipt[];
/**
 * Keep a completed Turn's app visible below the answer.
 *
 * `conversation.chat.turnTail` is a list slot from 0.1.7 on; the 0.1.0
 * generation declares a chain slot, so a list registration there is skipped and
 * that generation keeps the tool-row card.
 * @param ctx - client plugin root.
 * @param component - card rendered from the slot's Turn owner props.
 * @returns the entry disposer.
 */
export declare function genuiTurnCardRegistration(ctx: ClientContext, component: unknown): () => void;
/**
 * Inject the turn-tail card. The slot name stays structural because the owning
 * package and slot kind differ between host generations.
 * @param ctx - client plugin root.
 * @param component - card rendered from the slot's Turn owner props.
 */
export declare function registerGenuiTurnCard(ctx: ClientContext, component: unknown): void;
export {};
//# sourceMappingURL=turn-receipt.d.ts.map