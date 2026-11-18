import type { Context } from '@deepseek-ai/cordis'
import { toolsUseBatchApi } from '../../src/runtime/tool-invocation.ts'

/**
 * Harness 0.2.2 delegates `tools.execute` to a separately mounted executor, so
 * a test composition that only mounts the tool registry settles every call
 * with `ToolExecutorUnavailableError`. Earlier hosts execute inline and need
 * nothing, which keeps one fixture working across both generations.
 *
 * The executor is imported by name at runtime: the package does not exist on
 * earlier hosts, so a static import would fail their type and install checks.
 */
export async function loadToolExecutor(ctx: Context): Promise<void> {
  if (!toolsUseBatchApi(ctx.tools)) return
  const moduleName = '@deepseek-ai/dsh-tool-executor-native'
  const executor = await import(moduleName) as Parameters<Context['plugin']>[0]
  await ctx.plugin(executor)
}
