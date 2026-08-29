import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ArtifactRegistry as OldArtifactRegistry, buildArtifact as buildOldArtifact } from 'dsh-plugin-genui-v0132'
import { ArtifactRegistry } from '../lib/index.js'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
const tarball = resolve(projectRoot, 'dist', `${manifest.name}-${manifest.version}.tgz`)
const dshBinary = join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
await access(tarball)
await access(dshBinary)

const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-plugin-genui-upgrade-'))
const dshHome = join(temporaryRoot, 'dsh')
const workspaceRoot = join(temporaryRoot, 'workspace')
const artifactRoot = join(workspaceRoot, '.dsh', 'genui')
const environment = {
  ...process.env,
  CI: 'true',
  DSH_HOME: dshHome,
  DSH_TELEMETRY_MODE: 'DISABLED',
  XDG_CACHE_HOME: join(temporaryRoot, 'cache'),
}

function run(command, args, { capture = false, timeoutMs = 180_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    let output = ''
    let settled = false
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: environment,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    const onData = chunk => { output += String(chunk) }
    if (capture) {
      child.stdout?.on('data', onData)
      child.stderr?.on('data', onData)
    }
    const finish = error => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) reject(error)
      else resolvePromise(output)
    }
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      finish(new Error(`${command} ${args.join(' ')} timed out after ${timeoutMs}ms\n${output}`))
    }, timeoutMs)
    child.once('error', finish)
    child.once('exit', (code, signal) => {
      if (code === 0) finish()
      else finish(new Error(`${command} ${args.join(' ')} failed (${signal ?? `exit ${code}`})\n${output}`))
    })
  })
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise(resolvePromise => {
    const timeout = setTimeout(() => {
      child.off('exit', exited)
      resolvePromise(false)
    }, timeoutMs)
    const exited = () => {
      clearTimeout(timeout)
      resolvePromise(true)
    }
    child.once('exit', exited)
  })
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGINT')
  if (await waitForExit(child, 2_000)) return
  child.kill('SIGTERM')
  if (await waitForExit(child, 2_000)) return
  child.kill('SIGKILL')
  await waitForExit(child, 2_000)
}

