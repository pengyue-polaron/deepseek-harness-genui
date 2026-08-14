import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { DESIGN_PRESETS } from './presets.ts'

export interface StoredDesign {
  id: string
  title: string
  content: string
}

function designId(value: string): string {
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(value)) {
    throw new Error('design id must be 3-64 lowercase letters, digits, or hyphens and start with a letter')
  }
  return value
}

function titleOf(content: string, id: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return heading && heading.length <= 120 ? heading : id
}

export class DesignStore {
  readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    await Promise.all(DESIGN_PRESETS.map(async preset => {
      try {
        await writeFile(this.path(preset.id), preset.content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    }))
  }

  async list(): Promise<Array<Pick<StoredDesign, 'id' | 'title'>>> {
    const entries = await readdir(this.root, { withFileTypes: true })
    const designs = await Promise.all(entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(async entry => {
        const id = basename(entry.name, '.md')
        const content = await readFile(this.path(id), 'utf8')
        return { id, title: titleOf(content, id) }
      }))
    return designs.sort((a, b) => a.id.localeCompare(b.id))
  }

  async get(id: string): Promise<StoredDesign> {
    const safeId = designId(id)
    const content = await readFile(this.path(safeId), 'utf8')
    return { id: safeId, title: titleOf(content, safeId), content }
  }

  async put(id: string, content: string): Promise<StoredDesign> {
    const safeId = designId(id)
    if (!content.trim().startsWith('# ')) throw new Error('DESIGN.md must start with a level-one heading')
    if (Buffer.byteLength(content) > 128 * 1024) throw new Error('DESIGN.md exceeds 128 KiB')
    const path = this.path(safeId)
    const temporary = `${path}.${randomUUID()}.tmp`
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, path)
    return { id: safeId, title: titleOf(content, safeId), content }
  }

  private path(id: string): string {
    return resolve(this.root, `${designId(id)}.md`)
  }
}
