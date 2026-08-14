import { access, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const root = new URL('..', import.meta.url)
const required = ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'lib/invariant.js']
await Promise.all(required.map(path => access(new URL(path, root))))
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
if (manifest.name !== 'dsh-plugin-genui' || manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
  throw new Error('plugin package metadata is incomplete')
}

const dist = new URL('../dist/', import.meta.url)
await mkdir(dist, { recursive: true })
for (const entry of await readdir(dist)) {
  if (/^dsh-plugin-genui-.*\.tgz$/.test(entry)) await rm(new URL(entry, dist))
}
const child = spawn('pnpm', ['pack', '--pack-destination', 'dist'], { cwd: new URL('..', import.meta.url), stdio: 'inherit' })
const code = await new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('exit', resolve)
})
if (code !== 0) process.exit(typeof code === 'number' ? code : 1)
