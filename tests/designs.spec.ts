import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
      { id: 'material-3', title: 'Material 3' },
      { id: 'apple-human-interface', title: 'Apple Human Interface' },
      { id: 'shadcn-ui', title: 'shadcn/ui' },
    ])
  })

  it('migrates retired task-oriented presets to recognizable visual languages', async () => {
    const designs = await store()
    await writeFile(join(designs.root, 'field-atlas.md'), '# Field Atlas\n\nLegacy built-in.\n')
    await writeFile(join(designs.root, 'settings.json'), '{"defaultDesignId":"field-atlas"}\n')

    const reloaded = new DesignStore(designs.root)
    await reloaded.init()
    expect(reloaded.defaultId()).toBe('material-3')
    expect((await reloaded.list()).map(design => design.id)).not.toContain('field-atlas')
    expect(await readFile(join(designs.root, 'settings.json'), 'utf8')).toContain('material-3')
  })

  it('retires Notion and migrates document-oriented defaults to shadcn/ui', async () => {
    const designs = await store()
    await writeFile(join(designs.root, 'notion.md'), '# Notion\n\nRetired built-in.\n')
    await writeFile(join(designs.root, 'settings.json'), '{"defaultDesignId":"notion"}\n')

    const reloaded = new DesignStore(designs.root)
    await reloaded.init()
    expect(reloaded.defaultId()).toBe('shadcn-ui')
    expect((await reloaded.list()).map(design => design.id)).not.toContain('notion')
    expect(await readFile(join(designs.root, 'settings.json'), 'utf8')).toContain('shadcn-ui')
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