async function startWeb() {
  const child = spawn(dshBinary, ['--profile', 'web', '--host', '127.0.0.1', '--port', '0'], {
    cwd: workspaceRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  try {
    const origin = await new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => finish(new Error(`upgraded Web host did not start within 15 seconds\n${output}`)), 15_000)
      const onData = chunk => {
        output += String(chunk)
        const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/)
        if (match?.[1]) finish(undefined, match[1])
      }
      const onError = error => finish(error)
      const onExit = (code, signal) => finish(new Error(`upgraded Web host exited before listening (${signal ?? `exit ${code}`})\n${output}`))
      const finish = (error, value) => {
        clearTimeout(timeout)
        child.stdout?.off('data', onData)
        child.stderr?.off('data', onData)
        child.off('error', onError)
        child.off('exit', onExit)
        if (error) reject(error)
        else resolvePromise(value)
      }
      child.stdout?.on('data', onData)
      child.stderr?.on('data', onData)
      child.once('error', onError)
      child.once('exit', onExit)
    })
    return { child, origin }
  } catch (error) {
    await stopChild(child)
    throw error
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

const sessionId = 'upgrade-session'
const artifactId = `s-${createHash('sha256').update(sessionId).digest('hex').slice(0, 12)}-upgrade-artifact`
const capability = {
  id: 'calendar-read',
  kind: 'tool',
  label: 'Calendar availability',
  reason: 'Read test availability for the saved route.',
  access: 'read',
  tool: 'mcp__calendar__availability',
}
const savedState = {
  route: 'scenic',
  passengers: 3,
  nested: { seats: ['A1', 'A2'] },
}

try {
  await mkdir(workspaceRoot)
  await run(dshBinary, ['plugin', '--profile', 'web', 'add', 'dsh-plugin-genui@0.13.2', '--save-exact', '--allow-build=esbuild'])
  const profileRoot = join(dshHome, 'profiles', 'web')
  const oldInstalled = JSON.parse(await readFile(join(profileRoot, 'node_modules', manifest.name, 'package.json'), 'utf8'))
  expect(oldInstalled.version === '0.13.2', `upgrade fixture installed ${oldInstalled.version}; expected 0.13.2`)

  const oldRegistry = new OldArtifactRegistry(artifactRoot, 1024 * 1024)
  await oldRegistry.init()
  const first = await oldRegistry.create({
    id: artifactId,
    title: 'Upgrade journey',
    summary: 'A v0.13.2 artifact used by the release compatibility gate.',
    requirements: ['Keep a route and passenger count across the upgrade.'],
    capabilities: [capability],
    files: [{
      path: 'src/main.tsx',
      content: `import React from 'react'\nimport { createRoot } from 'react-dom/client'\nimport { useArtifactState } from '@dsh-genui/sdk'\nfunction App(){const [route,setRoute]=useArtifactState('route','direct');return <button data-genui-primary-action onClick={()=>setRoute('scenic')}>{route}</button>}\ncreateRoot(document.getElementById('root')!).render(<App />)`,
    }],
  })
  const firstBuild = await buildOldArtifact(first, oldRegistry.distPath(artifactId, first.id))
  expect(firstBuild.ok, `v0.13.2 fixture build failed: ${JSON.stringify(firstBuild.diagnostics)}`)
  await oldRegistry.settle(artifactId, first.id, {
    checkedAt: new Date().toISOString(), build: 'passed', browser: 'passed', diagnostics: [], notes: ['v0.13.2 upgrade fixture'],
  })
  const second = await oldRegistry.update({
    id: artifactId,
    baseVersionId: first.id,
    summary: 'Add the passenger count while retaining the same app.',
    patches: [{
      path: 'src/main.tsx',
      content: `import React from 'react'\nimport { createRoot } from 'react-dom/client'\nimport { useArtifactState } from '@dsh-genui/sdk'\nfunction App(){const [route,setRoute]=useArtifactState('route','direct');const [passengers]=useArtifactState('passengers',1);return <button data-genui-primary-action onClick={()=>setRoute('scenic')}>{route}: {passengers}</button>}\ncreateRoot(document.getElementById('root')!).render(<App />)`,
    }],
  })
  const secondBuild = await buildOldArtifact(second, oldRegistry.distPath(artifactId, second.id))
  expect(secondBuild.ok, `v0.13.2 update build failed: ${JSON.stringify(secondBuild.diagnostics)}`)
  const ready = await oldRegistry.settle(artifactId, second.id, {
    checkedAt: new Date().toISOString(), build: 'passed', browser: 'passed', diagnostics: [], notes: ['v0.13.2 upgrade fixture update'],
  })
  await oldRegistry.updateState(artifactId, sessionId, () => savedState)
  const now = new Date()
  const fingerprint = createHash('sha256').update(JSON.stringify(ready.capabilities[0])).digest('base64url')
  await oldRegistry.grantCapability(artifactId, sessionId, capability.id, {
    fingerprint,
    grantedAt: now.toISOString(),
    expiresAt: new Date(now.valueOf() + 60 * 60 * 1000).toISOString(),
  })

  const recordPath = join(artifactRoot, artifactId, 'artifact.json')
  const firstVersionPath = join(artifactRoot, artifactId, 'versions', first.id, 'version.json')
  const secondVersionPath = join(artifactRoot, artifactId, 'versions', second.id, 'version.json')
  const firstAppPath = join(oldRegistry.distPath(artifactId, first.id), 'app.js')
  const firstMapPath = join(oldRegistry.distPath(artifactId, first.id), 'app.js.map')
  const secondAppPath = join(oldRegistry.distPath(artifactId, second.id), 'app.js')
  const secondMapPath = join(oldRegistry.distPath(artifactId, second.id), 'app.js.map')
  const oldRecordBytes = await readFile(recordPath, 'utf8')
  const oldFirstVersionBytes = await readFile(firstVersionPath, 'utf8')
  const oldSecondVersionBytes = await readFile(secondVersionPath, 'utf8')
  const oldFirstAppBytes = await readFile(firstAppPath)
  const oldFirstMapBytes = await readFile(firstMapPath)
  const oldSecondAppBytes = await readFile(secondAppPath)
  const oldSecondMapBytes = await readFile(secondMapPath)
  const oldSecondAppHash = createHash('sha256').update(oldSecondAppBytes).digest('hex')
  const oldSecondMapHash = createHash('sha256').update(oldSecondMapBytes).digest('hex')
  expect(!Object.hasOwn(JSON.parse(oldRecordBytes), 'schemaVersion'), 'v0.13.2 fixture unexpectedly has the new schema marker')

  await run(dshBinary, ['plugin', '--profile', 'web', 'add', tarball, '--save-exact', '--allow-build=esbuild'])
  const upgradedInstalled = JSON.parse(await readFile(join(profileRoot, 'node_modules', manifest.name, 'package.json'), 'utf8'))
  expect(upgradedInstalled.version === manifest.version, `profile upgraded to ${upgradedInstalled.version}; expected ${manifest.version}`)
  await run('pnpm', ['--dir', profileRoot, 'peers', 'check'])
  const dependencyTree = await run('pnpm', ['--dir', profileRoot, 'list', '--prod', '--depth', 'Infinity', '--json'], { capture: true })
  expect(!/playwright|puppeteer|chromium|chromedriver|selenium/i.test(dependencyTree), 'upgraded production tree contains a browser runtime')

  const web = await startWeb()
  try {
    const discovery = await fetch(`${web.origin}/.well-known/dsh-genui`, { signal: AbortSignal.timeout(5_000) })
    expect(discovery.ok, `upgraded discovery endpoint returned ${discovery.status}`)
    const app = await fetch(`${web.origin}/genui/app/${artifactId}?lang=en`, { signal: AbortSignal.timeout(5_000) })
    const appHtml = await app.text()
    expect(app.ok && appHtml.includes(`data-version-id="${second.id}"`), 'upgraded host did not select the v0.13.2 current version')
    const preview = await fetch(`${web.origin}/genui/preview/${artifactId}/${second.id}?lang=en`, { signal: AbortSignal.timeout(5_000) })
    expect(preview.ok, `upgraded preview returned ${preview.status}`)
    const appAsset = await fetch(`${web.origin}/genui/assets/${artifactId}/${second.id}/app.js`, { signal: AbortSignal.timeout(5_000) })
    const servedAppBytes = Buffer.from(await appAsset.arrayBuffer())
    expect(appAsset.ok && servedAppBytes.equals(oldSecondAppBytes), `upgraded host changed the v0.13.2 app.js bytes (expected sha256 ${oldSecondAppHash})`)
    const mapAsset = await fetch(`${web.origin}/genui/assets/${artifactId}/${second.id}/app.js.map`, { signal: AbortSignal.timeout(5_000) })
    const servedMapBytes = Buffer.from(await mapAsset.arrayBuffer())
    expect(mapAsset.ok && servedMapBytes.equals(oldSecondMapBytes), `upgraded host changed the v0.13.2 app.js.map bytes (expected sha256 ${oldSecondMapHash})`)
  } finally {
    await stopChild(web.child)
  }

  const registry = new ArtifactRegistry(artifactRoot, 1024 * 1024)
  await registry.init()
  const record = await registry.get(artifactId)
  const current = await registry.getVersion(artifactId)
  expect(record.schemaVersion === 1 && current.schemaVersion === 1, 'legacy records were not accepted as schema version 1')
  expect(record.currentVersionId === second.id && record.latestVersionId === second.id, 'current/latest version references changed during upgrade')
  expect(JSON.stringify(record.versions) === JSON.stringify([first.id, second.id]), 'version history changed during upgrade')
  expect(JSON.stringify((await registry.readState(artifactId, sessionId))?.values) === JSON.stringify(savedState), 'saved semantic state changed during upgrade')
  expect((await registry.readGrants(artifactId, sessionId))[capability.id]?.fingerprint === fingerprint, 'saved grant changed during upgrade')
  expect(await readFile(recordPath, 'utf8') === oldRecordBytes, 'read-only compatibility checks rewrote the legacy record')
  expect(await readFile(firstVersionPath, 'utf8') === oldFirstVersionBytes, 'first legacy version bytes changed during upgrade')
  expect(await readFile(secondVersionPath, 'utf8') === oldSecondVersionBytes, 'current legacy version bytes changed during upgrade')
  expect((await readFile(firstAppPath)).equals(oldFirstAppBytes), 'read-only compatibility checks changed the first legacy app.js')
  expect((await readFile(firstMapPath)).equals(oldFirstMapBytes), 'read-only compatibility checks changed the first legacy app.js.map')
  expect((await readFile(secondAppPath)).equals(oldSecondAppBytes), 'read-only compatibility checks changed the current legacy app.js')
  expect((await readFile(secondMapPath)).equals(oldSecondMapBytes), 'read-only compatibility checks changed the current legacy app.js.map')

  await registry.updateState(artifactId, sessionId, values => ({ ...values, confirmed: true }))
  const migrated = JSON.parse(await readFile(recordPath, 'utf8'))
  expect(migrated.schemaVersion === 1, 'the first v0.14 write did not persist schema version 1')
  expect(migrated.currentVersionId === second.id && migrated.latestVersionId === second.id, 'migration write changed version references')
  expect(migrated.states[sessionId].values.confirmed === true && migrated.states[sessionId].values.nested.seats[1] === 'A2', 'migration write lost nested state')
  expect(migrated.grants[sessionId][capability.id].fingerprint === fingerprint, 'migration write lost the existing grant')
  expect(await readFile(firstVersionPath, 'utf8') === oldFirstVersionBytes, 'migration write changed an old version file')
  expect(await readFile(secondVersionPath, 'utf8') === oldSecondVersionBytes, 'migration write changed the current old version file')
  expect((await readFile(firstAppPath)).equals(oldFirstAppBytes), 'migration write changed the first legacy app.js')
  expect((await readFile(firstMapPath)).equals(oldFirstMapBytes), 'migration write changed the first legacy app.js.map')
  expect((await readFile(secondAppPath)).equals(oldSecondAppBytes), 'migration write changed the current legacy app.js')
  expect((await readFile(secondMapPath)).equals(oldSecondMapBytes), 'migration write changed the current legacy app.js.map')

  console.log(`Upgrade verified: dsh-plugin-genui@0.13.2 -> ${manifest.version}; prefixed apps, compiled bytes, state, grants, and version history preserved; no Chrome runtime dependency.`)
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
