import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, posix } from 'node:path'
import { build, type BuildResult, type Loader, type Message, type Plugin } from 'esbuild'
import type { ArtifactVersion, BuildDiagnostic } from './types.ts'

const ALLOWED_IMPORTS = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  'lucide-react',
  'recharts',
  'date-fns',
  'zustand',
  'framer-motion',
  '@dsh-genui/sdk',
])

const DEPENDENCY_ROOT = dirname(createRequire(import.meta.url).resolve('react/package.json'))

const SDK_SOURCE = String.raw`
import { useCallback, useEffect, useRef, useState } from 'react'

const permissionWaiters = new Map()
const inFlightRequests = new Map()
const stateWriteQueues = new Map()

addEventListener('message', (event) => {
  if (event.source !== parent || event.data?.source !== 'dsh-genui' || event.data?.type !== 'permission-result') return
  const waiter = permissionWaiters.get(event.data.requestId)
  if (!waiter) return
  permissionWaiters.delete(event.data.requestId)
  waiter(Boolean(event.data.granted))
})

const runtime = () => {
  const root = document.getElementById('root')
  const artifactId = root?.dataset.artifactId
  const versionId = root?.dataset.versionId
  if (!artifactId || !versionId) throw new Error('GenUI runtime metadata is missing')
  return { artifactId, versionId }
}

const bridge = () => {
  const value = globalThis.__dshGenuiBridge
  if (!value || typeof value.request !== 'function') throw new Error('GenUI host bridge is unavailable')
  return value
}

const askPermission = (permission) => new Promise((resolve) => {
  const { artifactId, versionId } = runtime()
  const requestId = crypto.randomUUID()
  permissionWaiters.set(requestId, resolve)
  parent.postMessage({ source: 'dsh-genui', type: 'permission-request', requestId, artifactId, versionId, permission }, '*')
})

const sendRequest = async (action, body, mayAsk) => {
  const { versionId } = runtime()
  const response = await bridge().request(action, { ...body, version_id: versionId })
  const value = response.value
  if (!response.ok && mayAsk && value?.code === 'approval_required' && value.permission) {
    const granted = await askPermission(value.permission)
    if (!granted) throw new Error('Permission was not granted')
    return sendRequest(action, body, false)
  }
  if (!response.ok) throw new Error(value?.error || ('GenUI request failed: ' + response.status))
  return value
}

const request = (action, body) => {
  const key = action + ':' + JSON.stringify(body)
  const current = inFlightRequests.get(key)
  if (current) return current
  const pending = sendRequest(action, body, true)
  inFlightRequests.set(key, pending)
  void pending.then(
    () => { setTimeout(() => inFlightRequests.delete(key), 250) },
    () => { inFlightRequests.delete(key) },
  )
  return pending
}

const flushStateWrites = async (key, queue) => {
  if (queue.running) return
  queue.running = true
  while (queue.queued) {
    const batch = queue.queued
    queue.queued = undefined
    try {
      const answer = await sendRequest('state/write', { key, value: batch.value }, true)
      batch.waiters.forEach(waiter => waiter.resolve(answer))
    } catch (cause) {
      batch.waiters.forEach(waiter => waiter.reject(cause))
    }
  }
  queue.running = false
  if (!queue.queued && stateWriteQueues.get(key) === queue) {
    stateWriteQueues.delete(key)
    queue.resolveIdle()
  } else {
    void flushStateWrites(key, queue)
  }
}

const writeState = (key, value) => {
  let queue = stateWriteQueues.get(key)
  if (!queue) {
    let resolveIdle
    const idle = new Promise(resolve => { resolveIdle = resolve })
    queue = { running: false, queued: undefined, idle, resolveIdle }
    stateWriteQueues.set(key, queue)
  }
  const pending = new Promise((resolve, reject) => {
    if (queue.queued) {
      queue.queued.value = value
      queue.queued.waiters.push({ resolve, reject })
    } else {
      queue.queued = { value, waiters: [{ resolve, reject }] }
    }
  })
  void flushStateWrites(key, queue)
  return pending
}

const readState = async (key) => {
  const queue = stateWriteQueues.get(key)
  if (queue) await queue.idle
  return sendRequest('state/read', { key }, true)
}

export const artifactContext = () => {
  const { artifactId, versionId } = runtime()
  return { artifactId, versionId }
}

export const callTool = (name, args) => request('tool', { name, arguments: args })

export const requestExternal = (url, options = {}) => request('external', {
  url,
  method: options.method || 'GET',
  headers: options.headers || {},
  ...(options.body === undefined ? {} : { body: options.body }),
})

const notifyStateChanged = (key) => {
  const { artifactId, versionId } = runtime()
  parent.postMessage({ source: 'dsh-genui', type: 'state-changed', artifactId, versionId, key }, '*')
}

export const reportResult = async (value) => {
  const answer = await writeState('__result', value)
  notifyStateChanged('__result')
  return answer
}

export function watchTool(name, args, listener, options = {}) {
  let stopped = false
  let timer
  const intervalMs = Math.max(5000, Math.min(60000, options.intervalMs || 5000))
  const refresh = async () => {
    try {
      const value = await callTool(name, args)
      if (!stopped) listener(value)
    } catch (cause) {
      if (!stopped) options.onError?.(cause)
    } finally {
      if (!stopped) timer = setTimeout(refresh, intervalMs)
    }
  }
  void refresh()
  return () => { stopped = true; if (timer) clearTimeout(timer) }
}

export function useArtifactState(key, initialValue) {
  const [value, setValue] = useState(initialValue)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [pendingWrites, setPendingWrites] = useState(0)
  const valueRef = useRef(initialValue)
  const revisionRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    let active = true
    const readRevision = ++revisionRef.current
    valueRef.current = initialValue
    setValue(initialValue)
    setReady(false)
    setError(null)
    readState(key).then((answer) => {
      if (!active) return
      if (answer.found && revisionRef.current === readRevision) {
        valueRef.current = answer.value
        setValue(answer.value)
      }
      setReady(true)
    }).catch((cause) => {
      if (!active) return
      setError(cause instanceof Error ? cause : new Error(String(cause)))
      setReady(true)
    })
    return () => { active = false }
  }, [key])

  const update = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(valueRef.current) : next
    revisionRef.current += 1
    valueRef.current = resolved
    setValue(resolved)
    setPendingWrites(current => current + 1)
    setError(null)
    void writeState(key, resolved).then(() => {
      if (!mountedRef.current) return
      setError(null)
      notifyStateChanged(key)
    }, (cause) => {
      if (mountedRef.current) setError(cause instanceof Error ? cause : new Error(String(cause)))
    }).finally(() => {
      if (mountedRef.current) setPendingWrites(current => Math.max(0, current - 1))
    })
  }, [key])

  return [value, update, { ready, error, saving: pendingWrites > 0 }]
}
`

