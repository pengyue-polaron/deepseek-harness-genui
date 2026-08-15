import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { grantPermission, listPermissions, previewUrlForLocale, revokePermission } from './api.ts'
import { canvasController, useCanvasArtifact, useCanvasSurface } from './canvas.ts'
import { DesignSettingsCard } from './design-settings.tsx'
import { ShellIcon } from './icons.tsx'
import { artifactCardLedger, usePrimaryArtifactCard } from './ledger.ts'
import { en, NS, zh } from './locales.ts'
import { enqueuePermission, settlePermission } from './permission-queue.ts'
import { isGenuiReadyMessage } from './readiness.ts'
import { cardCss } from './styles.ts'
import { readMeta } from './types.ts'
import type { GenuiMeta, PermissionRequest, PermissionStatus } from './types.ts'

interface GenuiToolViewProps extends ToolCallViewProps, PropsLocale<'genui'> {}

function IconAction({ label, className = '', children, ...props }: {
  label: string
  className?: string
  children: ReactNode
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'className'>) {
  return <button type="button" className={`dsh-genui-action ${className}`} aria-label={label} title={label} {...props}>{children}</button>
}

function Receipt({ meta, t, onOpen }: {
  meta: GenuiMeta
  t: TranslateNS<'genui'>
  onOpen(): void
}) {
  const failed = meta.previewUrl === undefined
  return (
    <div className="dsh-genui-receipt" data-failed={failed} role={failed ? 'status' : undefined}>
      <ShellIcon name={failed ? 'refresh' : 'check'} />
      <strong>{meta.title}</strong>
      <span>{failed ? t('receipt.failed') : t('receipt.updated')}</span>
      {failed ? null : <button type="button" className="dsh-genui-button" onClick={onOpen}>{t('receipt.openCurrent')}</button>}
    </div>
  )
}

export function GenuiToolView({ block, callId, sessionId, t }: GenuiToolViewProps) {
  const meta = readMeta(block)
  const [cardElement, setCardElement] = useState<HTMLElement | null>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const noticeTimerRef = useRef<number>()
  const permissionDialogRef = useRef<HTMLElement>(null)
  const permissionDenyRef = useRef<HTMLButtonElement>(null)
  const permissionPendingRef = useRef(false)
  const permissionQueueRef = useRef<PermissionRequest[]>([])
  const accessDialogRef = useRef<HTMLElement>(null)
  const accessCloseRef = useRef<HTMLButtonElement>(null)
  const bodyId = useId()
  const titleId = useId()
  const permissionTitleId = `${titleId}-permission`
  const permissionDescriptionId = `${titleId}-permission-description`
  const accessTitleId = `${titleId}-access`
  const accessDescriptionId = `${titleId}-access-description`
  const locale = t('locale.code') as 'en' | 'zh'
  const canvasSessionId = String(sessionId)
  const artifactKey = meta?.artifactId ?? `pending:${callId}`
  const displayTitle = meta?.title || t('app.untitled')
  const primary = usePrimaryArtifactCard(artifactKey, callId, cardElement, meta?.previewUrl !== undefined)
  const canvasOpen = useCanvasArtifact(canvasSessionId, artifactKey)
  const canvasSurface = useCanvasSurface(canvasOpen, cardElement)
  const previewUrl = meta?.previewUrl === undefined ? undefined : previewUrlForLocale(meta, locale)
  const [notice, setNotice] = useState<string>()
  const [fullscreen, setFullscreen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [frameState, setFrameState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [frameKey, setFrameKey] = useState(0)
  const [permissionQueue, setPermissionQueue] = useState<PermissionRequest[]>([])
  const [permissionPending, setPermissionPending] = useState(false)
  const [permissionError, setPermissionError] = useState<string>()
  const [permissions, setPermissions] = useState<PermissionStatus[]>()
  const [accessOpen, setAccessOpen] = useState(false)
  const [accessPending, setAccessPending] = useState<string>()
  const [accessError, setAccessError] = useState<string>()
  const permissionRequest = permissionQueue[0]

  const announce = (message: string) => {
    setNotice(message)
    if (noticeTimerRef.current !== undefined) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(undefined), 4000)
  }

  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === cardElement)
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [cardElement])

  useEffect(() => () => {
    if (noticeTimerRef.current !== undefined) window.clearTimeout(noticeTimerRef.current)
  }, [])

  useEffect(() => () => {
    if (canvasController.isOpen(canvasSessionId, artifactKey)) canvasController.close(canvasSessionId, artifactKey)
  }, [artifactKey, canvasSessionId])

  useEffect(() => {
    setFrameState('loading')
  }, [previewUrl, meta?.versionId])

  useEffect(() => {
    if (meta === undefined || previewUrl === undefined) {
      setPermissions(undefined)
      return
    }
    let active = true
    void listPermissions(meta, meta.versionId).then(result => {
      if (active) setPermissions(result.permissions)
    }, () => {
      if (active) setPermissions(undefined)
    })
    return () => { active = false }
  }, [meta?.artifactId, meta?.versionId, previewUrl])

  useEffect(() => {
    if (meta === undefined || previewUrl === undefined) return
    setFrameState('loading')
    const receive = (event: MessageEvent<unknown>) => {
      if (isGenuiReadyMessage(event, frameRef.current?.contentWindow ?? null, meta.artifactId, meta.versionId)) setFrameState('ready')
    }
    const timeout = window.setTimeout(() => setFrameState(state => state === 'loading' ? 'failed' : state), 12_000)
    window.addEventListener('message', receive)
    frameRef.current?.contentWindow?.postMessage({ source: 'dsh-genui', type: 'ready-request', artifactId: meta.artifactId, versionId: meta.versionId }, '*')
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('message', receive)
    }
  }, [frameKey, meta?.artifactId, meta?.versionId, previewUrl])

  useEffect(() => {
    if (meta === undefined) return
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== frameRef.current?.contentWindow || typeof event.data !== 'object' || event.data === null) return
      const value = event.data as Record<string, unknown>
      if (value.source !== 'dsh-genui' || value.type !== 'permission-request'
        || value.artifactId !== meta.artifactId || value.versionId !== meta.versionId || typeof value.requestId !== 'string'
        || typeof value.permission !== 'object' || value.permission === null) return
      const permission = value.permission as Record<string, unknown>
      if (typeof permission.id !== 'string' || typeof permission.label !== 'string' || typeof permission.reason !== 'string'
        || (permission.kind !== 'tool' && permission.kind !== 'external')
        || (permission.access !== 'read' && permission.access !== 'write')) return
      setPermissionError(undefined)
      const request: PermissionRequest = {
        requestId: value.requestId,
        permission: {
          id: permission.id,
          kind: permission.kind,
          label: permission.label,
          reason: permission.reason,
          access: permission.access,
          ...(typeof permission.destination === 'string' ? { destination: permission.destination } : {}),
          ...(Array.isArray(permission.methods) ? { methods: permission.methods.filter(item => typeof item === 'string') as string[] } : {}),
        },
      }
      setPermissionQueue(current => {
        const next = enqueuePermission(current, request)
        permissionQueueRef.current = next
        return next
      })
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [meta?.artifactId, meta?.versionId])

  useEffect(() => {
    permissionQueueRef.current = []
    setPermissionQueue([])
    setPermissionError(undefined)
  }, [meta?.versionId])

  useEffect(() => {
    permissionPendingRef.current = permissionPending
  }, [permissionPending])

  useEffect(() => {
    if (permissionRequest === undefined) return
    setAccessOpen(false)
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const focusFrame = window.requestAnimationFrame(() => permissionDenyRef.current?.focus())
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !permissionPendingRef.current) {
        event.preventDefault()
        const settled = settlePermission(permissionQueueRef.current, permissionRequest.permission.id)
        settled.answered.forEach(request => answerPermission(request.requestId, false))
        permissionQueueRef.current = settled.remaining
        setPermissionQueue(settled.remaining)
        setPermissionError(undefined)
        return
      }
      if (event.key !== 'Tab') return
      const buttons = [...(permissionDialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      if (buttons.length === 0) return
      const first = buttons[0]
      const last = buttons.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', keydown)
      previousFocus?.focus({ preventScroll: true })
    }
  }, [permissionRequest?.requestId])

  useEffect(() => {
    if (!accessOpen) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const focusFrame = window.requestAnimationFrame(() => accessCloseRef.current?.focus())
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && accessPending === undefined) {
        event.preventDefault()
        setAccessOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const buttons = [...(accessDialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      if (buttons.length === 0) return
      const first = buttons[0]
      const last = buttons.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', keydown)
      previousFocus?.focus({ preventScroll: true })
    }
  }, [accessOpen, accessPending])

  if (!('kind' in block)) return <div className="dsh-genui-pending">{t('app.building')}</div>
  if (meta === undefined) return <span hidden />

  if (!primary) {
    return (
      <div ref={setCardElement} className="dsh-genui-receipt-shell">
        <style>{cardCss}</style>
        <Receipt meta={meta} t={t} onOpen={() => artifactCardLedger.focusPrimary(meta.artifactId)} />
      </div>
    )
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === cardElement) await document.exitFullscreen()
      else {
        setCollapsed(false)
        await cardElement?.requestFullscreen()
      }
    } catch {
      announce(t('feedback.fullscreenFailed'))
    }
  }

  const toggleCanvas = async () => {
    if (canvasOpen) {
      if (document.fullscreenElement === cardElement) await document.exitFullscreen()
      canvasController.close(canvasSessionId, artifactKey)
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      window.setTimeout(() => cardElement?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' }), 0)
    } else {
      setCollapsed(false)
      canvasController.open(canvasSessionId, artifactKey)
    }
  }

  const answerPermission = (requestId: string, granted: boolean) => {
    frameRef.current?.contentWindow?.postMessage({ source: 'dsh-genui', type: 'permission-result', requestId, granted }, '*')
  }

  const denyPermission = () => {
    if (permissionRequest === undefined || permissionPending) return
    const settled = settlePermission(permissionQueueRef.current, permissionRequest.permission.id)
    settled.answered.forEach(request => answerPermission(request.requestId, false))
    permissionQueueRef.current = settled.remaining
    setPermissionQueue(settled.remaining)
    setPermissionError(undefined)
  }

  const allowPermission = async () => {
    if (permissionRequest === undefined || permissionPending) return
    setPermissionPending(true)
    setPermissionError(undefined)
    try {
      await grantPermission(meta, meta.versionId, permissionRequest.permission.id)
      setPermissions(current => current?.map(item => item.id === permissionRequest.permission.id ? { ...item, granted: true } : item))
      const settled = settlePermission(permissionQueueRef.current, permissionRequest.permission.id)
      settled.answered.forEach(request => answerPermission(request.requestId, true))
      permissionQueueRef.current = settled.remaining
      setPermissionQueue(settled.remaining)
    } catch {
      setPermissionError(t('permission.failed'))
    } finally {
      setPermissionPending(false)
    }
  }

  const openAccess = async () => {
    setAccessOpen(true)
    setAccessError(undefined)
    try {
      const result = await listPermissions(meta, meta.versionId)
      setPermissions(result.permissions)
    } catch {
      setAccessError(t('access.failed'))
    }
  }

  const removeAccess = async (capabilityId: string) => {
    if (accessPending !== undefined) return
    setAccessPending(capabilityId)
    setAccessError(undefined)
    try {
      await revokePermission(meta, capabilityId)
      setPermissions(current => current?.map(item => item.id === capabilityId ? { ...item, granted: false } : item))
      announce(t('access.revoked'))
    } catch {
      setAccessError(t('access.failed'))
    } finally {
      setAccessPending(undefined)
    }
  }

  return (
    <div className="dsh-genui-anchor" data-canvas-open={canvasOpen || undefined}>
      {canvasOpen ? (
        <button type="button" className="dsh-genui-canvas-placeholder" onClick={() => { void toggleCanvas() }}>
          <ShellIcon name="panel-right" />
          <strong>{displayTitle}</strong>
          <span>{t('app.canvasReturn')}</span>
        </button>
      ) : null}
      <section ref={setCardElement} tabIndex={-1} className="dsh-genui-card" data-collapsed={collapsed} data-surface={canvasOpen ? 'canvas' : 'inline'} data-canvas-layout={canvasOpen ? canvasSurface.mode : undefined} aria-labelledby={titleId}>
        <style>{cardCss}</style>
        <header className="dsh-genui-head">
          {previewUrl === undefined ? null : (
            <IconAction className="dsh-genui-collapse" label={collapsed ? t('app.show') : t('app.hide')} aria-expanded={!collapsed} aria-controls={bodyId} onClick={() => setCollapsed(value => !value)}>
              <ShellIcon name={collapsed ? 'chevron-down' : 'chevron-up'} />
            </IconAction>
          )}
          <div className="dsh-genui-name">
            <h3 id={titleId} className="dsh-genui-title">{displayTitle}</h3>
          </div>
          {previewUrl === undefined ? null : (
            <div className="dsh-genui-actions">
              {permissions?.length ? (
                <IconAction label={t('access.open')} onClick={() => { void openAccess() }}>
                  <ShellIcon name="shield" />
                </IconAction>
              ) : null}
              <IconAction className="dsh-genui-canvas-action" label={canvasOpen ? t('action.closeCanvas') : t('action.openCanvas')} onClick={() => { void toggleCanvas() }}>
                <ShellIcon name={canvasOpen ? 'panel-right-close' : 'panel-right'} />
                <span className="dsh-genui-open-label">{canvasOpen ? t('action.closeCanvas') : t('app.open')}</span>
              </IconAction>
              <IconAction className="dsh-genui-fullscreen" label={fullscreen ? t('action.exitFullscreen') : t('action.fullscreen')} onClick={toggleFullscreen}>
                <ShellIcon name={fullscreen ? 'minimize' : 'maximize'} />
              </IconAction>
            </div>
          )}
        </header>

        {notice === undefined ? null : <div className="dsh-genui-toast" role="status" aria-live="polite">{notice}</div>}

        {permissionRequest === undefined ? null : (
          <div className="dsh-genui-permission-backdrop">
            <section ref={permissionDialogRef} className="dsh-genui-permission" role="dialog" aria-modal="true" aria-labelledby={permissionTitleId} aria-describedby={permissionDescriptionId}>
              <div className="dsh-genui-permission-mark"><ShellIcon name="check" /></div>
              <div className="dsh-genui-permission-copy">
                <p className="dsh-genui-permission-kicker">{t('permission.title')}</p>
                <h4 id={permissionTitleId}>{permissionRequest.permission.label}</h4>
                <p id={permissionDescriptionId}>{permissionRequest.permission.reason}</p>
                <div className="dsh-genui-permission-facts">
                  <span>{permissionRequest.permission.access === 'write' ? t('permission.write') : t('permission.read')}</span>
                  {permissionRequest.permission.destination === undefined ? null : <span>{t('permission.connect')} {permissionRequest.permission.destination}</span>}
                  {permissionRequest.permission.methods?.length ? <span>{t('permission.methods')} {permissionRequest.permission.methods.join(' / ')}</span> : null}
                </div>
                <p className="dsh-genui-permission-scope">{t('permission.scope')}</p>
                {permissionQueue.length > 1 ? <p className="dsh-genui-permission-queue">{t('permission.queued', { count: permissionQueue.length - 1 })}</p> : null}
                {permissionError === undefined ? null : <p className="dsh-genui-permission-error" role="alert">{permissionError}</p>}
              </div>
              <div className="dsh-genui-permission-actions">
                <button ref={permissionDenyRef} type="button" className="dsh-genui-button" disabled={permissionPending} onClick={denyPermission}>{t('permission.deny')}</button>
                <button type="button" className="dsh-genui-button dsh-genui-button--strong" disabled={permissionPending} onClick={() => { void allowPermission() }}>{permissionPending ? t('permission.allowing') : t('permission.allow')}</button>
              </div>
            </section>
          </div>
        )}

        {!accessOpen || permissionRequest !== undefined ? null : (
          <div className="dsh-genui-permission-backdrop">
            <section ref={accessDialogRef} className="dsh-genui-access" role="dialog" aria-modal="true" aria-labelledby={accessTitleId} aria-describedby={accessDescriptionId}>
              <div className="dsh-genui-access-head">
                <div className="dsh-genui-permission-mark"><ShellIcon name="shield" /></div>
                <div>
                  <h4 id={accessTitleId}>{t('access.title')}</h4>
                  <p id={accessDescriptionId}>{t('access.description')}</p>
                </div>
              </div>
              <div className="dsh-genui-access-list">
                {permissions?.map(item => (
                  <div className="dsh-genui-access-row" key={item.id}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.reason}</span>
                    </div>
                    {item.granted ? (
                      <button type="button" className="dsh-genui-button" disabled={accessPending !== undefined} onClick={() => { void removeAccess(item.id) }}>
                        {accessPending === item.id ? t('access.revoking') : t('access.revoke')}
                      </button>
                    ) : <span className="dsh-genui-access-state">{t('access.notAllowed')}</span>}
                  </div>
                ))}
              </div>
              {accessError === undefined ? null : <p className="dsh-genui-permission-error" role="alert">{accessError}</p>}
              <div className="dsh-genui-permission-actions">
                <button ref={accessCloseRef} type="button" className="dsh-genui-button dsh-genui-button--strong" disabled={accessPending !== undefined} onClick={() => setAccessOpen(false)}>{t('access.close')}</button>
              </div>
            </section>
          </div>
        )}

        {previewUrl === undefined ? (
          <div className="dsh-genui-error" role="status">{t('receipt.unavailable')}</div>
        ) : (
          <div id={bodyId} className="dsh-genui-body" hidden={collapsed}>
            <div className="dsh-genui-frame-shell">
              <iframe ref={frameRef} key={frameKey} className="dsh-genui-frame" title={displayTitle} src={previewUrl} sandbox="allow-scripts allow-forms allow-modals allow-downloads" referrerPolicy="no-referrer" onLoad={() => frameRef.current?.contentWindow?.postMessage({ source: 'dsh-genui', type: 'ready-request', artifactId: meta.artifactId, versionId: meta.versionId }, '*')} onError={() => setFrameState('failed')} />
              <div className="dsh-genui-loading" hidden={frameState !== 'loading'} role="status" aria-live="polite">{t('app.loading')}</div>
              <div className="dsh-genui-frame-error" hidden={frameState !== 'failed'} role="alert">
                <div><span>{t('app.loadFailed')}</span><button type="button" className="dsh-genui-button" onClick={() => { setFrameState('loading'); setFrameKey(value => value + 1) }}><ShellIcon name="refresh" />{t('app.reload')}</button></div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'genui: dictionaries')
  const BoundGenuiToolView = (props: ToolCallViewProps & PropsLocale<'genui'>) => <GenuiToolView {...props} />
  const HiddenGenuiToolView = () => <span hidden />
  ctx.slots.inject('tool.call.toolview', function* () {
    for (const key of ['genui_create', 'genui_update', 'genui_rollback']) {
      yield ctx.slots.register({ name: 'tool.call.toolview', key, locale: NS }, BoundGenuiToolView)
    }
    for (const key of ['genui_design_list', 'genui_design_import', 'genui_design_export', 'genui_inspect', 'genui_state_read']) {
      yield ctx.slots.register({ name: 'tool.call.toolview', key }, HiddenGenuiToolView)
    }
  })
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'genui-design',
    order: 30,
    locale: NS,
  }, DesignSettingsCard))
}
