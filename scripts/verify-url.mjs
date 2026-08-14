import { verifyArtifactInBrowser } from '../lib/index.js'

const url = process.argv[2]
if (url === undefined) throw new Error('usage: node scripts/verify-url.mjs <preview-url>')
const result = await verifyArtifactInBrowser(url)
console.log(JSON.stringify(result, null, 2))
if (!result.ok) process.exitCode = 1
