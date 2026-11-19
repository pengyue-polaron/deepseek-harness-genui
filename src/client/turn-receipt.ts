import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { NS } from './locales.ts'

/** One completed Turn's app receipt, republished for the turn-tail card. */
export interface GenuiTurnReceipt {
  /** Root call identity of the render the card reproduces. */
  readonly callId: string
  /** Presentation payload the tool result carried, when the Host projected one. */
  readonly meta?: unknown
  /** Result content blocks, which carry the receipt marker on older hosts. */
  readonly content?: unknown
}

/** App receipts a completed Turn published, in first-seen artifact order. */
export interface GenuiTurnReceipts {
  readonly receipts: readonly GenuiTurnReceipt[]
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationTurnDataMap {
    /** App receipts of one completed Turn. */
    genui: GenuiTurnReceipts
  }
}

/** Root calls that publish an app the user keeps interacting with. */
const GENUI_CALLS = new Set(['genui_create', 'genui_update', 'genui_rollback'])

interface GenuiTurnState {
  readonly turn: number
  readonly calls: ReadonlyMap<string, string>
  readonly receipts: readonly GenuiTurnReceipt[]
}

interface EventLike {
  readonly type: string
  readonly seq: number
  readonly data: unknown
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function numberField(value: Record<string, unknown>, key: string): number | undefined {
  const field = value[key]
  return typeof field === 'number' ? field : undefined
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key]
  return typeof field === 'string' ? field : undefined
}

/** Read the Turn a matched event belongs to. */
function turnOf(event: EventLike): number | undefined {
  return numberField(record(event.data) ?? {}, 'turn')
}

/** Track GenUI root calls across the Turn and keep their successful receipts. */
export const genuiTurnDefinition = {
  kind: 'genui',
  match: (event: EventLike) => {
    if (event.type !== 'turn/start' && event.type !== 'tool/call' && event.type !== 'tool/result') return null
    const turn = turnOf(event)
    if (turn === undefined) return null
    return { id: String(turn), role: event.type === 'turn/start' ? 'start' : 'update' }
  },
  start: (_context: unknown, match: { event: EventLike }): GenuiTurnState => ({
    turn: turnOf(match.event) ?? 0,
    calls: new Map(),
    receipts: [],
  }),
  update: (context: { state: GenuiTurnState }, match: { event: EventLike }): GenuiTurnState => {
    const state = context.state
    if (match.event.type === 'tool/call') {
      const data = record(match.event.data)
      if (data === undefined) return state
      const callId = stringField(data, 'callId')
      const name = stringField(data, 'name')
      if (callId === undefined || name === undefined || !GENUI_CALLS.has(name)) return state
      const calls = new Map(state.calls)
      calls.set(callId, name)
      return { ...state, calls }
    }
    if (match.event.type !== 'tool/result') return state
    const data = record(match.event.data)
    if (data === undefined) return state
    const message = record(data.message)
    if (message === undefined) return state
    const source = record(message.source)
    const callId = source === undefined ? undefined : stringField(source, 'callId')
    if (callId === undefined || !state.calls.has(callId)) return state
    if (message.isError === true) return state
    // The card reads both arms itself; keep them exactly as the Host sent them.
    const receipt: GenuiTurnReceipt = {
      callId,
      ...(data.meta === undefined ? {} : { meta: data.meta }),
      ...(message.content === undefined ? {} : { content: message.content }),
    }
    // A Turn may render more than one app; keep them all, latest version last.
    return { ...state, receipts: [...state.receipts.filter(item => item.callId !== callId), receipt] }
  },
  buildLocationData: (context: { state?: GenuiTurnState }, scope: string, previous: unknown) => {
    if (scope !== 'turn' || context.state === undefined || context.state.receipts.length === 0) return null
    const value: GenuiTurnReceipts = { receipts: context.state.receipts }
    const prior = record(previous)
    if (prior?.kind === 'turn' && prior.turn === context.state.turn && prior.value === value) return previous as never
    return { kind: 'turn', turn: context.state.turn, key: 'genui', value }
  },
}

/** Host surface that owns Conversation business Definitions. */
interface DefinitionRegistryHost {
  uiConversation?: { events?: { register?: (definition: unknown) => unknown } }
}

/**
 * Publish the Turn's receipts for the turn-tail card.
 * @param ctx - client plugin root.
 */
export function registerGenuiTurnReceipts(ctx: ClientContext): void {
  const events = (ctx as unknown as DefinitionRegistryHost).uiConversation?.events
  if (typeof events?.register !== 'function') return
  try {
    ctx.effect(() => events.register!(genuiTurnDefinition) as () => void, 'genui: turn receipts')
  } catch {
    // A composition without the Definition registry keeps the tool-row card.
  }
}

/**
 * Read the receipts published for one Turn.
 * @param turn - Turn location supplied to the turn-tail slot.
 * @returns successful receipts in order.
 */
export function genuiTurnReceipts(turn: unknown): readonly GenuiTurnReceipt[] {
  const data = record(turn)?.data as { get?: (key: string) => unknown } | undefined
  if (typeof data?.get !== 'function') return []
  const value = record(data.get('genui'))
  const receipts = value?.receipts
  return Array.isArray(receipts) ? receipts.filter(item => stringField(record(item) ?? {}, 'callId') !== undefined) as GenuiTurnReceipt[] : []
}

/** The slot surface differs across host generations, so the spec stays structural. */
interface RegisterableSlots {
  register(options: Record<string, unknown>, component: unknown): () => void
}

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
export function genuiTurnCardRegistration(ctx: ClientContext, component: unknown): () => void {
  const slots = ctx.slots as unknown as RegisterableSlots
  try {
    return slots.register({
      name: 'conversation.chat.turnTail', id: 'genui-turn-card', order: 40, locale: NS,
    }, component)
  } catch {
    // Chain-slot generation: skip instead of claiming the surface.
    return () => {}
  }
}

/** Slot service face used structurally: the slot's declared kind differs by host. */
interface InjectingSlots {
  inject(name: string, factory: () => Generator<() => void>): void
}

/**
 * Inject the turn-tail card. The slot name stays structural because the owning
 * package and slot kind differ between host generations.
 * @param ctx - client plugin root.
 * @param component - card rendered from the slot's Turn owner props.
 */
export function registerGenuiTurnCard(ctx: ClientContext, component: unknown): void {
  const slots = ctx.slots as unknown as InjectingSlots
  slots.inject('conversation.chat.turnTail', function* () {
    yield genuiTurnCardRegistration(ctx, component)
  })
}
