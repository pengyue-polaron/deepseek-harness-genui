import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { assertArtifactId, normalizeSourcePath, safeJoin } from './paths.ts'
import { MAX_VERSIONS_PER_ARTIFACT, TASK_TTL_MS } from '../lifecycle.ts'
import type {
  ArtifactCapability, ArtifactGrant, ArtifactRecord, ArtifactSessionState, ArtifactVersion,
  FilePatch, Requirement, SourceFile, VerificationEvidence,
} from './types.ts'

const RECORD_FILE = 'artifact.json'

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, path)
}

function sourceBytes(files: SourceFile[]): number {
  return files.reduce((total, file) => total + Buffer.byteLength(file.path) + Buffer.byteLength(file.content), 0)
}

function normalizeFiles(files: SourceFile[], maxSourceBytes: number): SourceFile[] {
  const byPath = new Map<string, SourceFile>()
  for (const file of files) {
    const path = normalizeSourcePath(file.path)
    if (byPath.has(path)) throw new Error(`duplicate source path: ${path}`)
    byPath.set(path, { path, content: file.content })
  }
  const normalized = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
  if (!normalized.some(file => file.path === 'src/main.tsx')) throw new Error('src/main.tsx is required')
  if (sourceBytes(normalized) > maxSourceBytes) throw new Error(`artifact source exceeds ${maxSourceBytes} bytes`)
  return normalized
}

function requirementId(): string {
  return `req-${randomUUID().slice(0, 8)}`
}

function acceptSchemaVersion(value: { schemaVersion?: 1 }, kind: 'artifact' | 'artifact version'): void {
  const schemaVersion: unknown = value.schemaVersion
  if (schemaVersion !== undefined && schemaVersion !== 1) {
    throw new Error(`unsupported ${kind} schema version: ${String(schemaVersion)}`)
  }
  value.schemaVersion = 1
}

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

