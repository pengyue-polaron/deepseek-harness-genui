import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const supportedVersions = new Set(['0.1.0-rc.7', '0.1.0-rc.8', '0.1.1-rc.1', '0.1.1-rc.2'])
const hostVersion = process.argv[2]
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
  'tests',
  'scripts',
]

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: temporaryProject,
      env: { ...process.env, CI: 'true' },
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
      manifest.devDependencies[dependency] = hostVersion
    }
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  console.log(`Verifying dsh-plugin-genui with DeepSeek Harness ${hostVersion} in ${temporaryProject}`)
  await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['install', '--no-frozen-lockfile'])
  await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'typecheck'])
  await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['test'])
  await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'build'])
  await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'verify:bundle'])
  await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'prepare:bundle'])
  await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'verify:clean-install'])
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
