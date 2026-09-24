import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pinnedHostOverrides } from './host-dependencies.mjs'

const supportedVersions = new Set(['0.1.0-rc.7', '0.1.0-rc.8', '0.1.1-rc.1', '0.1.1-rc.2', '0.1.5-rc.3', '0.1.7-rc.1'])
const hostVersion = process.argv[2]
const modern = hostVersion === '0.1.5-rc.3' || hostVersion === '0.1.7-rc.1'
if (!hostVersion || !supportedVersions.has(hostVersion)) {
  console.error(`Usage: pnpm run verify:host-compat <${[...supportedVersions].join('|')}>`)
  process.exit(2)
}

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-plugin-genui-host-compat-'))
const temporaryProject = join(temporaryRoot, 'project')
const projectEntries = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'tsconfig.vitest.json',
  'tsdown.config.ts',
  'vitest.config.ts',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'README.md',
  'README.zh-CN.md',
  'SECURITY.md',
  'cordis.patch.yml',
  'docs',
  'examples',
  'src',
  'lib',
  'tests',
  'scripts',
]

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: temporaryProject,
      env: { ...process.env, CI: 'true', GENUI_HOST_VERSION: hostVersion },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? `exit ${code}`})`))
    })
  })

try {
  await mkdir(temporaryProject)
  await Promise.all(
    projectEntries.map(entry =>
      cp(join(projectRoot, entry), join(temporaryProject, entry), { recursive: true }),
    ),
  )

  const manifestPath = join(temporaryProject, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  for (const dependency of Object.keys(manifest.devDependencies ?? {})) {
    if (dependency === '@deepseek-ai/dsh' || dependency.startsWith('@deepseek-ai/dsh-')) {
      // Removed upstream; retained only to compile the legacy client type import.
      manifest.devDependencies[dependency] = modern && dependency === '@deepseek-ai/dsh-client-runtime'
        ? '0.1.1-rc.2' : hostVersion
    }
  }
  if (modern) {
    // Upstream packages have stable >=0.1.5 peer ranges while the tested host
    // is a prerelease. Pin the real host dependency graph in this fixture only.
    const overrides = await pinnedHostOverrides(hostVersion, Object.keys(manifest.devDependencies))
    const workspacePath = join(temporaryProject, 'pnpm-workspace.yaml')
    await writeFile(workspacePath, `${await readFile(workspacePath, 'utf8')}\noverrides:\n${Object.entries(overrides).map(([name, version]) => `  '${name}': '${version}'`).join('\n')}\n`)
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  console.log(`Verifying dsh-plugin-genui with DeepSeek Harness ${hostVersion} in ${temporaryProject}`)
  await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['install', '--no-frozen-lockfile'])
  // Load the shipped bundle before rebuilding against the target host's types.
  // This catches removed runtime exports even when a fresh build would pass.
  await run(process.execPath, ['--input-type=module', '-e', "await import('./lib/index.js')"])
  await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'typecheck'])
  await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', modern
    ? ['exec', 'vitest', 'run', '--exclude', 'tests/legacy-bridge.e2e.spec.ts'] : ['test'])
  // Exercise the shipped baseline build in the real modern host. A rebuild
  // against modern types must not mask a consumer-facing compatibility error.
  if (modern) {
    await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'prepare:bundle'])
    await run(process.execPath, ['scripts/verify-modern-web.mjs'])
  }
  await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'build'])
  await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'verify:bundle'])
  await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'prepare:bundle'])
  if (!modern) await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'verify:clean-install'])
} finally {
  if (process.env.GENUI_KEEP_HOST_FIXTURE === '1') console.log(`Retained host fixture: ${temporaryProject}`)
  else await rm(temporaryRoot, { recursive: true, force: true })
}
