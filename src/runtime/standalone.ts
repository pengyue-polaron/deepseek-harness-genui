export const ARTIFACT_RUNTIME_VERSION = '0.12.1'

export const STANDALONE_RUNTIME = String.raw`
const root = document.body
const frame = document.getElementById('app')
const dialog = document.getElementById('permission')
const permissionTitle = document.getElementById('permission-title')
const permissionReason = document.getElementById('permission-reason')
const permissionAccess = document.getElementById('permission-access')
const permissionDestination = document.getElementById('permission-destination')
const permissionMethods = document.getElementById('permission-methods')
const permissionError = document.getElementById('permission-error')
const deny = document.getElementById('deny')
const allow = document.getElementById('allow')
const token = new URLSearchParams(location.hash.slice(1)).get('token')

if (!token) {
  document.getElementById('error').hidden = false
} else {
  const prefix = root.dataset.routePrefix
  const artifactId = root.dataset.artifactId
  const versionId = root.dataset.versionId
  const language = root.dataset.language
  const copy = language === 'zh'
    ? { read: '读取信息', write: '执行更改', connect: '连接到', methods: '允许请求', failed: '暂时无法完成授权，请重试。' }
    : { read: 'Read information', write: 'Make changes', connect: 'Connect to', methods: 'Allowed requests', failed: 'Permission could not be saved. Try again.' }
  frame.src = prefix + '/preview/' + encodeURIComponent(artifactId) + '/' + encodeURIComponent(versionId)
    + '?lang=' + encodeURIComponent(language) + '#token=' + encodeURIComponent(token)

  let pending
  const showFact = (element, value) => {
    element.hidden = !value
    element.textContent = value || ''
  }
  const answer = (granted) => {
    if (!pending) return
    frame.contentWindow?.postMessage({
      source: 'dsh-genui', type: 'permission-result', requestId: pending.requestId, granted,
    }, '*')
    pending = undefined
    dialog.close()
  }

  deny.addEventListener('click', () => answer(false))
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); answer(false) })
  allow.addEventListener('click', async () => {
    if (!pending) return
    allow.disabled = true
    deny.disabled = true
    permissionError.hidden = true
    try {
      const response = await fetch(prefix + '/api/' + encodeURIComponent(artifactId) + '/permission/grant', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ version_id: versionId, capability_id: pending.permission.id }),
      })
      if (response.ok) answer(true)
      else {
        permissionError.textContent = copy.failed
        permissionError.hidden = false
      }
    } catch {
      permissionError.textContent = copy.failed
      permissionError.hidden = false
    } finally {
      allow.disabled = false
      deny.disabled = false
    }
  })

  addEventListener('message', (event) => {
    const value = event.data
    if (event.source !== frame.contentWindow || value?.source !== 'dsh-genui'
      || value?.type !== 'permission-request' || value.artifactId !== artifactId
      || value.versionId !== versionId || typeof value.requestId !== 'string'
      || typeof value.permission?.id !== 'string' || typeof value.permission?.label !== 'string'
      || typeof value.permission?.reason !== 'string'
      || (value.permission?.access !== 'read' && value.permission?.access !== 'write')) return
    pending = value
    permissionTitle.textContent = value.permission.label
    permissionReason.textContent = value.permission.reason
    permissionError.hidden = true
    showFact(permissionAccess, value.permission.access === 'write' ? copy.write : copy.read)
    showFact(permissionDestination, typeof value.permission.destination === 'string'
      ? copy.connect + ' ' + value.permission.destination : '')
    showFact(permissionMethods, Array.isArray(value.permission.methods) && value.permission.methods.length
      ? copy.methods + ' ' + value.permission.methods.filter(method => typeof method === 'string').join(' / ') : '')
    if (!dialog.open) dialog.showModal()
  })
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
    ? { error: '这个页面链接无效。请回到任务中重新打开。', kicker: '需要你的同意', scope: '同意后，这个应用可以在当前任务中继续使用这项能力。用途发生变化时会再次询问。', deny: '暂不允许', allow: '允许当前任务使用' }
    : { error: 'This link is not valid. Open it again from the task.', kicker: 'Your permission is needed', scope: 'Once allowed, this app can keep using this capability during the current task. You will be asked again if its purpose changes.', deny: 'Not now', allow: 'Allow for this task' }
  return `<!doctype html>
  <html lang="${language}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="theme-color" media="(prefers-color-scheme: light)" content="#faf9f6"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#171717"><title>${escapeHtml(title)}</title><style>
  html,body,#app{width:100%;height:100%;margin:0;border:0}body{overflow:hidden;background:#faf9f6;color:#242424;font-family:ui-sans-serif,system-ui,sans-serif}[hidden]{display:none!important}#error{display:grid;place-items:center;min-height:100%;padding:24px;text-align:center}dialog{width:min(440px,calc(100% - 32px));max-height:calc(100dvh - 32px);overflow:auto;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:18px;padding:22px;box-shadow:0 24px 80px #0003;background:Canvas;color:CanvasText;overscroll-behavior:contain}dialog::backdrop{background:#0008;backdrop-filter:blur(6px)}.kicker{margin:0 0 5px;color:#b94e32;font-size:11px;font-weight:750;letter-spacing:.04em}h1{font-size:19px;line-height:1.25;margin:0 0 8px;text-wrap:balance}.reason,.scope{line-height:1.5;margin:0;color:color-mix(in srgb,currentColor 68%,transparent);overflow-wrap:anywhere}.facts{display:flex;flex-wrap:wrap;gap:7px;margin:14px 0}.facts span{max-width:100%;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:999px;padding:6px 9px;font-size:11px;font-weight:650;overflow-wrap:anywhere}.scope{font-size:11px}.error{margin:10px 0 0;color:#a84235;font-size:12px}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}button{min-height:40px;font:650 12px/1 ui-sans-serif,system-ui,sans-serif;padding:0 14px;border-radius:10px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);background:transparent;color:inherit;cursor:pointer;touch-action:manipulation}button:hover{background:color-mix(in srgb,currentColor 7%,transparent)}button:focus-visible{outline:2px solid #b94e32;outline-offset:2px}button:last-child{background:#242424;color:#fff;border-color:#242424}button:disabled{cursor:wait;opacity:.5}@media(prefers-color-scheme:dark){body{background:#171717;color:#f5f5f5}.kicker{color:#e17a5f}.error{color:#e27b6d}button:last-child{background:#f5f5f5;color:#171717;border-color:#f5f5f5}}@media(max-width:520px){dialog{padding:18px}.actions button{flex:1}}
</style></head><body data-route-prefix="${routePrefix}" data-artifact-id="${artifactId}" data-version-id="${versionId}" data-language="${language}"><iframe id="app" title="${escapeHtml(title)}" sandbox="allow-scripts allow-forms allow-modals allow-downloads" referrerpolicy="no-referrer"></iframe><main id="error" hidden>${copy.error}</main><dialog id="permission" aria-labelledby="permission-title" aria-describedby="permission-reason permission-scope"><p class="kicker">${copy.kicker}</p><h1 id="permission-title"></h1><p class="reason" id="permission-reason"></p><div class="facts"><span id="permission-access"></span><span id="permission-destination" hidden></span><span id="permission-methods" hidden></span></div><p class="scope" id="permission-scope">${copy.scope}</p><p class="error" id="permission-error" role="alert" hidden></p><div class="actions"><button id="deny" type="button">${copy.deny}</button><button id="allow" type="button">${copy.allow}</button></div></dialog><script type="module" src="${routePrefix}/standalone.js?runtime=${ARTIFACT_RUNTIME_VERSION}"></script></body></html>`
}
