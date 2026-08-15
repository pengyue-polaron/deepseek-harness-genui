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
    expect(bundle).toContain('inFlightRequests')
  })

  it('rejects imports outside the artifact allowlist', async () => {
    const result = await buildArtifact(version(`import fs from 'node:fs'; console.log(fs)`), await dist())
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map(item => item.text).join('\n')).toContain('not allowed')
  })

  it('returns parse diagnostics instead of throwing', async () => {
    const result = await buildArtifact(version('const broken = ('), await dist())
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some(item => item.severity === 'error')).toBe(true)
  })
})
