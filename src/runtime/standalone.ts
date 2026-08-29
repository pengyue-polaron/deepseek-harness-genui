export const ARTIFACT_RUNTIME_VERSION = '0.14.0'

export const STANDALONE_RUNTIME = String.raw`
const root = document.body
const frame = document.getElementById('app')
const dialog = document.getElementById('permission')
const permissionTitle = document.getElementById('permission-title')
const permissionReason = document.getElementById('permission-reason')
const permissionAccess = document.getElementById('permission-access')
const permissionDestination = document.getElementById('permission-destination')
const permissionMethods = document.getElementById('permission-methods')
const permissionQueue = document.getElementById('permission-queue')
const permissionList = document.getElementById('permission-list')
const permissionScope = document.getElementById('permission-scope')
const permissionError = document.getElementById('permission-error')
const notice = document.getElementById('notice')
const errorView = document.getElementById('error')
const deny = document.getElementById('deny')
const allow = document.getElementById('allow')
const token = new URLSearchParams(location.hash.slice(1)).get('token')
const requestTimeoutMs = 8000

if (!token) {
  frame.hidden = true
  errorView.setAttribute('role', 'alert')
  errorView.hidden = false
} else {
  const prefix = root.dataset.routePrefix
  const artifactId = root.dataset.artifactId
  const language = root.dataset.language
  const copy = language === 'zh'
    ? { read: '读取信息', write: '执行更改', connect: '连接到', methods: '允许请求', queued: '确认后还有 {count} 项访问请求。', failed: '暂时无法完成授权，请重试。', runtimeFailed: '这个应用没有正常打开。请回到任务中让我修复。', interactiveFailed: '这个应用刚才遇到问题。你可以重新打开，不会影响其他用户。', reload: '重新打开', checkingAccess: '正在检查应用权限…', accessUnavailable: '暂时无法检查权限', accessUnavailableReason: '你可以重试，或先打开不需要连接能力的部分；在权限检查恢复前，连接能力会保持关闭。', retry: '重试', openAnyway: '先打开应用', restoring: '正在恢复上一个可用版本…', restored: '已恢复上一个可用版本', deny: '暂不允许', allow: '允许当前任务使用', initialTitle: '这个应用需要以下权限', initialReason: '在打开前一次确认。允许后，这个版本在当前任务中使用这些能力时不会逐项打断你。', initialAllow: '全部允许并打开' }
    : { read: 'Read information', write: 'Make changes', connect: 'Connect to', methods: 'Allowed requests', queued: 'More access requests are waiting: {count}.', failed: 'Permission could not be saved. Try again.', runtimeFailed: 'This app did not open correctly. Return to the task and ask me to repair it.', interactiveFailed: 'This app just hit a problem. You can reopen it without affecting other users.', reload: 'Reopen app', checkingAccess: 'Checking app access…', accessUnavailable: 'Access could not be checked', accessUnavailableReason: 'Try again, or open the parts that do not need connected access. Connected capabilities stay unavailable until the access check recovers.', retry: 'Try again', openAnyway: 'Open app', restoring: 'Restoring the last working version…', restored: 'Restored the last working version', deny: 'Not now', allow: 'Allow for this task', initialTitle: 'This app needs the following access', initialReason: 'Review it once before opening. If allowed, this version can use these capabilities during the current task without interrupting you one by one.', initialAllow: 'Allow all and open' }

  let pending = []
  let initialPermissions = []
  let knownPermissions = []
  let activeVersionId = root.dataset.versionId
  let loadedVersionId
  let bootstrapFailedFor
  let recoveryVersionId
  let frameReady = false
  let noticeTimer
  let bridge
  let bridgeNonce
  let bridgeAcceptedNonce
  let bridgeStarted = false
  const bridgeLiveness = new Map()
  const BRIDGE_VERSION = 1
  const BRIDGE_ACTIONS = new Set(['state/read', 'state/write', 'tool', 'external'])
  const reportedRuntimeFailures = new Set()
  const apiUrl = (action) => prefix + '/api/' + encodeURIComponent(artifactId) + '/' + action
  const requestJson = async (action, body) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      const response = await fetch(apiUrl(action), {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const value = await response.json()
      if (!response.ok) throw new Error('request failed')
      return value
    } finally {
      clearTimeout(timeout)
    }
  }
  const bridgeTimeout = (action) => action === 'tool' ? 65000 : action === 'external' ? 35000 : 10000
  const requestArtifact = async (action, body) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), bridgeTimeout(action))
    try {
      const response = await fetch(apiUrl(action), {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, version_id: activeVersionId }),
        signal: controller.signal,
      })
      return { ok: response.ok, status: response.status, value: await response.json() }
    } finally {
      clearTimeout(timeout)
    }
  }
  const sendBridge = (message) => {
    if (bridge) bridge.port.postMessage({
      source: 'dsh-genui', bridgeVersion: BRIDGE_VERSION, nonce: bridge.nonce, ...message,
    })
  }
  const closeBridge = () => {
    if (!bridge) return
    sendBridge({ type: 'bridge-closed' })
    bridge.port.close()
    bridge = undefined
    bridgeStarted = false
    for (const settle of bridgeLiveness.values()) settle(false)
    bridgeLiveness.clear()
  }
  const verifyBridgeAlive = () => {
    if (!bridge || !bridgeStarted) return Promise.resolve(false)
    const session = bridge
    const requestId = crypto.randomUUID()
    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        if (!bridgeLiveness.delete(requestId)) return
        resolve(false)
      }, 250)
      bridgeLiveness.set(requestId, alive => {
        clearTimeout(timeout)
        resolve(alive && bridge === session)
      })
      sendBridge({ type: 'liveness-challenge', requestId })
    })
  }
  const showStatus = (message, alert = false) => {
    frame.hidden = true
    errorView.setAttribute('role', alert ? 'alert' : 'status')
    errorView.textContent = message
    errorView.hidden = false
  }
  const startFrame = (targetVersionId = activeVersionId) => {
    if (!targetVersionId || loadedVersionId === targetVersionId) return
    closeBridge()
    activeVersionId = targetVersionId
    root.dataset.versionId = targetVersionId
    loadedVersionId = targetVersionId
    frameReady = false
    bootstrapFailedFor = undefined
    bridgeNonce = crypto.randomUUID()
    bridgeAcceptedNonce = undefined
    if (dialog.open) dialog.close()
    errorView.hidden = true
    frame.hidden = false
    frame.src = prefix + '/preview/' + encodeURIComponent(artifactId) + '/' + encodeURIComponent(targetVersionId)
      + '?lang=' + encodeURIComponent(language)
      + '&theme=' + (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      + '#token=bridge-v1&bridge_nonce=' + encodeURIComponent(bridgeNonce)
  }
  const showFact = (element, value) => {
    element.hidden = !value
    element.textContent = value || ''
  }
  const showPending = () => {
    const current = pending[0]
    if (!current) {
      if (dialog.open) dialog.close()
      return
    }
    bootstrapFailedFor = undefined
    initialPermissions = []
    deny.textContent = copy.deny
    allow.textContent = copy.allow
    permissionList.hidden = true
    permissionList.replaceChildren()
    permissionScope.hidden = false
    permissionTitle.textContent = current.permission.label
    permissionReason.textContent = current.permission.reason
    permissionError.hidden = true
    showFact(permissionAccess, current.permission.access === 'write' ? copy.write : copy.read)
    showFact(permissionDestination, typeof current.permission.destination === 'string'
      ? copy.connect + ' ' + current.permission.destination : '')
    showFact(permissionMethods, Array.isArray(current.permission.methods) && current.permission.methods.length
      ? copy.methods + ' ' + current.permission.methods.filter(method => typeof method === 'string').join(' / ') : '')
    showFact(permissionQueue, pending.length > 1 ? copy.queued.replace('{count}', String(pending.length - 1)) : '')
    if (!dialog.open) dialog.showModal()
  }
  const showInitial = (permissions) => {
    bootstrapFailedFor = undefined
    initialPermissions = permissions
    deny.textContent = copy.deny
    allow.textContent = copy.initialAllow
    permissionTitle.textContent = copy.initialTitle
    permissionReason.textContent = copy.initialReason
    permissionError.hidden = true
    showFact(permissionAccess, '')
    showFact(permissionDestination, '')
    showFact(permissionMethods, '')
    showFact(permissionQueue, '')
    permissionScope.hidden = true
    permissionList.replaceChildren(...permissions.map(permission => {
      const item = document.createElement('div')
      const title = document.createElement('strong')
      const reason = document.createElement('span')
      const facts = document.createElement('div')
      title.textContent = permission.label
      reason.textContent = permission.reason
      facts.className = 'permission-list-facts'
      const values = [
        permission.access === 'write' ? copy.write : copy.read,
        typeof permission.destination === 'string' ? copy.connect + ' ' + permission.destination : '',
        Array.isArray(permission.methods) && permission.methods.length
          ? copy.methods + ' ' + permission.methods.filter(method => typeof method === 'string').join(' / ')
          : '',
      ]
      facts.replaceChildren(...values.filter(Boolean).map(value => {
        const fact = document.createElement('span')
        fact.textContent = value
        return fact
      }))
      item.append(title, reason, facts)
      return item
    }))
    permissionList.hidden = false
    if (!dialog.open) dialog.showModal()
  }
  const dismissInitial = () => {
    initialPermissions = []
    if (dialog.open) dialog.close()
    startFrame(activeVersionId)
  }
  const answer = (granted, capabilityId = pending[0]?.permission.id) => {
    if (!capabilityId) return
    const answered = pending.filter(request => request.permission.id === capabilityId)
    pending = pending.filter(request => request.permission.id !== capabilityId)
    answered.forEach(request => frame.contentWindow?.postMessage({
      source: 'dsh-genui', type: 'permission-result', requestId: request.requestId, granted,
    }, '*'))
    showPending()
  }
  const savedNotice = notice.textContent
  const announce = (message) => {
    notice.textContent = message
    notice.hidden = false
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => { notice.hidden = true }, 2000)
  }
  const announceSaved = () => announce(savedNotice)
  const showBootstrapFailure = (targetVersionId) => {
    if (activeVersionId !== targetVersionId) return
    bootstrapFailedFor = targetVersionId
    initialPermissions = []
    pending = []
    deny.textContent = copy.openAnyway
    allow.textContent = copy.retry
    permissionTitle.textContent = copy.accessUnavailable
    permissionReason.textContent = copy.accessUnavailableReason
    permissionError.hidden = true
    permissionList.hidden = true
    permissionList.replaceChildren()
    permissionScope.hidden = true
    showFact(permissionAccess, '')
    showFact(permissionDestination, '')
    showFact(permissionMethods, '')
    showFact(permissionQueue, '')
    showStatus(copy.accessUnavailable)
    if (!dialog.open) dialog.showModal()
  }
  const validPermission = (permission) => permission && typeof permission === 'object'
    && typeof permission.id === 'string' && typeof permission.label === 'string'
    && typeof permission.reason === 'string' && (permission.kind === 'tool' || permission.kind === 'external')
    && (permission.access === 'read' || permission.access === 'write')
  const bootstrapPermissions = async (targetVersionId) => {
    if (!targetVersionId) return
    activeVersionId = targetVersionId
    root.dataset.versionId = targetVersionId
    bootstrapFailedFor = undefined
    knownPermissions = []
    if (dialog.open) dialog.close()
    showStatus(copy.checkingAccess)
    try {
      const value = await requestJson('permission/list', { version_id: targetVersionId })
      if (activeVersionId !== targetVersionId) return
      if (!Array.isArray(value.permissions) || !value.permissions.every(validPermission)) throw new Error('invalid permission list')
      const resolvedVersionId = typeof value.version_id === 'string' && value.version_id.length
        ? value.version_id
        : targetVersionId
      if (resolvedVersionId !== targetVersionId) {
        recoveryVersionId = resolvedVersionId
        await bootstrapPermissions(resolvedVersionId)
        return
      }
      knownPermissions = value.permissions
      const permissions = value.permissions.filter(permission => !permission.granted)
      errorView.hidden = true
      if (permissions.length) showInitial(permissions)
      else startFrame(targetVersionId)
    } catch {
      showBootstrapFailure(targetVersionId)
    }
  }
  const openAfterBootstrapFailure = () => {
    const targetVersionId = bootstrapFailedFor
    if (!targetVersionId) return
    bootstrapFailedFor = undefined
    if (dialog.open) dialog.close()
    startFrame(targetVersionId)
  }
  const retryBootstrap = () => {
    const targetVersionId = bootstrapFailedFor
    if (!targetVersionId) return
    bootstrapFailedFor = undefined
    void bootstrapPermissions(targetVersionId)
  }
  const showRuntimeFailure = () => {
    recoveryVersionId = undefined
    showStatus(copy.runtimeFailed, true)
  }
  const showInteractiveFailure = () => {
    recoveryVersionId = undefined
    showStatus(copy.interactiveFailed, true)
    const reopen = document.createElement('button')
    reopen.type = 'button'
    reopen.textContent = copy.reload
    reopen.addEventListener('click', () => {
      loadedVersionId = undefined
      void bootstrapPermissions(activeVersionId)
    }, { once: true })
    errorView.append(reopen)
  }
  const recoverRuntimeFailure = async (failedVersionId) => {
    if (reportedRuntimeFailures.has(failedVersionId)) return
    reportedRuntimeFailures.add(failedVersionId)
    pending = []
    initialPermissions = []
    bootstrapFailedFor = undefined
    if (dialog.open) dialog.close()
    showStatus(copy.restoring)
    try {
      const value = await requestJson('version/report-runtime-failure', { version_id: failedVersionId })
      if (activeVersionId !== failedVersionId) return
      const fallbackVersionId = value?.fallback_version_id
      if (typeof fallbackVersionId !== 'string' || fallbackVersionId.length === 0
        || fallbackVersionId === failedVersionId || reportedRuntimeFailures.has(fallbackVersionId)) {
        showRuntimeFailure()
        return
      }
      recoveryVersionId = fallbackVersionId
      await bootstrapPermissions(fallbackVersionId)
    } catch {
      if (activeVersionId === failedVersionId) showRuntimeFailure()
    }
  }

  deny.addEventListener('click', () => bootstrapFailedFor ? openAfterBootstrapFailure() : initialPermissions.length ? dismissInitial() : answer(false))
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    if (!allow.disabled) {
      if (bootstrapFailedFor) openAfterBootstrapFailure()
      else if (initialPermissions.length) dismissInitial()
      else answer(false)
    }
  })
  allow.addEventListener('click', async () => {
    if (bootstrapFailedFor) {
      retryBootstrap()
      return
    }
    if (initialPermissions.length) {
      allow.disabled = true
      deny.disabled = true
      permissionError.hidden = true
      try {
        await requestJson('permission/grant-all', { version_id: activeVersionId })
        knownPermissions = knownPermissions.map(permission => ({ ...permission, granted: true }))
        dismissInitial()
      } catch {
        permissionError.textContent = copy.failed
        permissionError.hidden = false
      } finally {
        allow.disabled = false
        deny.disabled = false
      }
      return
    }
    const current = pending[0]
    if (!current) return
    allow.disabled = true
    deny.disabled = true
    permissionError.hidden = true
    try {
      await requestJson('permission/grant', { version_id: activeVersionId, capability_id: current.permission.id })
      knownPermissions = knownPermissions.map(permission => permission.id === current.permission.id
        ? { ...permission, granted: true }
        : permission)
      answer(true, current.permission.id)
    } catch {
      permissionError.textContent = copy.failed
      permissionError.hidden = false
    } finally {
      allow.disabled = false
      deny.disabled = false
    }
  })

  const acceptBridge = (event, value) => {
    if (bridge || bridgeAcceptedNonce === bridgeNonce || event.source !== frame.contentWindow || event.origin !== 'null' || event.ports.length !== 1
      || value?.source !== 'dsh-genui' || value.type !== 'bridge-connect'
      || value.bridgeVersion !== BRIDGE_VERSION || value.nonce !== bridgeNonce
      || value.artifactId !== artifactId || value.versionId !== activeVersionId) return false
    const port = event.ports[0]
    const session = { port, nonce: bridgeNonce, inFlight: new Set() }
    bridge = session
    bridgeAcceptedNonce = bridgeNonce
    port.onmessage = message => {
      if (bridge !== session || !message.data || typeof message.data !== 'object') return
      const request = message.data
      if (request.source !== 'dsh-genui' || request.bridgeVersion !== BRIDGE_VERSION
        || request.nonce !== session.nonce || request.artifactId !== artifactId
        || request.versionId !== activeVersionId) return
      if (request.type === 'preview-loaded') {
        if (bridgeStarted) return
        bridgeStarted = true
        sendBridge({ type: 'start-app' })
        sendTheme()
        return
      }
      if (request.type === 'preview-leaving') {
        closeBridge()
        showInteractiveFailure()
        return
      }
      if (request.type === 'liveness-response' && typeof request.requestId === 'string') {
        const settle = bridgeLiveness.get(request.requestId)
        if (settle) {
          bridgeLiveness.delete(request.requestId)
          settle(true)
        }
        return
      }
      if (request.type !== 'api-request' || !bridgeStarted || typeof request.requestId !== 'string'
        || request.requestId.length === 0 || request.requestId.length > 128) return
      const requestId = request.requestId
      if (typeof request.action !== 'string' || !BRIDGE_ACTIONS.has(request.action)
        || !request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
        sendBridge({ type: 'api-response', requestId, ok: false, status: 400, value: { error: 'invalid GenUI bridge request' } })
        return
      }
      let body
      try {
        body = JSON.stringify(request.body)
      } catch {
        sendBridge({ type: 'api-response', requestId, ok: false, status: 400, value: { error: 'GenUI bridge request must be JSON' } })
        return
      }
      if (new TextEncoder().encode(body).byteLength > 256 * 1024) {
        sendBridge({ type: 'api-response', requestId, ok: false, status: 413, value: { error: 'GenUI bridge request is too large' } })
        return
      }
      if (session.inFlight.has(requestId)) return
      if (session.inFlight.size >= 32) {
        sendBridge({ type: 'api-response', requestId, ok: false, status: 429, value: { error: 'too many GenUI bridge requests' } })
        return
      }
      session.inFlight.add(requestId)
      void requestArtifact(request.action, JSON.parse(body)).then(result => {
        if (bridge === session && session.inFlight.has(requestId)) sendBridge({ type: 'api-response', requestId, ...result })
      }, error => {
        if (bridge === session && session.inFlight.has(requestId)) sendBridge({
          type: 'api-response', requestId, ok: false, status: 502,
          value: { error: error instanceof Error ? error.message : 'GenUI host request failed' },
        })
      }).finally(() => session.inFlight.delete(requestId))
    }
    port.onmessageerror = () => {
      if (bridge === session) {
        closeBridge()
        showInteractiveFailure()
      }
    }
    port.start()
    sendBridge({ type: 'bridge-accepted' })
    return true
  }

  addEventListener('message', (event) => {
    const value = event.data
    if (value?.type === 'bridge-connect') {
      acceptBridge(event, value)
      return
    }
    if (event.source !== frame.contentWindow || value?.source !== 'dsh-genui'
      || value.artifactId !== artifactId || value.versionId !== activeVersionId) return
    void verifyBridgeAlive().then(alive => {
      if (!alive) return
      if (value.type === 'ready') {
        frameReady = true
        if (recoveryVersionId === activeVersionId) {
          recoveryVersionId = undefined
          announce(copy.restored)
        }
        return
      }
      if (value.type === 'runtime-error') {
        if (frameReady) showInteractiveFailure()
        else void recoverRuntimeFailure(activeVersionId)
        return
      }
      if (value.type === 'state-changed') {
        announceSaved()
        return
      }
      if (value.type !== 'permission-request' || typeof value.requestId !== 'string'
        || typeof value.permission?.id !== 'string') return
      const canonical = knownPermissions.find(permission => permission.id === value.permission.id)
      if (!canonical) {
        frame.contentWindow?.postMessage({ source: 'dsh-genui', type: 'permission-result', requestId: value.requestId, granted: false }, '*')
        return
      }
      if (canonical.granted) {
        frame.contentWindow?.postMessage({ source: 'dsh-genui', type: 'permission-result', requestId: value.requestId, granted: true }, '*')
        return
      }
      if (pending.some(request => request.requestId === value.requestId)) return
      pending.push({ ...value, permission: canonical })
      showPending()
    })
  })

  function sendTheme() {
    const theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    sendBridge({ type: 'theme', theme })
    frame.contentWindow?.postMessage({
      source: 'dsh-genui', type: 'theme', theme, artifactId, versionId: activeVersionId,
    }, '*')
  }
  const colorScheme = matchMedia('(prefers-color-scheme: dark)')
  colorScheme.addEventListener('change', sendTheme)
  frame.addEventListener('load', () => {
    if (!bridgeStarted) return
    closeBridge()
    showInteractiveFailure()
  })

  void bootstrapPermissions(activeVersionId)
}
`

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character)
}

