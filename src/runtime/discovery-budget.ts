import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'

const MAX_DISCOVERY_CALLS_PER_SOURCE = 2
const MAX_READ_CALLS_PER_SOURCE = 4
const MAX_READ_CALLS_PER_TURN = 6

const DISCOVERY_VERBS = /(?:^|_)(?:browse|discover|find|list|lookup|query|search|whoami)(?:_|$)/i
const MUTATION_VERBS = /(?:^|_)(?:add|approve|cancel|create|delete|execute|merge|move|post|put|remove|run|send|set|start|stop|trigger|update|upload|write)(?:_|$)/i

interface SourceCall {
  source: string
  discovery: boolean
}

interface SourceUsage {
  discovery: number
  reads: number
}

interface TurnUsage {
  reads: number
  sources: Map<string, SourceUsage>
}

function mcpCall(name: string, args: unknown): SourceCall | undefined {
  const match = /^mcp__(.+?)__(.+)$/.exec(name)
  if (match === null) return undefined
  const source = match[1] as string
  const operation = match[2] as string
  if (MUTATION_VERBS.test(operation)) return undefined

  const fsCommand = operation === 'hf_fs' && typeof args === 'object' && args !== null && 'cmd' in args
    ? String((args as { cmd?: unknown }).cmd ?? '')
    : ''
  return { source, discovery: DISCOVERY_VERBS.test(operation) || /^(?:ls|search)$/.test(fsCommand) }
}

function connectedRead(exec: ToolExecution): SourceCall | undefined {
  if (String(exec.callId).startsWith('genui-') || exec.name.startsWith('genui_')) return undefined
  const mcp = mcpCall(exec.name, exec.arguments)
  if (mcp !== undefined) return mcp
  if (exec.name === 'web_search' || exec.name === 'web_fetch') return { source: 'web', discovery: true }
  return undefined
}

function denial(source: string, limit: 'discovery' | 'source' | 'turn'): string {
  const scope = limit === 'discovery'
    ? `the discovery limit for ${source}`
    : limit === 'source'
      ? `the read limit for ${source}`
      : 'the connected-source read limit for this turn'
  return `You reached ${scope}. Do not try another query or connected read to work around the limit. Use the successful evidence already returned, state any remaining uncertainty briefly, then answer or create the useful interactive surface now.`
}

export class DiscoveryBudget {
  private readonly usage = new WeakMap<Agent, TurnUsage>()

  reset(agent: Agent): void {
    this.usage.delete(agent)
  }

  check(exec: ToolExecution): string | undefined {
    if (exec.agent === undefined) return undefined
    const call = connectedRead(exec)
    if (call === undefined) return undefined

    const turn = this.usage.get(exec.agent) ?? { reads: 0, sources: new Map<string, SourceUsage>() }
    const source = turn.sources.get(call.source) ?? { discovery: 0, reads: 0 }
    if (call.discovery && source.discovery >= MAX_DISCOVERY_CALLS_PER_SOURCE) return denial(call.source, 'discovery')
    if (source.reads >= MAX_READ_CALLS_PER_SOURCE) return denial(call.source, 'source')
    if (turn.reads >= MAX_READ_CALLS_PER_TURN) return denial(call.source, 'turn')

    source.reads += 1
    if (call.discovery) source.discovery += 1
    turn.reads += 1
    turn.sources.set(call.source, source)
    this.usage.set(exec.agent, turn)
    return undefined
  }
}

export function registerDiscoveryBudget(ctx: Context): void {
  const budget = new DiscoveryBudget()
  ctx.on('tools/pre-execute', async (exec, next) => {
    const reason = budget.check(exec)
    return reason === undefined ? next() : { kind: 'deny', reason }
  })
  ctx.on('agent/pre-step', ({ agent, messages }, next) => {
    if (messages.some(message => message.source.kind === 'user')) budget.reset(agent)
    return next()
  })
}
