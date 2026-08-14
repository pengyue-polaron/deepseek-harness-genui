import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ArtifactRegistry } from '../src/artifacts/registry.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function registry(): Promise<ArtifactRegistry> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-genui-test-'))
  roots.push(root)
  const value = new ArtifactRegistry(root, 128 * 1024)
  await value.init()
  return value
}

const initialFiles = [
  { path: 'src/main.tsx', content: 'export {}' },
  { path: 'src/App.tsx', content: 'export const App = () => null' },
]

describe('ArtifactRegistry', () => {
  it('keeps failed candidates from replacing the last known good version', async () => {
    const store = await registry()
    const first = await store.create({ id: 'sample-app', title: 'Sample', summary: 'initial', requirements: ['show title'], capabilities: [], files: initialFiles })
    await store.settle('sample-app', first.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const candidate = await store.update({
      id: 'sample-app', baseVersionId: first.id, summary: 'broken update',
      patches: [{ path: 'src/App.tsx', content: 'broken(' }], addRequirements: ['add counter'],
    })
    await store.settle('sample-app', candidate.id, {
      checkedAt: new Date().toISOString(), build: 'failed', browser: 'not-run',
      diagnostics: [{ severity: 'error', text: 'parse failed' }], notes: [],
    })
    const record = await store.get('sample-app')
    expect(record.currentVersionId).toBe(first.id)
    expect(record.latestVersionId).toBe(candidate.id)
    expect((await store.getVersion('sample-app', candidate.id)).status).toBe('failed')
  })

  it('persists state outside source versions', async () => {
    const store = await registry()
    const first = await store.create({ id: 'state-app', title: 'State', summary: 'initial', requirements: [], capabilities: [], files: initialFiles })
    await store.settle('state-app', first.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    await store.updateState('state-app', 'session-a', state => ({ ...state, selected: 4 }))
    expect(await store.readState('state-app', 'session-b')).toBeUndefined()
    const second = await store.update({
      id: 'state-app', baseVersionId: first.id, summary: 'style update',
      patches: [{ path: 'src/App.tsx', content: 'export const App = () => <main />' }],
    })
    await store.settle('state-app', second.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    expect((await store.readState('state-app', 'session-a'))?.values).toEqual({ selected: 4 })
  })

  it('serializes concurrent state updates without losing keys', async () => {
    const store = await registry()
    await store.create({ id: 'concurrent-state', title: 'Concurrent', summary: 'initial', requirements: [], capabilities: [], files: initialFiles })

    await Promise.all(Array.from({ length: 20 }, (_, index) =>
      store.updateState('concurrent-state', 'session-a', state => ({ ...state, [`key${index}`]: index }))))

    expect((await store.readState('concurrent-state', 'session-a'))?.values).toEqual(
      Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`key${index}`, index])),
    )
  })

  it('rejects stale incremental updates', async () => {
    const store = await registry()
    const first = await store.create({ id: 'stale-app', title: 'Stale', summary: 'initial', requirements: [], capabilities: [], files: initialFiles })
    await store.settle('stale-app', first.id, {
      checkedAt: new Date().toISOString(), build: 'failed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const repaired = await store.update({ id: 'stale-app', baseVersionId: first.id, summary: 'repair initial candidate', patches: [] })
    await store.settle('stale-app', repaired.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    await expect(store.update({ id: 'stale-app', baseVersionId: first.id, summary: 'stale update', patches: [] }))
      .rejects.toThrow(`base version is stale; expected ${repaired.id}`)
  })
})
