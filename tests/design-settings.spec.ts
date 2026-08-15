import { describe, expect, it } from 'vitest'
import { designIdForImport } from '../src/client/design-settings.tsx'

describe('DESIGN.md settings', () => {
  it('derives stable safe ids from filenames and generic DESIGN.md headings', () => {
    expect(designIdForImport('Home Journal.md', '# Ignored heading')).toBe('home-journal')
    expect(designIdForImport('DESIGN.md', '# Editorial Warmth')).toBe('editorial-warmth')
    expect(designIdForImport('42.md', '# Numeric', 123)).toBe('design-42')
    expect(designIdForImport('DESIGN.md', '# 生活', 123)).toBe('design-3f')
  })
})
