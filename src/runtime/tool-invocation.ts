import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'

/**
 * Harness 0.2.2 replaced the single-call execution API with a batch one:
 * `execute({ calls, signal, agent })` settles `{ results: [{ result }] }`,
 * while every earlier host takes one `{ callId, name, arguments, ... }` and
 * resolves that result directly. Both generations have shipped in a released
 * plugin, so the same bundle must serve either shape.
 *
 * `setExecutor` is the runtime marker: it arrived in the same release as the
 * batch API and is absent from every earlier host, so a single feature test
 * selects the right call without probing a tool.
 */
interface ToolServiceLike {
  setExecutor?: unknown
  execute(input: unknown): Promise<unknown>
}

interface BatchOutcome {
  results?: readonly { result?: ToolExecutionResult }[]
}

/** One call's settled outcome, normalized across both execution APIs. */
export type ToolInvocation =
  | { ok: true; result: ToolExecutionResult }
  | { ok: false; error: { message: string; code?: string | undefined } }

/** Whether this host takes model-shaped call batches instead of one call. */
export function toolsUseBatchApi(tools: unknown): boolean {
  return typeof tools === 'object' && tools !== null
    && typeof (tools as ToolServiceLike).setExecutor === 'function'
}

// CallId was renamed to ToolCallId in Harness 0.1.5. Both are string brands,
// so the id is minted as a plain string and branded by the call site.
let callSequence = 0
export function nextToolCallId(): string {
  callSequence += 1
  return `genui-${Date.now()}-${callSequence}-${Math.random().toString(36).slice(2)}`
}

/**
 * Run one connected tool through whichever execution API the host exposes.
 * @param tools - the host's tool service, taken structurally so one bundle
 *   compiles against both the single-call and the batch generation.
 * @param call - the proxied tool name, its arguments, the owning Agent, and a
 *   cancellation signal.
 * @returns the normalized outcome; execution failures stay data, not throws.
 */
export async function invokeTool(
  tools: unknown,
  call: {
    name: string
    arguments: Record<string, unknown> | undefined
    agent: Agent
    signal: AbortSignal
  },
): Promise<ToolInvocation> {
  const service = tools as ToolServiceLike
  const argumentsValue = call.arguments ?? {}
  const callId = nextToolCallId()
  const result = toolsUseBatchApi(service)
    ? await executeBatch(service, callId, call, argumentsValue)
    : await executeSingle(service, callId, call, argumentsValue)
  if (result === undefined) {
    return { ok: false, error: { message: 'the connected action produced no result' } }
  }
  if (result.isError) {
    return { ok: false, error: { message: result.error.message, code: result.error.info?.code } }
  }
  return { ok: true, result }
}

async function executeBatch(
  service: ToolServiceLike,
  callId: string,
  call: { name: string; agent: Agent; signal: AbortSignal },
  args: Record<string, unknown>,
): Promise<ToolExecutionResult | undefined> {
  const batch = await service.execute({
    calls: [{ type: 'tool-call', id: callId, name: call.name, arguments: JSON.stringify(args) }],
    agent: call.agent,
    signal: call.signal,
  }) as BatchOutcome
  return batch.results?.[0]?.result
}

async function executeSingle(
  service: ToolServiceLike,
  callId: string,
  call: { name: string; agent: Agent; signal: AbortSignal },
  args: Record<string, unknown>,
): Promise<ToolExecutionResult | undefined> {
  return await service.execute({
    callId,
    name: call.name,
    arguments: args,
    agent: call.agent,
    signal: call.signal,
  }) as ToolExecutionResult
}
