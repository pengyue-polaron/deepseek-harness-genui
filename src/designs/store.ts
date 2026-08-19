import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { DESIGN_PRESETS } from './presets.ts'

const LEGACY_DESIGN_ALIASES: Record<string, string> = {
  'editorial-workbench': 'shadcn-ui',
  'field-atlas': 'material-3',
  'kinetic-signal': 'apple-human-interface',
  'ledger-grid': 'shadcn-ui',
  'notion': 'shadcn-ui',
}

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
  private selectedDefault: string | undefined

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
    try {
      const parsed: unknown = JSON.parse(await readFile(this.settingsPath(), 'utf8'))
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('design settings must be an object')
      const value = (parsed as Record<string, unknown>).defaultDesignId
      if (value !== null && typeof value !== 'string') throw new Error('defaultDesignId must be a design id or null')
      if (typeof value === 'string') {
        const migrated = LEGACY_DESIGN_ALIASES[value] ?? value
        await this.get(migrated)
        this.selectedDefault = migrated
        if (migrated !== value) await this.persistDefault(migrated)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  defaultId(): string | undefined {
    return this.selectedDefault
  }

  isBuiltin(id: string): boolean {
    return DESIGN_PRESETS.some(preset => preset.id === id)
  }

  async setDefault(id: string | undefined): Promise<void> {
    const safeId = id === undefined ? undefined : (await this.get(id)).id
    await this.persistDefault(safeId)
    this.selectedDefault = safeId
  }

  async list(): Promise<Array<Pick<StoredDesign, 'id' | 'title'>>> {
    const entries = await readdir(this.root, { withFileTypes: true })
    const designs = await Promise.all(entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.md')
        && LEGACY_DESIGN_ALIASES[basename(entry.name, '.md')] === undefined)
      .map(async entry => {
        const id = basename(entry.name, '.md')
        const content = await readFile(this.path(id), 'utf8')
        return { id, title: titleOf(content, id) }
      }))
    const builtinOrder = new Map(DESIGN_PRESETS.map((preset, index) => [preset.id, index]))
    return designs.sort((a, b) => {
      const aOrder = builtinOrder.get(a.id)
      const bOrder = builtinOrder.get(b.id)
      if (aOrder !== undefined || bOrder !== undefined) return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER)
      return a.id.localeCompare(b.id)
    })
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

  private settingsPath(): string {
    return resolve(this.root, 'settings.json')
  }

  private async persistDefault(id: string | undefined): Promise<void> {
    const path = this.settingsPath()
    const temporary = `${path}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify({ defaultDesignId: id ?? null }, null, 2)}\n`, {
      encoding: 'utf8', mode: 0o600,
    })
    await rename(temporary, path)
  }
}
