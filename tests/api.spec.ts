import { afterEach, describe, expect, it, vi } from 'vitest'
import { previewUrlForLocale, previewUrlWithBridgeNonce, readDesignSettings, reportRuntimeFailure, resolveReceiptAccess } from '../src/client/api.ts'
import type { GenuiMeta } from '../src/client/types.ts'

describe('client API discovery', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('retries management discovery after a transient failure', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error('temporary discovery failure'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ route_prefix: '/genui' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_design_id: null, designs: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetch)

    await expect(readDesignSettings()).rejects.toThrow('temporary discovery failure')
    await expect(readDesignSettings()).resolves.toEqual({
      default_design_id: null,
      designs: [],
      export_base: '/genui/manage/designs',
    })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('rewrites a preview URL to the server-selected fallback version', () => {
    vi.stubGlobal('window', { location: { href: 'http://127.0.0.1:3080/tasks', origin: 'http://127.0.0.1:3080' } })
    const meta: GenuiMeta = {
      artifactId: 'trip-plan',
      title: 'Trip plan',
      versionId: 'v-current',
      previewUrl: '/genui/preview/trip-plan/v-current?lang=en#token=secret',
    }

    expect(previewUrlForLocale(meta, 'zh', 'v-stable'))
      .toBe('http://127.0.0.1:3080/genui/preview/trip-plan/v-stable?lang=zh#token=bridge-v1')
    expect(previewUrlWithBridgeNonce(previewUrlForLocale(meta, 'zh', 'v-stable'), '12345678-1234-1234-1234-123456789abc'))
      .toBe('http://127.0.0.1:3080/genui/preview/trip-plan/v-stable?lang=zh#token=bridge-v1&bridge_nonce=12345678-1234-1234-1234-123456789abc')
  })

  it('hydrates a secret-free receipt from the same-origin host response', async () => {
    vi.stubGlobal('window', { location: { href: 'http://127.0.0.1:3080/tasks', origin: 'http://127.0.0.1:3080' } })
    const fetch = vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response(JSON.stringify(
      String(input) === '/.well-known/dsh-genui'
        ? { route_prefix: '/genui' }
        : {
            artifact_id: 's-123456789abc-trip-plan',
            title: 'Canonical trip plan',
            version_id: 'v-abcdefab-1234-5678-9abc-abcdefabcdef',
            preview_url: '/genui/preview/s-123456789abc-trip-plan/v-abcdefab-1234-5678-9abc-abcdefabcdef?lang=en#token=scoped.secret',
          },
    ), { status: 200, headers: { 'content-type': 'application/json' } })))
    vi.stubGlobal('fetch', fetch)
    const receipt: GenuiMeta = {
      artifactId: 's-123456789abc-trip-plan',
      title: 'Untrusted receipt title',
      versionId: 'v-12345678-1234-1234-1234-123456789abc',
    }

    await expect(resolveReceiptAccess(receipt, 'fixture-session')).resolves.toEqual({
      artifactId: receipt.artifactId,
      title: 'Canonical trip plan',
      versionId: 'v-abcdefab-1234-5678-9abc-abcdefabcdef',
      previewUrl: 'http://127.0.0.1:3080/genui/preview/s-123456789abc-trip-plan/v-abcdefab-1234-5678-9abc-abcdefabcdef?lang=en#token=scoped.secret',
    })
    expect(fetch).toHaveBeenCalledWith('/genui/host-control/preview-access', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        artifact_id: receipt.artifactId,
        version_id: receipt.versionId,
        session_id: 'fixture-session',
      }),
    }))
  })

  it('rejects a receipt access response that points outside the Harness origin', async () => {
    vi.stubGlobal('window', { location: { href: 'http://127.0.0.1:3080/tasks', origin: 'http://127.0.0.1:3080' } })
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response(JSON.stringify(
      String(input) === '/.well-known/dsh-genui'
        ? { route_prefix: '/genui' }
        : {
            artifact_id: 's-123456789abc-trip-plan',
            title: 'Trip plan',
            version_id: 'v-abcdefab-1234-5678-9abc-abcdefabcdef',
            preview_url: 'https://attacker.example/genui/preview/s-123456789abc-trip-plan/v-abcdefab-1234-5678-9abc-abcdefabcdef?lang=en#token=stolen',
          },
    ), { status: 200, headers: { 'content-type': 'application/json' } }))))

    await expect(resolveReceiptAccess({
      artifactId: 's-123456789abc-trip-plan',
      title: 'Trip plan',
      versionId: 'v-12345678-1234-1234-1234-123456789abc',
    }, 'fixture-session')).rejects.toThrow('preview access response is invalid')
  })

  it('rewrites the final preview route and carries the explicit Harness theme', () => {
    vi.stubGlobal('window', { location: { href: 'http://127.0.0.1:3080/tasks', origin: 'http://127.0.0.1:3080' } })
    const meta: GenuiMeta = {
      artifactId: 'trip-plan',
      title: 'Trip plan',
      versionId: 'v-current',
      previewUrl: '/tenant/preview/genui/preview/trip-plan/v-current?lang=en#token=secret',
    }

    expect(previewUrlForLocale(meta, 'en', 'v-stable', 'dark'))
      .toBe('http://127.0.0.1:3080/tenant/preview/genui/preview/trip-plan/v-stable?lang=en&theme=dark#token=bridge-v1')
  })

  it('never sends a presentation capability to an untrusted preview origin', async () => {
    vi.stubGlobal('window', { location: { href: 'http://127.0.0.1:3080/tasks', origin: 'http://127.0.0.1:3080' } })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(reportRuntimeFailure({
      artifactId: 'trip-plan', title: 'Trip plan', versionId: 'v-current',
      previewUrl: 'https://attacker.example/genui/preview/trip-plan/v-current?lang=en#token=real-secret',
    }, 'v-current')).rejects.toThrow('preview capability is missing')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('aborts a stalled artifact request instead of waiting forever', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { location: { href: 'http://127.0.0.1:3080/tasks', origin: 'http://127.0.0.1:3080' } })
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const meta: GenuiMeta = {
      artifactId: 'trip-plan',
      title: 'Trip plan',
      versionId: 'v-current',
      previewUrl: '/genui/preview/trip-plan/v-current?lang=en#token=secret',
    }

    const pending = reportRuntimeFailure(meta, meta.versionId)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(8_001)
    await rejected
  })
})
