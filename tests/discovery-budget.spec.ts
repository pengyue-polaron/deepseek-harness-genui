import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { CallId } from '@deepseek-ai/dsh-llm'
import { DiscoveryBudget } from '../src/runtime/discovery-budget.ts'

const signal = new AbortController().signal
const agent = {} as Agent

function call(name: string, argumentsValue: unknown = {}, callId = name): ToolExecution {
  return {
    agent,
    name,
    arguments: argumentsValue,
    callId: CallId(callId),
    rootCallId: CallId(callId),
    signal,
    token: Symbol() as ToolExecution['token'],
  }
}

describe('DiscoveryBudget', () => {
  it('stops query sweeps while allowing batched detail reads', () => {
    const budget = new DiscoveryBudget()
    expect(budget.check(call('mcp__huggingface__hub_repo_search'))).toBeUndefined()
    expect(budget.check(call('mcp__huggingface__hf_fs', { cmd: 'search' }))).toBeUndefined()
    expect(budget.check(call('mcp__huggingface__hub_repo_search'))).toContain('discovery limit')
    expect(budget.check(call('mcp__huggingface__hub_repo_details'))).toBeUndefined()
    expect(budget.check(call('mcp__huggingface__hub_repo_details'))).toBeUndefined()
    expect(budget.check(call('mcp__huggingface__hub_repo_details'))).toContain('read limit')
  })

  it('caps total connected reads across sources', () => {
    const budget = new DiscoveryBudget()
    expect(budget.check(call('mcp__github__get_file_contents'))).toBeUndefined()
    expect(budget.check(call('mcp__github__get_issue'))).toBeUndefined()
    expect(budget.check(call('mcp__github__get_pull_request'))).toBeUndefined()
    expect(budget.check(call('mcp__calendar__get_events'))).toBeUndefined()
    expect(budget.check(call('mcp__calendar__get_event'))).toBeUndefined()
    expect(budget.check(call('mcp__huggingface__hub_repo_details'))).toBeUndefined()
    expect(budget.check(call('mcp__huggingface__hub_repo_details'))).toContain('connected-source read limit')
  })

  it('does not constrain writes, GenUI tools, app-dispatched calls, or direct execution', () => {
    const budget = new DiscoveryBudget()
    for (let index = 0; index < 8; index += 1) {
      expect(budget.check(call('mcp__calendar__create_event'))).toBeUndefined()
      expect(budget.check(call('genui_create'))).toBeUndefined()
      expect(budget.check(call('mcp__github__search_repositories', {}, `genui-${index}`))).toBeUndefined()
    }
    const { agent: _agent, ...direct } = call('mcp__github__search_repositories')
    expect(budget.check(direct)).toBeUndefined()
  })

  it('resets for the next user turn', () => {
    const budget = new DiscoveryBudget()
    expect(budget.check(call('web_search'))).toBeUndefined()
    expect(budget.check(call('web_search'))).toBeUndefined()
    expect(budget.check(call('web_search'))).toContain('discovery limit')
    budget.reset(agent)
    expect(budget.check(call('web_search'))).toBeUndefined()
  })
})
