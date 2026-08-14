import { describe, expect, it } from 'vitest'
import { normalizeSourcePath, safeJoin } from '../src/artifacts/paths.ts'

describe('artifact paths', () => {
  it('accepts source and public files', () => {
    expect(normalizeSourcePath('src/components/Card.tsx')).toBe('src/components/Card.tsx')
    expect(normalizeSourcePath('public/mark.svg')).toBe('public/mark.svg')
    expect(normalizeSourcePath('DESIGN.md')).toBe('DESIGN.md')
  })

  it.each(['../secret', 'src/../../secret', '/etc/passwd', 'src\\escape.ts', 'package.json'])(
    'rejects unsafe source path %s',
    (path) => { expect(() => normalizeSourcePath(path)).toThrow() },
  )

  it('prevents filesystem escape after resolution', () => {
    expect(() => safeJoin('/tmp/genui-root', '..', 'outside')).toThrow('escapes')
  })
})
