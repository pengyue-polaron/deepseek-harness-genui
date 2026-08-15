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
import { useCallback, useEffect, useState } from 'react'

const permissionWaiters = new Map()
const inFlightRequests = new Map()

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
  const apiBase = root?.dataset.apiBase
  if (!artifactId || !versionId || !apiBase) throw new Error('GenUI runtime metadata is missing')
  const token = new URLSearchParams(location.hash.slice(1)).get('token')
  if (!token) throw new Error('GenUI capability token is missing')
  return { artifactId, versionId, apiBase, token }
}

const askPermission = (permission) => new Promise((resolve) => {
  const { artifactId, versionId } = runtime()
  const requestId = crypto.randomUUID()
  permissionWaiters.set(requestId, resolve)
  parent.postMessage({ source: 'dsh-genui', type: 'permission-request', requestId, artifactId, versionId, permission }, '*')
})

const sendRequest = async (action, body, mayAsk) => {
  const { apiBase, token, versionId } = runtime()
  const response = await fetch(apiBase + '/' + action, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ ...body, version_id: versionId }),
  })
  const value = await response.json()
  if (!response.ok && mayAsk && value.code === 'approval_required' && value.permission) {
    const granted = await askPermission(value.permission)
    if (!granted) throw new Error('Permission was not granted')
    return sendRequest(action, body, false)
  }
  if (!response.ok) throw new Error(value.error || ('GenUI request failed: ' + response.status))
  return value
}

const request = (action, body) => {
  const key = action + ':' + JSON.stringify(body)
  const current = inFlightRequests.get(key)
  if (current) return current
  const pending = sendRequest(action, body, true).finally(() => {
    setTimeout(() => inFlightRequests.delete(key), 250)
  })
  inFlightRequests.set(key, pending)
  return pending
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
  const answer = await request('state/write', { key: '__result', value })
  notifyStateChanged('__result')
  return answer
}

export function watchTool(name, args, listener, options = {}) {
  let stopped = false
  let timer
  const intervalMs = Math.max(1000, Math.min(60000, options.intervalMs || 5000))
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

  useEffect(() => {
    let active = true
    request('state/read', { key }).then((answer) => {
      if (!active) return
      if (answer.found) setValue(answer.value)
      setReady(true)
    }).catch((cause) => {
      if (!active) return
      setError(cause instanceof Error ? cause : new Error(String(cause)))
      setReady(true)
    })
    return () => { active = false }
  }, [key])

  const update = useCallback((next) => {
    setValue((previous) => {
      const resolved = typeof next === 'function' ? next(previous) : next
      request('state/write', { key, value: resolved }).then(() => notifyStateChanged(key))
        .catch((cause) => { setError(cause instanceof Error ? cause : new Error(String(cause))) })
      return resolved
    })
  }, [key])

  return [value, update, { ready, error }]
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
        if (args.path.startsWith('data:')) return { path: args.path, external: true }
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

export async function buildArtifact(version: ArtifactVersion, distPath: string): Promise<ArtifactBuildResult> {
  const contractDiagnostics = stateContractDiagnostics(version)
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
      footer: {
        js: `const postGenuiReady = () => {
  const root = document.getElementById('root')
  parent.postMessage({ source: 'dsh-genui', type: 'ready', artifactId: root?.dataset.artifactId, versionId: root?.dataset.versionId }, '*')
}
addEventListener('message', (event) => {
  const root = document.getElementById('root')
  if (event.source === parent && event.data?.source === 'dsh-genui' && event.data?.type === 'ready-request'
    && event.data?.artifactId === root?.dataset.artifactId && event.data?.versionId === root?.dataset.versionId) postGenuiReady()
})
requestAnimationFrame(() => requestAnimationFrame(postGenuiReady))`,
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
