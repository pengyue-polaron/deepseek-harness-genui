import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ArtifactRegistry } from '../src/artifacts/registry.ts'
import { MAX_VERSIONS_PER_ARTIFACT, TASK_TTL_MS } from '../src/lifecycle.ts'

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

  it('quarantines a runtime failure and restores the previous ready version', async () => {
    const store = await registry()
    const first = await store.create({ id: 'runtime-app', title: 'Runtime', summary: 'working', requirements: [], capabilities: [], files: initialFiles })
    await store.settle('runtime-app', first.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    const second = await store.update({
      id: 'runtime-app', baseVersionId: first.id, summary: 'runtime regression',
      patches: [{ path: 'src/App.tsx', content: 'throw new Error("runtime regression")' }],
    })
    await store.settle('runtime-app', second.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })

    await expect(store.reportRuntimeFailure('runtime-app', first.id))
      .rejects.toThrow('runtime failure must target the current ready version')
    expect((await store.get('runtime-app')).currentVersionId).toBe(second.id)
    expect((await store.getVersion('runtime-app', first.id)).status).toBe('ready')

    await expect(store.reportRuntimeFailure('runtime-app', second.id)).resolves.toEqual({
      failedVersionId: second.id,
      fallbackVersionId: first.id,
    })
    expect((await store.get('runtime-app')).currentVersionId).toBe(first.id)
    expect(await store.getVersion('runtime-app', second.id)).toMatchObject({
      status: 'failed',
      evidence: {
        build: 'passed',
        browser: 'failed',
        diagnostics: [expect.objectContaining({ severity: 'error', text: expect.stringContaining('Runtime error') })],
      },
    })
    await expect(store.reportRuntimeFailure('runtime-app', second.id)).resolves.toEqual({
      failedVersionId: second.id,
      fallbackVersionId: first.id,
    })
  })

  it('loads pre-schema records and marks them with schema version 1', async () => {
    const store = await registry()
    const version = await store.create({ id: 'legacy-app', title: 'Legacy', summary: 'legacy fixture', requirements: [], capabilities: [], files: initialFiles })
    const recordPath = join(store.root, 'legacy-app', 'artifact.json')
    const versionPath = join(store.root, 'legacy-app', 'versions', version.id, 'version.json')
    for (const path of [recordPath, versionPath]) {
      const value = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
      delete value.schemaVersion
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
    }

    expect((await store.get('legacy-app')).schemaVersion).toBe(1)
    expect((await store.getVersion('legacy-app', version.id)).schemaVersion).toBe(1)
  })

  it('rejects records from an unknown future schema instead of rewriting them', async () => {
    const store = await registry()
    const version = await store.create({ id: 'future-app', title: 'Future', summary: 'future fixture', requirements: [], capabilities: [], files: initialFiles })
    const recordPath = join(store.root, 'future-app', 'artifact.json')
    const record = JSON.parse(await readFile(recordPath, 'utf8')) as Record<string, unknown>
    record.schemaVersion = 2
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`)
    await expect(store.get('future-app')).rejects.toThrow('unsupported artifact schema version: 2')

    record.schemaVersion = 1
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`)
    const versionPath = join(store.root, 'future-app', 'versions', version.id, 'version.json')
    const futureVersion = JSON.parse(await readFile(versionPath, 'utf8')) as Record<string, unknown>
    futureVersion.schemaVersion = 2
    await writeFile(versionPath, `${JSON.stringify(futureVersion, null, 2)}\n`)
    await expect(store.getVersion('future-app', version.id)).rejects.toThrow('unsupported artifact version schema version: 2')
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

  it('removes artifacts after the task lifetime', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-genui-test-'))
    roots.push(root)
    const store = new ArtifactRegistry(root, 128 * 1024)
    await store.init()
    await store.create({ id: 'expired-app', title: 'Expired', summary: 'initial', requirements: [], capabilities: [], files: initialFiles })
    const recordPath = join(root, 'expired-app', 'artifact.json')
    const record = JSON.parse(await readFile(recordPath, 'utf8')) as { updatedAt: string }
    record.updatedAt = new Date(Date.now() - TASK_TTL_MS - 1).toISOString()
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`)

    await new ArtifactRegistry(root, 128 * 1024).init()

    await expect(store.get('expired-app')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps only the newest 20 versions including the active version', async () => {
    const store = await registry()
    let version = await store.create({ id: 'long-task', title: 'Long task', summary: 'initial', requirements: [], capabilities: [], files: initialFiles })
    const firstVersionId = version.id
    await store.settle('long-task', version.id, {
      checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
    })
    for (let index = 0; index < MAX_VERSIONS_PER_ARTIFACT + 2; index += 1) {
      version = await store.update({
        id: 'long-task', baseVersionId: version.id, summary: `update ${index}`,
        patches: [{ path: 'src/App.tsx', content: `export const App = () => ${index}` }],
      })
      await store.settle('long-task', version.id, {
        checkedAt: new Date().toISOString(), build: 'passed', browser: 'not-run', diagnostics: [], notes: [],
      })
    }

    const record = await store.get('long-task')
    expect(record.versions).toHaveLength(MAX_VERSIONS_PER_ARTIFACT)
    expect(record.currentVersionId).toBe(version.id)
    expect(record.latestVersionId).toBe(version.id)
    await expect(store.getVersion('long-task', firstVersionId)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('lists active grants and lets the task revoke them', async () => {
    const store = await registry()
    await store.create({ id: 'permission-app', title: 'Permission', summary: 'initial', requirements: [], capabilities: [], files: initialFiles })
    await store.grantCapability('permission-app', 'session-a', 'calendar-write', {
      fingerprint: 'fingerprint', grantedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    await store.grantCapability('permission-app', 'session-a', 'expired', {
      fingerprint: 'expired', grantedAt: new Date(0).toISOString(), expiresAt: new Date(0).toISOString(),
    })

    expect(await store.readGrants('permission-app', 'session-a')).toEqual({
      'calendar-write': expect.objectContaining({ fingerprint: 'fingerprint' }),
    })
    expect(await store.revokeCapability('permission-app', 'session-a', 'calendar-write')).toBe(true)
    expect(await store.revokeCapability('permission-app', 'session-a', 'calendar-write')).toBe(false)
    expect(await store.readGrants('permission-app', 'session-a')).toEqual({})
  })
})
