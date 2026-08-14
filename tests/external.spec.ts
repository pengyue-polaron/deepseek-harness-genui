import { describe, expect, it } from 'vitest'
import { requestExternal } from '../src/runtime/external.ts'

describe('external API proxy', () => {
  it('rejects local and credential-bearing destinations before connecting', async () => {
    await expect(requestExternal({ url: 'https://localhost/private', method: 'GET' }, AbortSignal.timeout(1000)))
      .rejects.toThrow('public HTTPS hostname')
    await expect(requestExternal({ url: 'https://secret@example.com/data', method: 'GET' }, AbortSignal.timeout(1000)))
      .rejects.toThrow('credential-free HTTPS URL')
  })
})
