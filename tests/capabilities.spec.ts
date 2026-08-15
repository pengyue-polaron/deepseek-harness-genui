import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { CapabilityStore } from '../src/runtime/capabilities.ts'
import { TASK_TTL_MS, VERIFICATION_TOKEN_TTL_MS } from '../src/lifecycle.ts'

const roots: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('CapabilityStore', () => {
  it('validates an interactive capability after reconstructing the store', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-genui-capability-'))
    roots.push(root)
    const keyPath = join(root, '.capability-key')
    const agent = { id: SessionId('durable-session') } as Agent
    const first = await CapabilityStore.persistent(keyPath, () => undefined)
    const token = first.issue('durable-artifact', agent)
    expect(first.issue('durable-artifact', agent)).toBe(token)

    const restored = await CapabilityStore.persistent(keyPath, sessionId => sessionId === String(agent.id) ? agent : undefined)
    expect(restored.resolve(token, 'durable-artifact')).toMatchObject({
      artifactId: 'durable-artifact', mode: 'interactive', agent,
    })
    expect(restored.resolve(token, 'another-artifact')).toBeUndefined()
    expect(restored.resolve(`${token}x`, 'durable-artifact')).toBeUndefined()
  })

  it('revokes a verification capability within its process', () => {
    const agent = { id: SessionId('verification-session') } as Agent
    const store = new CapabilityStore()
    const token = store.issue('candidate', agent, 'verification')
    expect(store.issue('candidate', agent, 'verification')).not.toBe(token)
    expect(store.resolve(token, 'candidate')?.mode).toBe('verification')
    store.revoke(token)
    expect(store.resolve(token, 'candidate')).toBeUndefined()
  })

  it('expires interactive links after the task lifetime', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-16T00:00:00Z'))
    const agent = { id: SessionId('interactive-session') } as Agent
    const store = new CapabilityStore()
    const token = store.issue('task-app', agent)
    vi.setSystemTime(Date.now() + TASK_TTL_MS - 1)
    expect(store.resolve(token, 'task-app')?.mode).toBe('interactive')
    vi.setSystemTime(Date.now() + 1)
    expect(store.resolve(token, 'task-app')).toBeUndefined()
  })

  it('expires verification links after five minutes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-16T00:00:00Z'))
    const agent = { id: SessionId('verification-expiry') } as Agent
    const store = new CapabilityStore()
    const token = store.issue('candidate', agent, 'verification')
    vi.setSystemTime(Date.now() + VERIFICATION_TOKEN_TTL_MS)
    expect(store.resolve(token, 'candidate')).toBeUndefined()
  })
})
