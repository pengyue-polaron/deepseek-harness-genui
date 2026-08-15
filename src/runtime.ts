import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type { Config } from './config.ts'
import { resolveConfig } from './config.ts'
import { ArtifactRegistry } from './artifacts/registry.ts'
import { DesignStore } from './designs/store.ts'
import { CapabilityStore } from './runtime/capabilities.ts'
import { createHttpRuntime } from './runtime/server.ts'
import { registerGenuiTools } from './tools.ts'
import { genuiSystemPrompt } from './prompt.ts'

export async function apply(ctx: Context, config: Config): Promise<() => void> {
  const resolved = resolveConfig(config)
  const registry = new ArtifactRegistry(resolve(process.cwd(), resolved.artifactRoot), resolved.maxSourceBytes)
  await registry.init()
  const designs = new DesignStore(resolve(registry.root, '.designs'))
  await designs.init()
  const capabilities = await CapabilityStore.persistent(
    resolve(registry.root, '.capability-key'),
    sessionId => ctx.agents.get(SessionId(sessionId)),
  )

  const http = createHttpRuntime(ctx, registry, designs, capabilities, resolved.routePrefix)
  ctx.webServer.register({ kind: 'prefix', path: resolved.routePrefix, handler: http.handler })
  ctx.webServer.register({ kind: 'exact', path: '/.well-known/dsh-genui', handler: http.handler })
  ctx.systemPrompt.section({ name: 'tool:genui', order: 118, text: () => genuiSystemPrompt(designs.defaultId()) })
  const previewOrigin = `http://127.0.0.1:${ctx.webServer.port}`
  registerGenuiTools(ctx, registry, designs, capabilities, resolved.routePrefix, previewOrigin)
  ctx.logger.info(`GenUI artifacts: ${registry.root}`)

  return () => { capabilities.clear() }
}