export function standaloneHtml(
  routePrefix: string,
  artifactId: string,
  versionId: string,
  title: string,
  language: 'en' | 'zh',
): string {
  const copy = language === 'zh'
    ? { error: '这个页面链接无效。请回到任务中重新打开。', saved: '已保存', kicker: '需要你的同意', scope: '同意后，这个应用可以在当前任务中继续使用这项能力。用途发生变化时会再次询问。', deny: '暂不允许', allow: '允许当前任务使用' }
    : { error: 'This link is not valid. Open it again from the task.', saved: 'Saved', kicker: 'Your permission is needed', scope: 'Once allowed, this app can keep using this capability during the current task. You will be asked again if its purpose changes.', deny: 'Not now', allow: 'Allow for this task' }
  return `<!doctype html>
  <html lang="${language}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="theme-color" media="(prefers-color-scheme: light)" content="#faf9f6"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#171717"><title>${escapeHtml(title)}</title><style>
  html,body,#app{width:100%;height:100%;margin:0;border:0}body{overflow:hidden;background:#faf9f6;color:#242424;font-family:ui-sans-serif,system-ui,sans-serif}[hidden]{display:none!important}#error{display:grid;gap:14px;place-content:center;min-height:100%;padding:24px;text-align:center}#error button{justify-self:center}.notice{position:fixed;z-index:2;top:12px;left:50%;transform:translateX(-50%);border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:999px;padding:7px 11px;background:Canvas;color:CanvasText;box-shadow:0 8px 24px #0002;font-size:12px;font-weight:650;pointer-events:none}dialog{width:min(440px,calc(100% - 32px));max-height:calc(100dvh - 32px);overflow:auto;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:18px;padding:22px;box-shadow:0 24px 80px #0003;background:Canvas;color:CanvasText;overscroll-behavior:contain}dialog::backdrop{background:#0008;backdrop-filter:blur(6px)}.kicker{margin:0 0 5px;color:#b94e32;font-size:11px;font-weight:750;letter-spacing:.04em}h1{font-size:19px;line-height:1.25;margin:0 0 8px;text-wrap:balance}.reason,.scope{line-height:1.5;margin:0;color:color-mix(in srgb,currentColor 68%,transparent);overflow-wrap:anywhere}.facts{display:flex;flex-wrap:wrap;gap:7px;margin:14px 0}.facts span{max-width:100%;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:999px;padding:6px 9px;font-size:11px;font-weight:650;overflow-wrap:anywhere}.permission-list{display:grid;gap:7px;margin:14px 0}.permission-list>div{display:grid;gap:3px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:11px;padding:10px}.permission-list strong{font-size:12px}.permission-list>div>span{color:color-mix(in srgb,currentColor 68%,transparent);font-size:11px;line-height:1.4}.permission-list-facts{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.permission-list-facts span{border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:999px;padding:3px 6px;font-size:9px;font-weight:650}.scope{font-size:11px}.queue{margin:8px 0 0;font-size:11px;font-weight:650}.error{margin:10px 0 0;color:#a84235;font-size:12px}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}button{min-height:40px;font:650 12px/1 ui-sans-serif,system-ui,sans-serif;padding:0 14px;border-radius:10px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);background:transparent;color:inherit;cursor:pointer;touch-action:manipulation}button:hover{background:color-mix(in srgb,currentColor 7%,transparent)}button:focus-visible{outline:2px solid #b94e32;outline-offset:2px}button:last-child{background:#242424;color:#fff;border-color:#242424}button:disabled{cursor:wait;opacity:.5}@media(prefers-color-scheme:dark){body{background:#171717;color:#f5f5f5}.kicker{color:#e17a5f}.error{color:#e27b6d}button:last-child{background:#f5f5f5;color:#171717;border-color:#f5f5f5}}@media(max-width:520px){.notice{top:auto;bottom:12px}dialog{padding:18px}.actions button{flex:1}}
</style></head><body data-route-prefix="${routePrefix}" data-artifact-id="${artifactId}" data-version-id="${versionId}" data-language="${language}"><iframe id="app" title="${escapeHtml(title)}" sandbox="allow-scripts allow-modals" referrerpolicy="no-referrer"></iframe><main id="error" hidden>${copy.error}</main><div id="notice" class="notice" role="status" aria-live="polite" hidden>${copy.saved}</div><dialog id="permission" aria-labelledby="permission-title" aria-describedby="permission-reason permission-scope"><p class="kicker">${copy.kicker}</p><h1 id="permission-title"></h1><p class="reason" id="permission-reason"></p><div class="facts"><span id="permission-access"></span><span id="permission-destination" hidden></span><span id="permission-methods" hidden></span></div><div id="permission-list" class="permission-list" hidden></div><p class="scope" id="permission-scope">${copy.scope}</p><p id="permission-queue" class="queue" hidden></p><p class="error" id="permission-error" role="alert" hidden></p><div class="actions"><button id="deny" type="button">${copy.deny}</button><button id="allow" type="button">${copy.allow}</button></div></dialog><script type="module" src="${routePrefix}/standalone.js?runtime=${ARTIFACT_RUNTIME_VERSION}"></script></body></html>`
}
