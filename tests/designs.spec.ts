import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DesignStore } from '../src/designs/store.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function store(): Promise<DesignStore> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-genui-designs-'))
  roots.push(root)
  const designs = new DesignStore(root)
  await designs.init()
  return designs
}

describe('DesignStore', () => {
  it('installs the maintained presets', async () => {
    const designs = await store()
    expect(await designs.list()).toEqual([
      { id: 'editorial-workbench', title: 'Editorial Workbench' },
      { id: 'field-atlas', title: 'Field Atlas' },
      { id: 'kinetic-signal', title: 'Kinetic Signal' },
      { id: 'ledger-grid', title: 'Ledger Grid' },
    ])
  })

  it('round-trips an imported DESIGN.md', async () => {
    const designs = await store()
    await designs.put('family-weekend', '# Family Weekend\n\nUse warm white and tomato red.\n')
    await expect(designs.get('family-weekend')).resolves.toMatchObject({
      id: 'family-weekend', title: 'Family Weekend', content: expect.stringContaining('tomato red'),
    })
  })

  it('persists one optional default design', async () => {
    const designs = await store()
    await designs.put('home-journal', '# Home Journal\n\nUse warm paper surfaces.\n')
    await designs.setDefault('home-journal')
    expect(designs.defaultId()).toBe('home-journal')

    const reloaded = new DesignStore(designs.root)
    await reloaded.init()
    expect(reloaded.defaultId()).toBe('home-journal')
    await reloaded.setDefault(undefined)
    expect(reloaded.defaultId()).toBeUndefined()
    await expect(reloaded.setDefault('missing-design')).rejects.toThrow()
  })

  it('rejects malformed and oversized profiles', async () => {
    const designs = await store()
    await expect(designs.put('../escape', '# Escape')).rejects.toThrow('design id')
    await expect(designs.put('missing-heading', 'No heading')).rejects.toThrow('level-one heading')
    await expect(designs.put('too-large', `# Large\n${'x'.repeat(128 * 1024)}`)).rejects.toThrow('128 KiB')
  })
})
