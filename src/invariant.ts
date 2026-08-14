import type { Context } from '@deepseek-ai/cordis'

const PACKAGE_NAME = 'dsh-plugin-genui'
type InvariantFailure = (message: string) => never
type InvariantInstaller = (ctx: Context, fail: InvariantFailure) => void | Promise<void>
interface InvariantRegistry {
  register(packageName: string, installer: InvariantInstaller): () => void
}

export const name = 'genui-invariant'
export const inject = ['invariants']

const install: InvariantInstaller = () => {}

export function apply(ctx: Context): Promise<() => void> {
  const registry = ctx.get('invariants') as InvariantRegistry | undefined
  if (registry === undefined) throw new Error(`invariant companion requires the invariants service for ${PACKAGE_NAME}`)
  return Promise.resolve(registry.register(PACKAGE_NAME, install))
}
