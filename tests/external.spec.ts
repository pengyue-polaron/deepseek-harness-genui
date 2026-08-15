import { describe, expect, it } from 'vitest'
import { buildExternalHeaders, EXTERNAL_USER_AGENT, requestExternal } from '../src/runtime/external.ts'

describe('external API proxy', () => {
  it('identifies Harness requests without accepting an app-supplied user agent', () => {
    expect(buildExternalHeaders({
      url: 'https://api.github.com/search/repositories',
      method: 'GET',
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'untrusted-app' },
    })).toEqual({
      accept: 'application/vnd.github+json',
      'user-agent': EXTERNAL_USER_AGENT,
    })
  })

  it('rejects local and credential-bearing destinations before connecting', async () => {
    await expect(requestExternal({ url: 'https://localhost/private', method: 'GET' }, AbortSignal.timeout(1000)))
      .rejects.toThrow('public HTTPS hostname')
    await expect(requestExternal({ url: 'https://secret@example.com/data', method: 'GET' }, AbortSignal.timeout(1000)))
      .rejects.toThrow('credential-free HTTPS URL')
  })
})
