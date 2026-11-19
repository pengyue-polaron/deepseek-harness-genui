import { describe, expect, it } from 'vitest'
import { genuiTurnDefinition, genuiTurnReceipts } from '../src/client/turn-receipt.ts'

type Definition = typeof genuiTurnDefinition
type Match = { event: { type: string; seq: number; data: unknown } }
type State = Record<string, unknown>

const definition = genuiTurnDefinition as unknown as {
  match(event: Match['event']): { id: string; role: 'start' | 'update' } | null
  start(context: unknown, match: Match): State
  update(context: { state: State }, match: Match): State
  buildLocationData(
    context: { state?: State }, scope: string, previous: unknown,
  ): { kind: string; turn: number; key: string; value: Record<string, unknown> } | null
}

function event(type: string, seq: number, data: unknown): Match['event'] {
  return { type, seq, data }
}

function call(turn: number, callId: string, name: string): Match {
  return { event: event('tool/call', 10, { turn, callId, name, arguments: '{}' }) }
}

function result(turn: number, callId: string, extra: Record<string, unknown> = {}): Match {
  return {
    event: event('tool/result', 20, {
      turn,
      message: { isError: false, source: { callId }, content: [{ type: 'text', text: 'done' }] },
      ...extra,
    }),
  }
}

function run(turn: number, matches: readonly Match[]): State {
  const started = definition.start({}, { event: event('turn/start', 1, { turn }) })
  return matches.reduce<State>((state, match) => definition.update({ state }, match), started)
}

describe('genui turn receipts', () => {
  it('publishes the last successful receipt of the turn', () => {
    const state = run(3, [
      call(3, 'c1', 'genui_create'),
      result(3, 'c1', { meta: { card: 'genui', artifactId: 'app-one', title: 'One', versionId: 'v-a' } }),
      call(3, 'c2', 'genui_update'),
      result(3, 'c2', { meta: { card: 'genui', artifactId: 'app-one', title: 'One v2', versionId: 'v-b' } }),
    ])
    const published = definition.buildLocationData({ state }, 'turn', undefined)
    expect(published?.kind).toBe('turn')
    expect(published?.key).toBe('genui')
    expect(published?.value).toMatchObject({ receipts: [{ callId: 'c1' }, { callId: 'c2' }] })
  })

  it('ignores calls to tools that do not render an app', () => {
    const state = run(4, [
      call(4, 'c1', 'genui_state_read'),
      result(4, 'c1'),
    ])
    expect(definition.buildLocationData({ state }, 'turn', undefined)).toBeNull()
  })

  it('keeps the previous receipt when a later update fails', () => {
    const state = run(5, [
      call(5, 'c1', 'genui_create'),
      result(5, 'c1', { meta: { card: 'genui', artifactId: 'app', title: 'App', versionId: 'v-a' } }),
      call(5, 'c2', 'genui_update'),
      { event: event('tool/result', 21, { turn: 5, message: { isError: true, source: { callId: 'c2' } } }) },
    ])
    expect(definition.buildLocationData({ state }, 'turn', undefined)?.value)
      .toMatchObject({ receipts: [{ callId: 'c1' }] })
  })

  it('matches only Turn and tool lifecycle events', () => {
    expect(definition.match(event('turn/start', 1, { turn: 1 }))).toEqual({ id: '1', role: 'start' })
    expect(definition.match(event('tool/call', 2, { turn: 1 }))).toEqual({ id: '1', role: 'update' })
    expect(definition.match(event('tool/result', 3, { turn: 1 }))).toEqual({ id: '1', role: 'update' })
    expect(definition.match(event('assistant/text', 4, { turn: 1 }))).toBeNull()
    expect(definition.match(event('turn/start', 5, {}))).toBeNull()
  })

  it('reads the receipts the definition published for one turn', () => {
    const value = { receipts: [{ callId: 'c9', content: [{ type: 'text', text: 'x' }] }] }
    const turn = { data: { get: (key: string) => key === 'genui' ? value : undefined } }
    expect(genuiTurnReceipts(turn)).toEqual(value.receipts)
    expect(genuiTurnReceipts({ data: { get: () => undefined } })).toEqual([])
    expect(genuiTurnReceipts(undefined)).toEqual([])
  })
})
