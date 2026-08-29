import { access, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const distRoot = join(projectRoot, 'dist')
const manifest = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
const expectedTarball = `${manifest.name}-${manifest.version}.tgz`
const tarball = resolve(distRoot, expectedTarball)
const dshBinary = join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
await access(tarball)
await access(dshBinary)

const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-plugin-genui-clean-install-'))
const dshHome = join(temporaryRoot, 'dsh')
const environment = {
  ...process.env,
  CI: 'true',
  DSH_HOME: dshHome,
  DSH_TELEMETRY_MODE: 'DISABLED',
  XDG_CACHE_HOME: join(temporaryRoot, 'cache'),
}

function run(command, args, capture = false) {
  return new Promise((resolvePromise, reject) => {
    let output = ''
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: environment,
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    })
    if (capture) child.stdout?.on('data', chunk => { output += String(chunk) })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise(output)
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? `exit ${code}`})`))
    })
  })
}

function runResult(command, args, timeoutMs = 15_000) {
  return new Promise((resolvePromise, reject) => {
    let output = ''
    let timedOut = false
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const onData = chunk => { output += String(chunk) }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)
    child.once('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      resolvePromise({ code, signal, output, timedOut })
    })
  })
}

function workspaceAllowsBuild(workspaceSource, packageName) {
  const lines = workspaceSource.split(/\r?\n/)
  let sectionIndent = null
  for (const line of lines) {
    const content = line.replace(/\s+#.*$/, '')
    if (!content.trim()) continue
    const indent = content.length - content.trimStart().length
    if (sectionIndent === null) {
      if (/^allowBuilds:\s*$/.test(content.trim())) sectionIndent = indent
      continue
    }
    if (indent <= sectionIndent) return false
    const entry = content.trim().match(/^([^:]+):\s*(true|false)\s*$/)
    if (entry?.[1] === packageName) return entry[2] === 'true'
  }
  return false
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
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

async function startWeb(workspaceRoot) {
  const child = spawn(dshBinary, ['--profile', 'web', '--host', '127.0.0.1', '--port', '0'], {
    cwd: workspaceRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  try {
    const origin = await new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => finish(new Error(`clean Web host did not start within 15 seconds\n${output}`)), 15_000)
      const onData = chunk => {
        output += String(chunk)
        const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/)
        if (match?.[1]) finish(undefined, match[1])
      }
      const onError = error => finish(error)
      const onExit = (code, signal) => finish(new Error(`clean Web host exited before listening (${signal ?? `exit ${code}`})\n${output}`))
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

try {
  await run(dshBinary, ['plugin', '--profile', 'web', 'add', tarball, '--save-exact', '--allow-build=esbuild'])
  const profileRoot = join(dshHome, 'profiles', 'web')
  const profileWorkspace = await readFile(join(profileRoot, 'pnpm-workspace.yaml'), 'utf8')
  if (!workspaceAllowsBuild(profileWorkspace, 'esbuild')) {
    throw new Error('clean profile did not persist allowBuilds.esbuild=true')
  }
  const installedManifestPath = join(profileRoot, 'node_modules', manifest.name, 'package.json')
  const installedManifest = JSON.parse(await readFile(installedManifestPath, 'utf8'))
  if (installedManifest.version !== manifest.version) {
    throw new Error(`installed ${manifest.name}@${installedManifest.version}; expected ${manifest.version}`)
  }
  const dependencyTree = await run('pnpm', ['--dir', profileRoot, 'list', '--prod', '--depth', 'Infinity', '--json'], true)
  const forbiddenBrowserRuntime = /playwright|puppeteer|chromium|chromedriver|selenium/i
  if (forbiddenBrowserRuntime.test(dependencyTree)) {
    throw new Error('production dependency tree unexpectedly contains a browser automation/runtime package')
  }
  await run('pnpm', ['--dir', profileRoot, 'peers', 'check'])
  const dumpedConfig = await run(dshBinary, ['--profile', 'web', '--dump-config'], true)
  if (!dumpedConfig.includes('name: dsh-plugin-genui')) {
    throw new Error('clean Web profile did not activate dsh-plugin-genui')
  }
  const packedFiles = await readdir(join(profileRoot, 'node_modules', manifest.name))
  if (!packedFiles.includes('CHANGELOG.md') || !packedFiles.includes('README.zh-CN.md')) {
    throw new Error('clean install is missing packaged release documentation')
  }
  await Promise.all([
    access(join(profileRoot, 'node_modules', manifest.name, 'src', 'index.ts')),
    access(join(profileRoot, 'node_modules', manifest.name, 'lib', 'types', 'index.d.ts.map')),
  ])
  const workspaceRoot = join(temporaryRoot, 'workspace')
  await mkdir(workspaceRoot)
  const web = await startWeb(workspaceRoot)
  try {
    const discoveryResponse = await fetch(`${web.origin}/.well-known/dsh-genui`, { signal: AbortSignal.timeout(5_000) })
    if (!discoveryResponse.ok || JSON.stringify(await discoveryResponse.json()) !== JSON.stringify({ route_prefix: '/genui' })) {
      throw new Error('clean Web host did not expose the GenUI discovery endpoint')
    }
    const designsResponse = await fetch(`${web.origin}/genui/manage/designs`, { signal: AbortSignal.timeout(5_000) })
    const designs = await designsResponse.json()
    if (!designsResponse.ok || !Array.isArray(designs.designs) || !Object.hasOwn(designs, 'default_design_id')) {
      throw new Error('clean Web host did not expose the GenUI design endpoint')
    }
  } finally {
    await stopChild(web.child)
  }
  await run(dshBinary, ['plugin', '--profile', 'web', 'remove', manifest.name])
  if (await pathExists(installedManifestPath)) {
    throw new Error('clean Web profile retained dsh-plugin-genui after removal')
  }
  const configAfterRemoval = await run(dshBinary, ['--profile', 'web', '--dump-config'], true)
  if (configAfterRemoval.includes('name: dsh-plugin-genui')) {
    throw new Error('clean Web profile still activates dsh-plugin-genui after removal')
  }
  for (const unsupportedProfile of ['tui', 'headless']) {
    await run(dshBinary, ['plugin', '--profile', unsupportedProfile, 'add', tarball, '--save-exact', '--allow-build=esbuild'])
    const activation = await runResult(dshBinary, [
      '--profile', unsupportedProfile,
      ...(unsupportedProfile === 'headless' ? ['activation probe'] : []),
    ])
    if (activation.timedOut || activation.code === 0
      || !activation.output.includes('pending (waiting for service: webServer)')) {
      throw new Error(`${unsupportedProfile} profile did not fail closed on the missing Web host (${activation.signal ?? `exit ${activation.code}`})\n${activation.output}`)
    }
  }
  console.log(`Clean install and removal verified: ${manifest.name}@${manifest.version}; TUI/headless fail closed; native esbuild approved; no Chrome runtime dependency.`)
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
