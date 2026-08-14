import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'

const MAX_RESPONSE_BYTES = 1024 * 1024
const SAFE_REQUEST_HEADERS = new Set(['accept', 'content-type'])

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase()
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd')
    || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true
  if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7))
  if (isIP(address) !== 4) return false
  const parts = address.split('.').map(Number)
  const [a = 0, b = 0] = parts
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19))
}

async function publicAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || isIP(hostname) !== 0) {
    throw new Error('external requests require a public HTTPS hostname')
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some(item => isPrivateAddress(item.address))) {
    throw new Error('external hostname does not resolve exclusively to public addresses')
  }
  const selected = addresses[0]
  if (selected === undefined || (selected.family !== 4 && selected.family !== 6)) throw new Error('external hostname could not be resolved')
  return { address: selected.address, family: selected.family }
}

export interface ExternalRequestInput {
  url: string
  method: string
  headers?: Record<string, unknown>
  body?: unknown
}

export interface ExternalResponse {
  status: number
  headers: Record<string, string>
  body: unknown
}

export async function requestExternal(input: ExternalRequestInput, signal: AbortSignal): Promise<ExternalResponse> {
  const url = new URL(input.url)
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hash !== '') {
    throw new Error('external requests require a credential-free HTTPS URL')
  }
  const resolved = await publicAddress(url.hostname)
  const headers: Record<string, string> = { accept: 'application/json, text/plain;q=0.9, */*;q=0.5' }
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    const normalized = name.toLowerCase()
    if (!SAFE_REQUEST_HEADERS.has(normalized) || typeof value !== 'string') continue
    headers[normalized] = value
  }
  let payload: string | undefined
  if (input.body !== undefined) {
    if (typeof input.body === 'string') payload = input.body
    else {
      payload = JSON.stringify(input.body)
      headers['content-type'] ??= 'application/json'
    }
    if (Buffer.byteLength(payload) > 256 * 1024) throw new Error('external request body is too large')
    headers['content-length'] = String(Buffer.byteLength(payload))
  }

  return new Promise<ExternalResponse>((resolve, reject) => {
    const req = request({
      protocol: 'https:',
      hostname: resolved.address,
      family: resolved.family,
      port: url.port || 443,
      servername: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: input.method,
      headers: { host: url.host, ...headers },
      signal,
    }, response => {
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buffer.length
        if (size > MAX_RESPONSE_BYTES) {
          req.destroy(new Error('external response is too large'))
          return
        }
        chunks.push(buffer)
      })
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        const contentType = String(response.headers['content-type'] ?? '')
        let responseBody: unknown = text
        if (contentType.includes('application/json')) {
          try { responseBody = JSON.parse(text) as unknown } catch { responseBody = text }
        }
        const responseHeaders: Record<string, string> = {}
        for (const name of ['content-type', 'etag', 'last-modified', 'cache-control']) {
          const value = response.headers[name]
          if (typeof value === 'string') responseHeaders[name] = value
        }
        resolve({ status: response.statusCode ?? 502, headers: responseHeaders, body: responseBody })
      })
    })
    req.on('error', reject)
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}