function normalizeCapabilities(capabilities: ArtifactCapability[]): ArtifactCapability[] {
  const byId = new Map<string, ArtifactCapability>()
  for (const capability of capabilities) {
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(capability.id)) throw new Error(`invalid capability id: ${capability.id}`)
    if (byId.has(capability.id)) throw new Error(`duplicate capability id: ${capability.id}`)
    const label = capability.label.trim()
    const reason = capability.reason.trim()
    if (label.length < 2 || label.length > 80) throw new Error(`invalid capability label: ${capability.id}`)
    if (reason.length < 4 || reason.length > 240) throw new Error(`invalid capability reason: ${capability.id}`)
    if (capability.access !== 'read' && capability.access !== 'write') throw new Error(`invalid capability access: ${capability.id}`)
    if (capability.kind === 'tool') {
      if (capability.tool.trim() === '' || capability.tool.startsWith('genui_')) throw new Error(`invalid tool capability: ${capability.id}`)
      byId.set(capability.id, { ...capability, label, reason, tool: capability.tool.trim() })
      continue
    }
    const target = new URL(capability.urlPrefix)
    if (target.protocol !== 'https:' || target.username !== '' || target.password !== '' || target.hash !== '') {
      throw new Error(`external capability must use a credential-free HTTPS URL: ${capability.id}`)
    }
    const methods = [...new Set(capability.methods.map(method => method.toUpperCase()))]
    if (methods.length === 0 || methods.some(method => !HTTP_METHODS.has(method))) throw new Error(`invalid external methods: ${capability.id}`)
    byId.set(capability.id, {
      ...capability,
      label,
      reason,
      urlPrefix: target.toString(),
      methods: methods as Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>,
    })
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export class ArtifactRegistry {
  readonly root: string
  private readonly mutationQueues = new Map<string, Promise<void>>()

  constructor(root: string, private readonly maxSourceBytes: number) {
    this.root = resolve(root)
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const entries = await readdir(this.root, { withFileTypes: true })
    await Promise.all(entries.filter(entry => entry.isDirectory()).map(async entry => {
      try {
        const id = assertArtifactId(entry.name)
        const record = await readJson<ArtifactRecord>(this.recordPath(id))
        if (Date.parse(record.updatedAt) + TASK_TTL_MS <= Date.now()) {
          await rm(safeJoin(this.root, id), { recursive: true, force: true })
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT'
          && !(error instanceof Error && error.message.startsWith('artifact id must be'))) throw error
      }
    }))
  }

  private recordPath(id: string): string {
    return safeJoin(this.root, assertArtifactId(id), RECORD_FILE)
  }

  private versionPath(id: string, versionId: string): string {
    if (!/^v-[a-f0-9-]{36}$/.test(versionId)) throw new Error('invalid version id')
    return safeJoin(this.root, assertArtifactId(id), 'versions', versionId, 'version.json')
  }

  distPath(id: string, versionId: string): string {
    return safeJoin(dirname(this.versionPath(id, versionId)), 'dist')
  }

  async get(id: string): Promise<ArtifactRecord> {
    const record = await readJson<ArtifactRecord>(this.recordPath(id))
    acceptSchemaVersion(record, 'artifact')
    return record
  }

  async getVersion(id: string, versionId?: string): Promise<ArtifactVersion> {
    const record = await this.get(id)
    const selected = versionId ?? record.currentVersionId ?? record.latestVersionId
    const version = await readJson<ArtifactVersion>(this.versionPath(id, selected))
    acceptSchemaVersion(version, 'artifact version')
    return version
  }

  async create(input: {
    id: string
    title: string
    summary: string
    requirements: string[]
    capabilities: ArtifactCapability[]
    files: SourceFile[]
  }): Promise<ArtifactVersion> {
    const id = assertArtifactId(input.id)
    return this.withMutationLock(id, async () => {
      try {
        await this.get(id)
        throw new Error(`artifact already exists: ${id}`)
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('artifact already exists:')) throw error
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT') throw error
      }
      const versionId = `v-${randomUUID()}`
      const now = new Date().toISOString()
      const requirements: Requirement[] = input.requirements.map(text => ({
        id: requirementId(), text, status: 'active', introducedIn: versionId,
      }))
      const version = this.makeCandidate(id, versionId, undefined, input.summary, input.files, requirements, input.capabilities, now)
      const record: ArtifactRecord = {
        schemaVersion: 1,
        id,
        title: input.title,
        createdAt: now,
        updatedAt: now,
        latestVersionId: versionId,
        versions: [versionId],
        states: {},
        grants: {},
      }
      await atomicJson(this.versionPath(id, versionId), version)
      await this.saveRecord(record)
      return version
    })
  }

  async update(input: {
    id: string
    baseVersionId: string
    summary: string
    patches: FilePatch[]
    addRequirements?: string[]
    supersedeRequirements?: string[]
    capabilities?: ArtifactCapability[]
  }): Promise<ArtifactVersion> {
    return this.withMutationLock(input.id, async () => {
      const record = await this.get(input.id)
      const expectedBaseVersionId = record.currentVersionId ?? record.latestVersionId
      if (expectedBaseVersionId !== input.baseVersionId) {
        throw new Error(`base version is stale; expected ${expectedBaseVersionId}`)
      }
      const base = await this.getVersion(input.id, input.baseVersionId)
      const files = new Map(base.files.map(file => [file.path, file]))
      for (const patch of input.patches) {
        const path = normalizeSourcePath(patch.path)
        if (patch.delete === true) files.delete(path)
        else if (patch.content !== undefined) files.set(path, { path, content: patch.content })
        else throw new Error(`patch must provide content or delete: ${path}`)
      }
      const versionId = `v-${randomUUID()}`
      const superseded = new Set(input.supersedeRequirements ?? [])
      const requirements: Requirement[] = base.requirements.map(requirement =>
        superseded.has(requirement.id) ? { ...requirement, status: 'superseded' } : requirement)
      for (const text of input.addRequirements ?? []) {
        requirements.push({ id: requirementId(), text, status: 'active', introducedIn: versionId })
      }
      const now = new Date().toISOString()
      const version = this.makeCandidate(
        input.id, versionId, base.id, input.summary, [...files.values()], requirements,
        input.capabilities ?? base.capabilities, now,
      )
      record.updatedAt = now
      record.latestVersionId = versionId
      record.versions.push(versionId)
      await atomicJson(this.versionPath(input.id, versionId), version)
      await this.saveRecord(record)
      return version
    })
  }

  async settle(id: string, versionId: string, evidence: VerificationEvidence): Promise<ArtifactVersion> {
    return this.withMutationLock(id, async () => {
      const record = await this.get(id)
      const version = await this.getVersion(id, versionId)
      if (version.status !== 'candidate') throw new Error(`version is already settled: ${versionId}`)
      version.evidence = evidence
      version.status = evidence.build === 'passed' && evidence.browser !== 'failed' ? 'ready' : 'failed'
      if (version.status === 'ready') record.currentVersionId = versionId
      record.updatedAt = new Date().toISOString()
      await atomicJson(this.versionPath(id, versionId), version)
      await this.saveRecord(record)
      return version
    })
  }

  async rollback(id: string, versionId: string): Promise<ArtifactRecord> {
    return this.withMutationLock(id, async () => {
      const record = await this.get(id)
      const version = await this.getVersion(id, versionId)
      if (version.status !== 'ready') throw new Error('rollback target must be a ready version')
      record.currentVersionId = versionId
      record.updatedAt = new Date().toISOString()
      await this.saveRecord(record)
      return record
    })
  }

  async reportRuntimeFailure(id: string, versionId: string): Promise<{
    failedVersionId: string
    fallbackVersionId?: string
  }> {
    return this.withMutationLock(id, async () => {
      const record = await this.get(id)
      const version = await this.getVersion(id, versionId)
      if (version.status === 'failed' && version.evidence.browser === 'failed') {
        const fallbackVersionId = record.currentVersionId === versionId ? undefined : record.currentVersionId
        return {
          failedVersionId: versionId,
          ...(fallbackVersionId === undefined ? {} : { fallbackVersionId }),
        }
      }
      if (record.currentVersionId !== versionId || version.status !== 'ready') {
        throw new Error('runtime failure must target the current ready version')
      }
      const diagnostic = 'Runtime error reported by the sandboxed app host.'
      version.status = 'failed'
      version.evidence = {
        ...version.evidence,
        checkedAt: new Date().toISOString(),
        browser: 'failed',
        diagnostics: version.evidence.diagnostics.some(item => item.text === diagnostic)
          ? version.evidence.diagnostics
          : [...version.evidence.diagnostics, { severity: 'error', text: diagnostic }],
        notes: version.evidence.notes.includes('runtime failure quarantined; last-known-good version restored')
          ? version.evidence.notes
          : [...version.evidence.notes, 'runtime failure quarantined; last-known-good version restored'],
      }
      await atomicJson(this.versionPath(id, versionId), version)

      let fallbackVersionId: string | undefined
      for (const candidateId of [...record.versions].reverse()) {
        if (candidateId === versionId) continue
        const candidate = await this.getVersion(id, candidateId)
        if (candidate.status === 'ready') {
          fallbackVersionId = candidate.id
          break
        }
      }
      if (fallbackVersionId === undefined) delete record.currentVersionId
      else record.currentVersionId = fallbackVersionId
      record.updatedAt = new Date().toISOString()
      await this.saveRecord(record)
      return {
        failedVersionId: versionId,
        ...(fallbackVersionId === undefined ? {} : { fallbackVersionId }),
      }
    })
  }

  async readState(id: string, sessionId: string): Promise<ArtifactSessionState | undefined> {
    return this.withMutationLock(id, async () => {
      const record = await this.get(id)
      const state = record.states[sessionId]
      if (state === undefined) return undefined
      if (Date.parse(state.expiresAt) > Date.now()) return structuredClone(state)
      delete record.states[sessionId]
      await this.saveRecord(record)
      return undefined
    })
  }

  async updateState(id: string, sessionId: string, updater: (state: Record<string, unknown>) => Record<string, unknown>): Promise<ArtifactRecord> {
    return this.withMutationLock(id, async () => {
      const record = await this.get(id)
      const now = new Date()
      const current = record.states[sessionId]
      const values = current === undefined || Date.parse(current.expiresAt) <= now.valueOf() ? {} : current.values
      record.states[sessionId] = {
        values: updater(structuredClone(values)),
        updatedAt: now.toISOString(),
        expiresAt: new Date(now.valueOf() + TASK_TTL_MS).toISOString(),
      }
      record.updatedAt = now.toISOString()
      await this.saveRecord(record)
      return record
    })
  }

  async grantCapability(id: string, sessionId: string, capabilityId: string, grant: ArtifactGrant): Promise<ArtifactRecord> {
    return this.grantCapabilities(id, sessionId, { [capabilityId]: grant })
  }

  async grantCapabilities(id: string, sessionId: string, incoming: Record<string, ArtifactGrant>): Promise<ArtifactRecord> {
    return this.withMutationLock(id, async () => {
      const record = await this.get(id)
      const grants = record.grants[sessionId] ?? {}
      for (const [capabilityId, grant] of Object.entries(incoming)) grants[capabilityId] = grant
      record.grants[sessionId] = grants
      record.updatedAt = new Date().toISOString()
      await this.saveRecord(record)
      return record
    })
  }

  async readGrants(id: string, sessionId: string): Promise<Record<string, ArtifactGrant>> {
    return this.withMutationLock(id, async () => {
      const record = await this.get(id)
      const grants = record.grants[sessionId]
      if (grants === undefined) return {}
      const active = Object.fromEntries(Object.entries(grants).filter(([, grant]) => Date.parse(grant.expiresAt) > Date.now()))
      if (Object.keys(active).length !== Object.keys(grants).length) {
        if (Object.keys(active).length === 0) delete record.grants[sessionId]
        else record.grants[sessionId] = active
        await this.saveRecord(record)
      }
      return structuredClone(active)
    })
  }

  async revokeCapability(id: string, sessionId: string, capabilityId: string): Promise<boolean> {
    return this.withMutationLock(id, async () => {
      const record = await this.get(id)
      const grants = record.grants[sessionId]
      if (grants === undefined || grants[capabilityId] === undefined) return false
      delete grants[capabilityId]
      if (Object.keys(grants).length === 0) delete record.grants[sessionId]
      record.updatedAt = new Date().toISOString()
      await this.saveRecord(record)
      return true
    })
  }

  private async saveRecord(record: ArtifactRecord): Promise<void> {
    record.schemaVersion = 1
    const protectedIds = new Set([record.currentVersionId, record.latestVersionId].filter((value): value is string => value !== undefined))
    const newest = [...record.versions].reverse()
    const retained = new Set<string>(protectedIds)
    for (const versionId of newest) {
      if (retained.size >= MAX_VERSIONS_PER_ARTIFACT) break
      retained.add(versionId)
    }
    const removed = record.versions.filter(versionId => !retained.has(versionId))
    if (removed.length > 0) record.versions = record.versions.filter(versionId => retained.has(versionId))
    await atomicJson(this.recordPath(record.id), record)
    await Promise.all(removed.map(versionId => rm(dirname(this.versionPath(record.id, versionId)), { recursive: true, force: true })))
  }

  private async withMutationLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueues.get(id) ?? Promise.resolve()
    let release = (): void => {}
    const current = new Promise<void>(resolve => { release = resolve })
    const queued = previous.then(() => current)
    this.mutationQueues.set(id, queued)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.mutationQueues.get(id) === queued) this.mutationQueues.delete(id)
    }
  }

  private makeCandidate(
    artifactId: string,
    id: string,
    parentVersionId: string | undefined,
    summary: string,
    files: SourceFile[],
    requirements: Requirement[],
    capabilities: ArtifactCapability[],
    createdAt: string,
  ): ArtifactVersion {
    return {
      schemaVersion: 1,
      id,
      artifactId,
      ...(parentVersionId === undefined ? {} : { parentVersionId }),
      createdAt,
      summary,
      files: normalizeFiles(files, this.maxSourceBytes),
      requirements,
      capabilities: normalizeCapabilities(capabilities),
      status: 'candidate',
      evidence: { checkedAt: createdAt, build: 'failed', browser: 'not-run', diagnostics: [], notes: [] },
    }
  }
}
