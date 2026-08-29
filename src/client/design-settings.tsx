import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  importDesign, readDesignSettings, setDefaultDesign,
  type DesignSettings,
} from './api.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.plugin.item': { kind: 'list'; scope: 'root'; owner: { children?: never } }
  }
}

type DesignSettingsCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<'genui'>

function designDescription(id: string | null, t: TranslateNS<'genui'>): string {
  switch (id) {
    case null: return t('design.autoDescription')
    case 'material-3': return t('design.material3Description')
    case 'apple-human-interface': return t('design.appleDescription')
    case 'shadcn-ui': return t('design.shadcnDescription')
    default: return t('design.customDescription')
  }
}

export function designIdForImport(fileName: string, content: string, now = Date.now()): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ''
  const withoutExtension = fileName.replace(/\.md$/i, '')
  const source = withoutExtension.toLowerCase() === 'design' ? heading : withoutExtension
  const slug = source.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  if (slug.length >= 3 && /^[a-z]/.test(slug)) return slug
  if (slug.length > 0) return `design-${slug}`.slice(0, 64)
  return `design-${now.toString(36)}`
}

export function DesignSettingsCard({ t }: DesignSettingsCardProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<DesignSettings>()
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string>()
  const [failed, setFailed] = useState(false)

  const load = async () => {
    setLoading(true)
    setFailed(false)
    try {
      setSettings(await readDesignSettings())
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const selected = settings?.designs.find(design => design.id === settings.default_design_id)
  const selectedLabel = selected?.title ?? t('design.autoShort')

  const choose = async (designId: string) => {
    setPending(true)
    setFailed(false)
    setMessage(undefined)
    try {
      setSettings(await setDefaultDesign(designId || null))
      setMessage(t('design.saved'))
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined) return
    setPending(true)
    setFailed(false)
    setMessage(undefined)
    try {
      if (file.size > 128 * 1024) throw new Error('too large')
      const content = await file.text()
      setSettings(await importDesign(designIdForImport(file.name, content), content))
      setMessage(t('design.imported'))
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <li className="dsh-genui-design-card" data-open={open || undefined}>
      <style>{designSettingsCss}</style>
      <button
        type="button"
        className="dsh-genui-design-head"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <span className="dsh-genui-design-head-copy">
          <strong>{t('design.title')}</strong>
          <span>{t('design.description')}</span>
        </span>
        <span className="dsh-genui-design-current">{selectedLabel}</span>
        <span className="dsh-genui-design-chevron" aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="dsh-genui-design-body">
          <label htmlFor={`${inputId}-select`}>{t('design.defaultLabel')}</label>
          <select
            id={`${inputId}-select`}
            name="genui-default-design"
            autoComplete="off"
            translate="no"
            value={settings?.default_design_id ?? ''}
            disabled={settings === undefined || pending || loading}
            onChange={event => { void choose(event.target.value) }}
          >
            <option value="">{t('design.auto')}</option>
            {settings?.designs.map(design => <option key={design.id} value={design.id}>{design.title}</option>)}
          </select>
          <p className="dsh-genui-design-preview">
            <strong translate="no">{selectedLabel}</strong>
            <span>{designDescription(settings?.default_design_id ?? null, t)}</span>
          </p>
          <div className="dsh-genui-design-actions">
            <input ref={inputRef} id={inputId} name="genui-design-import" type="file" accept=".md,text/markdown,text/plain" aria-label={t('design.import')} hidden onChange={event => { void importFile(event) }} />
            {failed && settings === undefined
              ? <button type="button" disabled={loading} onClick={() => { void load() }}>{t('design.retry')}</button>
              : null}
            <button type="button" disabled={pending || loading} onClick={() => inputRef.current?.click()}>{t('design.import')}</button>
            {settings?.default_design_id == null
              ? <span className="dsh-genui-design-export-disabled" aria-disabled="true">{t('design.export')}</span>
              : <a href={`${settings.export_base}/${encodeURIComponent(settings.default_design_id)}?download=1`} download="DESIGN.md" onClick={() => setMessage(t('design.exported'))}>{t('design.export')}</a>}
            <span role="status" aria-live="polite">{loading ? t('design.loading') : pending ? t('design.saving') : failed ? t(settings === undefined ? 'design.loadFailed' : 'design.failed') : message}</span>
          </div>
        </div>
      ) : null}
    </li>
  )
}

const designSettingsCss = `
.dsh-genui-design-card { list-style:none; overflow:hidden; border:1px solid var(--dsw-alias-border-l2); border-radius:12px; background:var(--dsw-alias-bg-layer-3); color:var(--dsw-alias-label-primary); }
.dsh-genui-design-card[data-open='true'] { border-color:var(--dsw-alias-label-dimmed); background:var(--dsw-alias-bg-layer-2); }
.dsh-genui-design-head { display:flex; width:100%; align-items:center; gap:12px; border:0; border-radius:12px; padding:14px 16px; background:none; color:inherit; cursor:pointer; font:inherit; text-align:left; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
.dsh-genui-design-head:focus-visible, .dsh-genui-design-body select:focus-visible, .dsh-genui-design-actions button:focus-visible, .dsh-genui-design-actions a:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:-2px; }
.dsh-genui-design-head-copy { display:flex; min-width:0; flex:1; flex-direction:column; gap:4px; }
.dsh-genui-design-head-copy strong { font-size:15px; line-height:1.4; }
.dsh-genui-design-head-copy span { color:var(--dsw-alias-label-tertiary); font-size:13px; line-height:1.5; }
.dsh-genui-design-current { overflow:hidden; max-width:180px; border-radius:999px; padding:2px 9px; background:var(--dsw-alias-bg-module-platform); color:var(--dsw-alias-label-secondary); font-size:11px; line-height:18px; text-overflow:ellipsis; white-space:nowrap; }
.dsh-genui-design-chevron { color:var(--dsw-alias-label-tertiary); font-size:18px; transition:transform .16s; }
.dsh-genui-design-card[data-open='true'] .dsh-genui-design-chevron { transform:rotate(180deg); }
.dsh-genui-design-body { margin:0 16px; padding:14px 0 12px; border-top:1px solid var(--dsw-alias-border-l2); }
.dsh-genui-design-body label { display:block; margin-bottom:6px; font-size:13px; font-weight:600; }
.dsh-genui-design-body select { width:100%; height:36px; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:0 10px; background:var(--dsw-alias-bg-layer-3); color:var(--dsw-alias-label-primary); font-family:inherit; font-size:13px; line-height:1.4; }
.dsh-genui-design-preview { display:grid; gap:2px; margin:8px 0 14px; color:var(--dsw-alias-label-tertiary); font-size:12px; line-height:1.5; }
.dsh-genui-design-preview strong { color:var(--dsw-alias-label-secondary); font-size:12px; }
.dsh-genui-design-actions { display:flex; align-items:center; gap:8px; padding-top:12px; border-top:1px solid var(--dsw-alias-border-l2); }
.dsh-genui-design-actions button, .dsh-genui-design-actions a, .dsh-genui-design-export-disabled { box-sizing:border-box; display:inline-flex; min-height:32px; align-items:center; justify-content:center; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:0 12px; background:transparent; color:var(--dsw-alias-label-secondary); font-family:inherit; font-size:12px; font-weight:600; line-height:1; text-decoration:none; }
.dsh-genui-design-actions button, .dsh-genui-design-actions a { cursor:pointer; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
.dsh-genui-design-actions button:hover:not(:disabled), .dsh-genui-design-actions a:hover { border-color:var(--dsw-alias-label-dimmed); color:var(--dsw-alias-label-primary); }
.dsh-genui-design-actions button:disabled, .dsh-genui-design-export-disabled { cursor:default; opacity:.45; }
.dsh-genui-design-actions span { min-width:0; flex:1; color:var(--dsw-alias-label-tertiary); font-size:12px; text-align:right; }
@media (max-width:640px) { .dsh-genui-design-head { gap:6px; padding:12px 10px; } .dsh-genui-design-head-copy span, .dsh-genui-design-current { display:none; } .dsh-genui-design-head-copy strong { font-size:13px; } .dsh-genui-design-body { margin:0 10px; } .dsh-genui-design-actions { align-items:stretch; flex-direction:column; } .dsh-genui-design-actions button, .dsh-genui-design-actions a, .dsh-genui-design-export-disabled { min-height:40px; padding:0 8px; white-space:normal; } .dsh-genui-design-actions span { text-align:left; } }
@media (prefers-reduced-motion:reduce) { .dsh-genui-design-chevron { transition:none; } }
`
