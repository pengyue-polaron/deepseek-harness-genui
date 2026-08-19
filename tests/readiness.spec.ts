import { describe, expect, it } from 'vitest'
import { isGenuiReadyMessage, isGenuiRuntimeErrorMessage } from '../src/client/readiness.ts'

function event(source: Window, data: unknown): MessageEvent<unknown> {
  return { source, data } as MessageEvent<unknown>
}

describe('GenUI preview readiness', () => {
  const frame = {} as Window
  const ready = { source: 'dsh-genui', type: 'ready', artifactId: 'camping', versionId: 'v-2' }
  const runtimeError = { ...ready, type: 'runtime-error' }

  it('accepts only the current frame and displayed version', () => {
    expect(isGenuiReadyMessage(event(frame, ready), frame, 'camping', 'v-2')).toBe(true)
    expect(isGenuiReadyMessage(event({} as Window, ready), frame, 'camping', 'v-2')).toBe(false)
    expect(isGenuiReadyMessage(event(frame, ready), frame, 'camping', 'v-1')).toBe(false)
  })

  it('ignores unrelated window messages', () => {
    expect(isGenuiReadyMessage(event(frame, null), frame, 'camping', 'v-2')).toBe(false)
    expect(isGenuiReadyMessage(event(frame, { ...ready, type: 'resize' }), frame, 'camping', 'v-2')).toBe(false)
  })

  it('recognizes runtime failures only from the displayed app', () => {
    expect(isGenuiRuntimeErrorMessage(event(frame, runtimeError), frame, 'camping', 'v-2')).toBe(true)
    expect(isGenuiRuntimeErrorMessage(event(frame, runtimeError), frame, 'camping', 'v-1')).toBe(false)
    expect(isGenuiReadyMessage(event(frame, runtimeError), frame, 'camping', 'v-2')).toBe(false)
  })
})
