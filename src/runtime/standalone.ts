export const ARTIFACT_RUNTIME_VERSION = '0.11.0'

export const STANDALONE_RUNTIME = String.raw`
const root = document.body
const frame = document.getElementById('app')
const dialog = document.getElementById('permission')
const permissionTitle = document.getElementById('permission-title')
const permissionReason = document.getElementById('permission-reason')
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
  frame.src = prefix + '/preview/' + encodeURIComponent(artifactId) + '/' + encodeURIComponent(versionId)
    + '?lang=' + encodeURIComponent(language) + '#token=' + encodeURIComponent(token)

  let pending
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
    try {
      const response = await fetch(prefix + '/api/' + encodeURIComponent(artifactId) + '/permission/grant', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ version_id: versionId, capability_id: pending.permission.id }),
      })
      answer(response.ok)
    } catch {
      permissionReason.textContent = language === 'zh' ? '暂时无法连接，请稍后再试。' : 'Could not connect. Try again in a moment.'
    } finally {
      allow.disabled = false
    }
  })

  addEventListener('message', (event) => {
    const value = event.data
    if (event.source !== frame.contentWindow || value?.source !== 'dsh-genui'
      || value?.type !== 'permission-request' || value.artifactId !== artifactId
      || value.versionId !== versionId || typeof value.requestId !== 'string') return
    pending = value
    permissionTitle.textContent = value.permission.label
    permissionReason.textContent = value.permission.reason
    dialog.showModal()
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
    ? { error: '这个页面链接无效。请回到任务中重新打开。', deny: '暂不允许', allow: '允许' }
    : { error: 'This link is not valid. Open it again from the task.', deny: 'Not now', allow: 'Allow' }
  return `<!doctype html>
<html lang="${language}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escapeHtml(title)}</title><style>
html,body,#app{width:100%;height:100%;margin:0;border:0}body{overflow:hidden;background:#faf9f6;color:#242424;font-family:ui-sans-serif,system-ui,sans-serif}[hidden]{display:none!important}#error{display:grid;place-items:center;min-height:100%;padding:24px;text-align:center}dialog{max-width:420px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:18px;padding:22px;box-shadow:0 24px 80px #0003;background:Canvas;color:CanvasText}dialog::backdrop{background:#0006}h1{font-size:18px;margin:0 0 8px}p{line-height:1.5;margin:0 0 22px}.actions{display:flex;justify-content:flex-end;gap:10px}button{font:inherit;padding:9px 14px;border-radius:999px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);background:transparent;color:inherit;cursor:pointer}button:last-child{background:#242424;color:#fff;border-color:#242424}button:disabled{opacity:.5}@media(prefers-color-scheme:dark){body{background:#171717;color:#f5f5f5}button:last-child{background:#f5f5f5;color:#171717;border-color:#f5f5f5}}
</style></head><body data-route-prefix="${routePrefix}" data-artifact-id="${artifactId}" data-version-id="${versionId}" data-language="${language}"><iframe id="app" title="${escapeHtml(title)}" sandbox="allow-scripts allow-forms allow-modals allow-downloads" referrerpolicy="no-referrer"></iframe><main id="error" hidden>${copy.error}</main><dialog id="permission"><h1 id="permission-title"></h1><p id="permission-reason"></p><div class="actions"><button id="deny" type="button">${copy.deny}</button><button id="allow" type="button">${copy.allow}</button></div></dialog><script type="module" src="${routePrefix}/standalone.js?runtime=${ARTIFACT_RUNTIME_VERSION}"></script></body></html>`
}
