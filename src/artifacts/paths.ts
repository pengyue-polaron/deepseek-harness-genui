import { isAbsolute, normalize, posix, resolve, sep } from 'node:path'

const SOURCE_PREFIXES = ['src/', 'public/']
const ROOT_FILES = new Set(['artifact.manifest.json', 'DESIGN.md'])

export function assertArtifactId(value: string): string {
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(value)) {
    throw new Error('artifact id must be 3-64 lowercase letters, digits, or hyphens')
  }
  return value
}

export function normalizeSourcePath(value: string): string {
  if (value.length === 0 || value.includes('\\') || isAbsolute(value)) {
    throw new Error(`invalid source path: ${value}`)
  }
  const candidate = posix.normalize(value)
  if (candidate === '..' || candidate.startsWith('../') || candidate.includes('/../')) {
    throw new Error(`source path escapes artifact: ${value}`)
  }
  if (!ROOT_FILES.has(candidate) && !SOURCE_PREFIXES.some(prefix => candidate.startsWith(prefix))) {
    throw new Error(`source path must be under src/ or public/: ${value}`)
  }
  return candidate
}

export function safeJoin(root: string, ...segments: string[]): string {
  const resolvedRoot = resolve(root)
  const target = resolve(resolvedRoot, ...segments)
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error('resolved path escapes artifact root')
  }
  return normalize(target)
}
