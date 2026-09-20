import { spawn } from 'node:child_process'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The 0.1.5 host no longer publishes dsh-client-runtime. Test the shipped
// server entry independently of the legacy client build's dependency matrix.
const hostVersion = '0.1.5-rc.2'
const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const directory = await mkdtemp(join(tmpdir(), 'genui-host-import-'))

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: directory, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} failed (${signal ?? `exit ${code}`})`))
    })
  })
}

try {
  await copyFile(new URL('lib/index.js', root), join(directory, 'index.js'))
  await writeFile(join(directory, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    dependencies: {
      ...manifest.dependencies,
      '@deepseek-ai/dsh-llm': hostVersion,
      '@deepseek-ai/dsh-session': hostVersion,
      '@deepseek-ai/dsh-settings': hostVersion,
      '@deepseek-ai/dsh-tools': hostVersion,
    },
  }))
  await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'])
  await run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const llm = await import('@deepseek-ai/dsh-llm');
    assert.equal('CallId' in llm, false);
    assert.equal(typeof llm.ToolCallId, 'function');
    const plugin = await import('./index.js');
    assert.equal(plugin.name, 'genui');
    assert.equal(typeof plugin.apply, 'function');
    console.log('Shipped GenUI entry loads with Harness ${hostVersion}');
  `])
} finally {
  await rm(directory, { recursive: true, force: true })
}
