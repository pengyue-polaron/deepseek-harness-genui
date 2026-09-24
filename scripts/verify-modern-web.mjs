import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, rename, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const cli = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
const directory = await mkdtemp(join(tmpdir(), 'genui-modern-web-'))
const workspace = join(directory, 'workspace')
const env = { ...process.env, CI: 'true', DSH_HOME: join(directory, 'home'), DSH_TELEMETRY_MODE: 'DISABLED' }
const tarball = join(root, 'dist', `${manifest.name}-${manifest.version}.tgz`)
let host
let browser
let page
let hiddenRuntime = false
const legacyRuntime = join(root, 'node_modules', '@deepseek-ai', 'dsh-client-runtime')

async function run(args, command = cli) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: workspace, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed: ${signal ?? code}`)))
  })
}

async function stop(child) {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL']) {
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill(signal)
    await new Promise(resolve => {
      const timer = setTimeout(done, 2_000)
      function done() { clearTimeout(timer); child.off('exit', done); resolve() }
      child.once('exit', done)
    })
  }
}

try {
  if (process.env.GENUI_HOST_VERSION === '0.1.7-rc.1') {
    const requireHost = createRequire(await realpath(join(root, 'node_modules/@deepseek-ai/dsh/package.json')))
    const { evaluatePluginCompatibility } = await import(pathToFileURL(requireHost.resolve('@deepseek-ai/dsh-app-boot')).href)
    // Exercise the host's gate, including optional peers, without fixture overrides.
    const previous = JSON.parse(await readFile(join(root, 'node_modules/dsh-plugin-genui-v0142/package.json'), 'utf8'))
    assert.ok(evaluatePluginCompatibility(previous, {}, '0.1.7-rc.1'), 'Previous release must reproduce issue #14')
    assert.equal(evaluatePluginCompatibility(manifest, {}, '0.1.7-rc.1'), undefined, 'Release must pass the real host gate without exemptions')
  }
  await access(tarball)
  await mkdir(workspace)
  await run(['plugin', '--profile', 'web', 'add', tarball, '--save-exact'])
  const installedRoot = join(env.DSH_HOME, 'profiles', 'web', 'node_modules', manifest.name)
  assert.equal(JSON.parse(await readFile(join(installedRoot, 'package.json'), 'utf8')).version, manifest.version)
  await Promise.all(['LICENSE', 'CHANGELOG.md', 'cordis.patch.yml'].map(file => access(join(installedRoot, file))))
  await run(['--dir', dirname(dirname(installedRoot)), 'peers', 'check'], process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')

  // This package exists only for legacy type imports in the fixture. The real
  // host must load the shipped client without relying on its root link.
  await rename(legacyRuntime, `${legacyRuntime}.type-only`)
  hiddenRuntime = true
  host = spawn(cli, ['web', '--no-open', '--host', '127.0.0.1', '--port', '0'], {
    cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const address = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Modern Web startup timed out\n${output}`)), 30_000)
    function finish(error, url) {
      clearTimeout(timeout)
      host.stdout.off('data', onData)
      host.stderr.off('data', onData)
      host.off('error', onError)
      host.off('exit', onExit)
      if (error) reject(error)
      else resolve(url)
    }
    function onData(chunk) {
      output += String(chunk)
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+[^\s\x1b]*/)?.[0]
      if (url) finish(undefined, url)
    }
    function onError(error) { finish(error) }
    function onExit(code) { finish(new Error(`Modern Web exited (${code})\n${output}`)) }
    host.stdout.on('data', onData)
    host.stderr.on('data', onData)
    host.once('error', onError)
    host.once('exit', onExit)
  })
  // Drain output for the lifetime of the child even after startup.
  host.stdout.resume()
  host.stderr.resume()
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ locale: 'en-US' })
  page.setDefaultTimeout(15_000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(address)
  // The first-run flow has no model credentials; this smoke test does not use inference.
  await page.getByRole('button', { name: /^(Continue|继续)$/ }).click()
  await page.getByRole('button', { name: /^(Configure later|稍后配置)$/ }).click()
  await page.getByRole('button', { name: /Settings|设置/ }).first().click()
  await page.getByRole('button', { name: process.env.GENUI_HOST_VERSION === '0.1.7-rc.1' ? /Built-in plugins|内置插件/ : /Plugins|插件/ }).first().click()
  if (process.env.GENUI_HOST_VERSION === '0.1.7-rc.1') {
    await page.getByRole('tab', { name: /Generated app design|生成应用的风格/ }).click()
  }
  const card = page.locator('.dsh-genui-design-card')
  await card.waitFor({ state: 'visible' })
  await card.locator('.dsh-genui-design-head').click()
  const select = card.locator('select[name="genui-default-design"]')
  await select.selectOption('material-3')
  await page.waitForFunction(() => document.querySelector('.dsh-genui-design-card [role="status"]')?.textContent?.match(/saved|已保存/i))
  await page.reload()
  await page.getByRole('button', { name: /^(Configure later|稍后配置)$/ }).click()
  await page.getByRole('button', { name: /Settings|设置/ }).first().click()
  await page.getByRole('button', { name: process.env.GENUI_HOST_VERSION === '0.1.7-rc.1' ? /Built-in plugins|内置插件/ : /Plugins|插件/ }).first().click()
  if (process.env.GENUI_HOST_VERSION === '0.1.7-rc.1') {
    await page.getByRole('tab', { name: /Generated app design|生成应用的风格/ }).click()
  }
  await card.waitFor({ state: 'visible' })
  await card.locator('.dsh-genui-design-head').click()
  assert.equal(await select.inputValue(), 'material-3')
  const discovery = await page.request.get(new URL('/.well-known/dsh-genui', address).href)
  assert.equal(discovery.status(), 200)
  assert.deepEqual(await discovery.json(), { route_prefix: '/genui' })
  const designs = await page.request.get(new URL('/genui/manage/designs', address).href)
  assert.equal(designs.status(), 200)
  assert.equal((await designs.json()).default_design_id, 'material-3')
  assert.deepEqual(errors, [], 'Modern Web frontend reported errors')
  console.log(`Modern Harness ${process.env.GENUI_HOST_VERSION}: packed plugin installation, Web startup, settings rendering, saved design after reload, and endpoints passed.`)
} catch (error) {
  if (page) console.error('Modern Web page at failure:', (await page.locator('body').innerText().catch(() => '')).slice(0,6000))
  throw error
} finally {
  try {
    await browser?.close()
  } finally {
    if (host) await stop(host)
    if (hiddenRuntime) await rename(`${legacyRuntime}.type-only`, legacyRuntime)
    await rm(directory, { recursive: true, force: true })
  }
}