function loaderFor(path: string): Loader {
  switch (extname(path)) {
    case '.tsx': return 'tsx'
    case '.ts': return 'ts'
    case '.jsx': return 'jsx'
    case '.js': return 'js'
    case '.css': return 'css'
    case '.json': return 'json'
    case '.svg': return 'dataurl'
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.webp': return 'dataurl'
    default: return 'text'
  }
}

function diagnostics(messages: Message[], severity: BuildDiagnostic['severity']): BuildDiagnostic[] {
  return messages.map(message => ({
    severity,
    text: message.text,
    ...(message.location?.file === undefined ? {} : { file: message.location.file }),
    ...(message.location?.line === undefined ? {} : { line: message.location.line }),
    ...(message.location?.column === undefined ? {} : { column: message.location.column }),
  }))
}

function sourcePlugin(version: ArtifactVersion): Plugin {
  const files = new Map(version.files.map(file => [file.path, file.content]))
  const resolveRelative = (specifier: string, importer: string): string | undefined => {
    const base = posix.normalize(posix.join(posix.dirname(importer), specifier))
    const candidates = [base, `${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, `${base}.css`, `${base}.json`,
      posix.join(base, 'index.tsx'), posix.join(base, 'index.ts'), posix.join(base, 'index.jsx'), posix.join(base, 'index.js')]
    return candidates.find(candidate => files.has(candidate))
  }
  return {
    name: 'dsh-genui-source',
    setup(context) {
      context.onResolve({ filter: /^src\/main\.tsx$/ }, (args) =>
        args.kind === 'entry-point' ? { path: args.path, namespace: 'genui-source' } : undefined)
      context.onResolve({ filter: /^@dsh-genui\/sdk$/ }, () => ({ path: '@dsh-genui/sdk', namespace: 'genui-sdk' }))
      context.onLoad({ filter: /.*/, namespace: 'genui-sdk' }, () => ({ contents: SDK_SOURCE, loader: 'js', resolveDir: DEPENDENCY_ROOT }))
      context.onResolve({ filter: /.*/, namespace: 'genui-source' }, (args) => {
        if (args.path.startsWith('data:')) {
          return { errors: [{ text: 'Data URL imports are not allowed in GenUI artifacts' }] }
        }
        if (args.path.startsWith('.') || args.path.startsWith('/')) {
          const resolved = resolveRelative(args.path, args.importer)
          return resolved === undefined
            ? { errors: [{ text: `Cannot resolve generated source import ${args.path} from ${args.importer}` }] }
            : { path: resolved, namespace: 'genui-source' }
        }
        const root = args.path.startsWith('@') ? args.path.split('/').slice(0, 2).join('/') : args.path.split('/')[0] ?? args.path
        if (!ALLOWED_IMPORTS.has(args.path) && !ALLOWED_IMPORTS.has(root)) {
          return { errors: [{ text: `Import is not allowed in GenUI artifacts: ${args.path}` }] }
        }
        return undefined
      })
      context.onLoad({ filter: /.*/, namespace: 'genui-source' }, (args) => {
        const contents = files.get(args.path)
        if (contents === undefined) return { errors: [{ text: `Generated source file not found: ${args.path}` }] }
        return { contents, loader: loaderFor(args.path), resolveDir: DEPENDENCY_ROOT }
      })
    },
  }
}

export interface ArtifactBuildResult {
  ok: boolean
  diagnostics: BuildDiagnostic[]
  outputFiles: string[]
}

function stateContractDiagnostics(version: ArtifactVersion): BuildDiagnostic[] {
  const source = version.files
    .filter(file => file.path.startsWith('src/'))
    .map(file => file.content)
    .join('\n')
  const collectsUserState = /<\s*(?:input|select|textarea)\b|\baria-(?:checked|pressed)\s*=|\brole\s*=\s*["'](?:checkbox|radio|slider|switch)["']/i.test(source)
  if (!collectsUserState || /\buseArtifactState\s*(?:<[\s\S]{0,500}?>\s*)?\(/.test(source)) return []
  return [{
    severity: 'error',
    text: 'Interactive user choices must use useArtifactState so they survive Canvas changes and remain readable on the next turn.',
  }]
}

const SANDBOX_SOURCE_RULES: Array<{ pattern: RegExp; text: string }> = [
  {
    pattern: /\bfetch\s*\(|\b(?:XMLHttpRequest|WebSocket|EventSource|WebTransport)\b|\bnavigator\s*(?:\.\s*sendBeacon|\[\s*['"]sendBeacon['"]\s*\])/,
    text: 'Generated apps must use callTool or requestExternal instead of raw browser networking APIs.',
  },
  {
    pattern: /\b(?:window|globalThis|self)\s*(?:\.\s*open\b|\[\s*['"]open['"]\s*\])|\b(?:window|globalThis|self|document)\s*(?:\.\s*location\b|\[\s*['"]location['"]\s*\])|(?:^|[;{}]\s*)location\s*=|(?:^|[^\w$.])location\s*\.\s*(?:href|assign|replace|reload)\b/m,
    text: 'Generated apps cannot navigate browsing contexts; keep external access inside requestExternal.',
  },
  {
    pattern: /<\s*(?:a|meta)\b|<\s*(?:form|button|input)\b[^>]*\b(?:action|formAction|target)\s*=|\b(?:React\s*\.\s*)?createElement\s*\(\s*['"](?:a|meta)['"]\s*[,)]|\.\s*(?:submit|requestSubmit)\s*\(/i,
    text: 'Generated apps cannot create navigable links, refresh markup, form targets, or native form submissions; use buttons and SDK actions.',
  },
  {
    pattern: /\b(?:dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML)\b|\bdocument\s*\.\s*write\s*\(/,
    text: 'Generated apps cannot inject unchecked HTML because it can create navigation paths outside the SDK.',
  },
]

function sandboxContractDiagnostics(version: ArtifactVersion): BuildDiagnostic[] {
  const found: BuildDiagnostic[] = []
  for (const file of version.files) {
    if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file.path)) continue
    const rule = SANDBOX_SOURCE_RULES.find(candidate => candidate.pattern.test(file.content))
    if (rule !== undefined) found.push({ severity: 'error', text: rule.text, file: file.path })
  }
  return found
}

export async function buildArtifact(version: ArtifactVersion, distPath: string): Promise<ArtifactBuildResult> {
  const contractDiagnostics = [...stateContractDiagnostics(version), ...sandboxContractDiagnostics(version)]
  if (contractDiagnostics.length > 0) return { ok: false, diagnostics: contractDiagnostics, outputFiles: [] }
  let result: BuildResult
  try {
    result = await build({
      entryPoints: ['src/main.tsx'],
      bundle: true,
      write: false,
      outdir: distPath,
      entryNames: 'app',
      assetNames: 'assets/[name]-[hash]',
      format: 'esm',
      platform: 'browser',
      target: ['es2022'],
      jsx: 'automatic',
      sourcemap: 'external',
      banner: {
        js: `(() => {
  globalThis.__dshGenuiReady = false
  const preventDefault = Event.prototype.preventDefault
  const composedPath = Event.prototype.composedPath
  const Anchor = HTMLAnchorElement
  const cancelDefault = (event) => { preventDefault.call(event) }
  const cancelAnchorDefault = (event) => {
    if (composedPath.call(event).some(node => node instanceof Anchor)) preventDefault.call(event)
  }
  addEventListener('submit', cancelDefault, true)
  addEventListener('click', cancelAnchorDefault, true)
  addEventListener('auxclick', cancelAnchorDefault, true)
  const navigationController = globalThis.navigation
  if (navigationController && typeof navigationController.addEventListener === 'function') {
    EventTarget.prototype.addEventListener.call(navigationController, 'navigate', cancelDefault)
  }
  addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.source !== 'dsh-genui' || event.data?.type !== 'theme'
      || (event.data.theme !== 'dark' && event.data.theme !== 'light')) return
    document.documentElement.toggleAttribute('data-ds-dark-theme', event.data.theme === 'dark')
    document.documentElement.toggleAttribute('data-ds-light-theme', event.data.theme === 'light')
    document.documentElement.style.colorScheme = event.data.theme
  })
  const reportGenuiRuntimeError = () => {
    const root = document.getElementById('root')
    parent.postMessage({ source: 'dsh-genui', type: 'runtime-error', phase: globalThis.__dshGenuiReady ? 'interactive' : 'startup', artifactId: root?.dataset.artifactId, versionId: root?.dataset.versionId }, '*')
  }
  addEventListener('error', reportGenuiRuntimeError)
  addEventListener('unhandledrejection', reportGenuiRuntimeError)
})()`,
      },
      footer: {
        js: `const postGenuiReady = () => {
  const root = document.getElementById('root')
  globalThis.__dshGenuiReady = true
  parent.postMessage({ source: 'dsh-genui', type: 'ready', artifactId: root?.dataset.artifactId, versionId: root?.dataset.versionId }, '*')
}
addEventListener('message', (event) => {
  const root = document.getElementById('root')
  if (event.source === parent && event.data?.source === 'dsh-genui' && event.data?.type === 'ready-request'
    && event.data?.artifactId === root?.dataset.artifactId && event.data?.versionId === root?.dataset.versionId
    && globalThis.__dshGenuiReady) postGenuiReady()
})
const waitForGenuiMount = () => {
  const root = document.getElementById('root')
  if (!root || root.childNodes.length === 0) {
    requestAnimationFrame(waitForGenuiMount)
    return
  }
  setTimeout(() => {
    if (!globalThis.__dshGenuiReady && root.isConnected && root.childNodes.length > 0) postGenuiReady()
  }, 0)
}
requestAnimationFrame(() => requestAnimationFrame(waitForGenuiMount))`,
      },
      metafile: true,
      logLevel: 'silent',
      plugins: [sourcePlugin(version)],
    })
  } catch (error) {
    const failure = error as { errors?: Message[]; warnings?: Message[]; message?: string }
    return {
      ok: false,
      diagnostics: [
        ...diagnostics(failure.errors ?? [], 'error'),
        ...diagnostics(failure.warnings ?? [], 'warning'),
        ...(failure.errors?.length ? [] : [{ severity: 'error' as const, text: failure.message ?? String(error) }]),
      ],
      outputFiles: [],
    }
  }
  await mkdir(distPath, { recursive: true })
  const outputFiles: string[] = []
  for (const output of result.outputFiles ?? []) {
    await mkdir(dirname(output.path), { recursive: true })
    await writeFile(output.path, output.contents, { mode: 0o600 })
    outputFiles.push(output.path)
  }
  return {
    ok: true,
    diagnostics: diagnostics(result.warnings, 'warning'),
    outputFiles,
  }
}
