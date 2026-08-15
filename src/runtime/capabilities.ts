import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { open, readFile } from 'node:fs/promises'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { TASK_TTL_MS, VERIFICATION_TOKEN_TTL_MS } from '../lifecycle.ts'

export type CapabilityMode = 'interactive' | 'verification'

interface CapabilityPayload {
  version: 1
  artifactId: string
  sessionId: string
  mode: CapabilityMode
  nonce: string
  expiresAt: number
}

interface Capability {
  artifactId: string
  sessionId: string
  agent: Agent
  mode: CapabilityMode
}

type AgentResolver = (sessionId: string) => Agent | undefined

async function persistentSecret(path: string): Promise<Buffer> {
  try {
    return await readFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const secret = randomBytes(32)
  try {
    const handle = await open(path, 'wx', 0o600)
    try {
      await handle.writeFile(secret)
    } finally {
      await handle.close()
    }
    return secret
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    return readFile(path)
  }
}

function encode(payload: CapabilityPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function decode(value: string): CapabilityPayload | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const payload = parsed as Partial<CapabilityPayload>
    if (payload.version !== 1 || typeof payload.artifactId !== 'string' || typeof payload.sessionId !== 'string'
      || (payload.mode !== 'interactive' && payload.mode !== 'verification') || typeof payload.nonce !== 'string'
      || typeof payload.expiresAt !== 'number') return undefined
    return payload as CapabilityPayload
  } catch {
    return undefined
  }
}

export class CapabilityStore {
  private readonly agents = new Map<string, Agent>()
  private readonly revoked = new Set<string>()
  private readonly interactiveTokens = new Map<string, { token: string; expiresAt: number }>()

  constructor(
    private readonly resolveAgent?: AgentResolver,
    private readonly secret: Buffer<ArrayBufferLike> = randomBytes(32),
  ) {}

  static async persistent(path: string, resolveAgent: AgentResolver): Promise<CapabilityStore> {
    return new CapabilityStore(resolveAgent, await persistentSecret(path))
  }

  issue(artifactId: string, agent: Agent, mode: CapabilityMode = 'interactive'): string {
    const sessionId = String(agent.id)
    this.agents.set(sessionId, agent)
    const tokenKey = `${artifactId}\0${sessionId}`
    const current = this.interactiveTokens.get(tokenKey)
    if (mode === 'interactive' && current !== undefined && current.expiresAt > Date.now()) return current.token
    const expiresAt = Date.now() + (mode === 'verification' ? VERIFICATION_TOKEN_TTL_MS : TASK_TTL_MS)
    const payload = encode({
      version: 1,
      artifactId,
      sessionId,
      mode,
      nonce: mode === 'interactive' ? 'task' : randomBytes(16).toString('base64url'),
      expiresAt,
    })
    const token = `${payload}.${this.sign(payload)}`
    if (mode === 'interactive') this.interactiveTokens.set(tokenKey, { token, expiresAt })
    return token
  }

  resolve(token: string, artifactId: string): Capability | undefined {
    if (this.revoked.has(token)) return undefined
    const parts = token.split('.')
    if (parts.length !== 2) return undefined
    const [encoded = '', signature = ''] = parts
    const expected = Buffer.from(this.sign(encoded), 'base64url')
    const received = Buffer.from(signature, 'base64url')
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return undefined
    const payload = decode(encoded)
    if (payload === undefined || payload.artifactId !== artifactId || payload.expiresAt <= Date.now()) return undefined
    const agent = this.agents.get(payload.sessionId) ?? this.resolveAgent?.(payload.sessionId)
    if (agent === undefined) return undefined
    return { artifactId: payload.artifactId, sessionId: payload.sessionId, agent, mode: payload.mode }
  }

  revoke(token: string): void {
    this.revoked.add(token)
  }

  clear(): void {
    this.agents.clear()
    this.revoked.clear()
    this.interactiveTokens.clear()
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url')
  }
}
