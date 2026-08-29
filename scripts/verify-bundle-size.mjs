import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const root = new URL('..', import.meta.url)
const kib = 1024
const budgets = [
  // v0.14's trusted preview/standalone broker deliberately lives in the host
  // entry. Keep its individual ceiling honest while retaining the tighter
  // aggregate budget below.
  { path: 'lib/index.js', raw: 152 * kib, gzip: 42 * kib },
  { path: 'lib/client.js', raw: 128 * kib, gzip: 30 * kib },
  { path: 'lib/invariant.js', raw: 4 * kib, gzip: 2 * kib },
]
const totalBudget = { raw: 260 * kib, gzip: 72 * kib }

const format = bytes => `${(bytes / kib).toFixed(1)} KiB`
const failures = []
let totalRaw = 0
let totalGzip = 0

for (const budget of budgets) {
  const contents = await readFile(new URL(budget.path, root))
  const raw = contents.byteLength
  const gzip = gzipSync(contents, { level: 9 }).byteLength
  totalRaw += raw
  totalGzip += gzip

  console.log(
    `${budget.path}: ${format(raw)} raw / ${format(gzip)} gzip ` +
      `(budgets ${format(budget.raw)} / ${format(budget.gzip)})`,
  )
  if (raw > budget.raw) failures.push(`${budget.path} raw size ${format(raw)} exceeds ${format(budget.raw)}`)
  if (gzip > budget.gzip) failures.push(`${budget.path} gzip size ${format(gzip)} exceeds ${format(budget.gzip)}`)
}

console.log(
  `total: ${format(totalRaw)} raw / ${format(totalGzip)} gzip ` +
    `(budgets ${format(totalBudget.raw)} / ${format(totalBudget.gzip)})`,
)
if (totalRaw > totalBudget.raw) failures.push(`total raw size ${format(totalRaw)} exceeds ${format(totalBudget.raw)}`)
if (totalGzip > totalBudget.gzip) failures.push(`total gzip size ${format(totalGzip)} exceeds ${format(totalBudget.gzip)}`)

if (failures.length > 0) {
  throw new Error(`Bundle size budget failed:\n- ${failures.join('\n- ')}`)
}
