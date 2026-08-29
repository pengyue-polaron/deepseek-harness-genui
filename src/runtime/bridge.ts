export const ARTIFACT_BRIDGE_VERSION = 1
export const ARTIFACT_BRIDGE_TOKEN = 'bridge-v1'

/**
 * Runs before every generated bundle. The bootstrap owns the only MessagePort,
 * replaces legacy SDK fetches, and does not start app.js until the trusted host
 * has accepted the channel and the preview document has completed its first load.
 */
export const BRIDGE_RUNTIME = String.raw`
(() => {
  const BRIDGE_VERSION = 1
  const BRIDGE_TOKEN = 'bridge-v1'
  const ALLOWED_ACTIONS = new Set(['state/read', 'state/write', 'tool', 'external'])
  const root = document.getElementById('root')
  const artifactId = root?.dataset.artifactId
  const versionId = root?.dataset.versionId
  const apiBase = root?.dataset.apiBase
  const appSrc = root?.dataset.appSrc
  const fragment = new URLSearchParams(location.hash.slice(1))
  const fragmentEntries = [...fragment.entries()]
  const bridgeNonce = fragment.get('bridge_nonce')
  const bridgeToken = fragment.get('token')
  if (!artifactId || !versionId || !apiBase || !appSrc || bridgeToken !== BRIDGE_TOKEN
    || !bridgeNonce || bridgeNonce.length < 16 || bridgeNonce.length > 128
    || !/^[a-z0-9._~-]+$/i.test(bridgeNonce) || fragmentEntries.length !== 2
    || fragment.getAll('token').length !== 1 || fragment.getAll('bridge_nonce').length !== 1) return

  const channel = new MessageChannel()
  const port = channel.port1
  const postPort = MessagePort.prototype.postMessage
  const startPort = MessagePort.prototype.start
  const closePort = MessagePort.prototype.close
  const originalFetch = globalThis.fetch.bind(globalThis)
  const NativeRequest = globalThis.Request
  const NativeResponse = globalThis.Response
  const NativeURL = globalThis.URL
  const encodeUtf8 = new TextEncoder()
  const parseJson = JSON.parse.bind(JSON)
  const stringifyJson = JSON.stringify.bind(JSON)
  const getHeader = Headers.prototype.get
  const readRequestText = Request.prototype.text
  const apiEndpoint = (() => {
    try {
      const endpoint = new NativeURL(apiBase, location.href)
      if (endpoint.origin !== location.origin || endpoint.username !== '' || endpoint.password !== ''
        || endpoint.search !== '' || endpoint.hash !== '' || endpoint.pathname.endsWith('/')) return undefined
      return endpoint
    } catch {
      return undefined
    }
  })()
  if (!apiEndpoint) return
  const apiPath = apiEndpoint.pathname
  const apiPrefix = apiPath + '/'
  const apiMarkerAt = apiPath.lastIndexOf('/api/')
  if (apiMarkerAt < 0) return
  const apiNamespace = apiPath.slice(0, apiMarkerAt + '/api/'.length)
  const pending = new Map()
  let accepted = false
  let previewLoaded = document.readyState === 'complete'
  let previewAcknowledged = false
  let appStarted = false
  let closed = false

  const timeoutFor = (action) => action === 'tool' ? 65000 : action === 'external' ? 35000 : 10000
  const post = (value) => {
    if (!closed) postPort.call(port, { source: 'dsh-genui', bridgeVersion: BRIDGE_VERSION, nonce: bridgeNonce, ...value })
  }
  const failPending = (message) => {
    for (const item of pending.values()) {
      clearTimeout(item.timeout)
      item.reject(new Error(message))
    }
    pending.clear()
  }
  const close = (message = 'GenUI host bridge was closed') => {
    if (closed) return
    closed = true
    failPending(message)
    closePort.call(port)
  }
  const announceLoaded = () => {
    if (!accepted || !previewLoaded || previewAcknowledged || closed) return
    previewAcknowledged = true
    post({ type: 'preview-loaded', artifactId, versionId })
  }
  const startApp = () => {
    if (appStarted || closed) return
    appStarted = true
    const script = document.createElement('script')
    script.type = 'module'
    script.src = appSrc
    script.addEventListener('error', () => {
      parent.postMessage({ source: 'dsh-genui', type: 'runtime-error', phase: 'bootstrap', artifactId, versionId }, '*')
    }, { once: true })
    document.body.append(script)
  }
  const applyTheme = (theme) => {
    if (theme !== 'dark' && theme !== 'light') return
    const dark = theme === 'dark'
    document.documentElement.toggleAttribute('data-ds-dark-theme', dark)
    document.documentElement.toggleAttribute('data-ds-light-theme', !dark)
    document.documentElement.style.colorScheme = theme
  }

  port.onmessage = (event) => {
    const value = event.data
    if (!value || typeof value !== 'object' || value.source !== 'dsh-genui'
      || value.bridgeVersion !== BRIDGE_VERSION || value.nonce !== bridgeNonce) return
    if (value.type === 'bridge-accepted') {
      if (accepted) return
      accepted = true
      announceLoaded()
      return
    }
    if (!accepted) return
    if (value.type === 'start-app') {
      startApp()
      return
    }
    if (value.type === 'theme') {
      applyTheme(value.theme)
      return
    }
    if (value.type === 'liveness-challenge' && typeof value.requestId === 'string') {
      post({ type: 'liveness-response', requestId: value.requestId, artifactId, versionId })
      return
    }
    if (value.type === 'bridge-closed') {
      close()
      return
    }
    if (value.type !== 'api-response' || typeof value.requestId !== 'string') return
    const waiter = pending.get(value.requestId)
    if (!waiter) return
    pending.delete(value.requestId)
    clearTimeout(waiter.timeout)
    waiter.resolve({ ok: value.ok === true, status: Number(value.status) || 500, value: value.value })
  }
  port.onmessageerror = () => close('GenUI host bridge received an invalid response')
  startPort.call(port)

  const request = (action, body) => {
    if (!ALLOWED_ACTIONS.has(action)) return Promise.reject(new Error('GenUI bridge action is not allowed'))
    let serialized
    try {
      serialized = stringifyJson(body ?? {})
    } catch {
      return Promise.reject(new Error('GenUI request body must be JSON'))
    }
    if (serialized === undefined || encodeUtf8.encode(serialized).byteLength > 256 * 1024) {
      return Promise.reject(new Error('GenUI request body is too large'))
    }
    const requestId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!pending.delete(requestId)) return
        reject(new Error('GenUI request timed out'))
      }, timeoutFor(action))
      pending.set(requestId, { resolve, reject, timeout })
      post({ type: 'api-request', requestId, artifactId, versionId, action, body: parseJson(serialized) })
    })
  }

  Object.defineProperty(globalThis, '__dshGenuiBridge', {
    value: Object.freeze({ request }), configurable: false, enumerable: false, writable: false,
  })

  globalThis.fetch = async (input, init) => {
    let requestValue
    try {
      requestValue = input instanceof NativeRequest
        ? new NativeRequest(input, init)
        : new NativeRequest(new NativeURL(String(input), location.href).toString(), init)
      const target = new NativeURL(requestValue.url)
      const authorization = getHeader.call(requestValue.headers, 'authorization')
      const targetsApiNamespace = target.origin === apiEndpoint.origin
        && target.pathname.startsWith(apiNamespace)
      const targetsCurrentApi = target.origin === apiEndpoint.origin
        && (target.pathname === apiPath || target.pathname.startsWith(apiPrefix))

      // Authorization belongs exclusively to the private bridge. Never let a
      // real capability or a malformed bridge request fall through to network.
      if (!targetsCurrentApi) {
        if (authorization !== null || targetsApiNamespace) {
          throw new Error('GenUI API requests must use the host bridge')
        }
        return originalFetch(input, init)
      }

      const action = target.pathname.slice(apiPrefix.length)
      const contentType = getHeader.call(requestValue.headers, 'content-type')
      if (target.username !== '' || target.password !== '' || target.search !== '' || target.hash !== ''
        || !ALLOWED_ACTIONS.has(action) || target.pathname !== apiPrefix + action
        || requestValue.method !== 'POST' || authorization !== 'Bearer ' + BRIDGE_TOKEN
        || contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
        throw new Error('Invalid GenUI legacy bridge request')
      }

      const text = await readRequestText.call(requestValue)
      if (encodeUtf8.encode(text).byteLength > 256 * 1024) {
        throw new Error('GenUI request body is too large')
      }
      if (text === '') throw new Error('GenUI request body must be a JSON object')
      const body = parseJson(text)
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new Error('GenUI request body must be a JSON object')
      }
      const result = await request(action, body)
      return new NativeResponse(stringifyJson(result.value), {
        status: result.status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      })
    } catch (error) {
      return Promise.reject(error)
    }
  }

  addEventListener('load', () => {
    previewLoaded = true
    announceLoaded()
  }, { once: true })
  addEventListener('pagehide', () => post({ type: 'preview-leaving', artifactId, versionId }), { once: true })

  parent.postMessage({
    source: 'dsh-genui', type: 'bridge-connect', bridgeVersion: BRIDGE_VERSION,
    nonce: bridgeNonce, artifactId, versionId,
  }, '*', [channel.port2])
})()
`
