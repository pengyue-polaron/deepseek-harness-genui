import z from '@deepseek-ai/schemastery'

export interface Config {
  artifactRoot?: string
  routePrefix?: string
  maxSourceBytes?: number
}

export interface ResolvedConfig {
  artifactRoot: string
  routePrefix: string
  maxSourceBytes: number
}

export const Config: z<Config> = z.object({
  artifactRoot: z.string().default('.dsh/genui'),
  routePrefix: z.string().default('/genui'),
  maxSourceBytes: z.natural().min(16384).max(16 * 1024 * 1024).default(1024 * 1024),
})

export function resolveConfig(config: Config = {}): ResolvedConfig {
  const routePrefix = config.routePrefix ?? '/genui'
  if (!/^\/[a-z0-9/_-]*[a-z0-9_-]$/i.test(routePrefix) || routePrefix.includes('//')) {
    throw new Error('routePrefix must be an absolute path without a trailing slash')
  }
  return {
    artifactRoot: config.artifactRoot ?? '.dsh/genui',
    routePrefix,
    maxSourceBytes: config.maxSourceBytes ?? 1024 * 1024,
  }
}
