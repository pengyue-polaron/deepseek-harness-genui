import { describe, expect, it } from 'vitest'
import type { ArtifactVersion } from '../src/artifacts/types.ts'
import { externalCapability, permissionView } from '../src/runtime/permissions.ts'

function version(urlPrefix: string): ArtifactVersion {
  return {
    id: 'v-permission', artifactId: 'permission-app', createdAt: new Date(0).toISOString(),
    summary: 'permission fixture', files: [], requirements: [], status: 'ready',
    capabilities: [{
      id: 'service-route', kind: 'external', label: 'Read service data',
      reason: 'Read only the declared service route.', access: 'read', urlPrefix, methods: ['GET'],
    }],
    evidence: { checkedAt: new Date(0).toISOString(), build: 'passed', browser: 'passed', diagnostics: [], notes: [] },
  }
}

describe('external capability boundaries', () => {
  it('allows an exact route, its query, and real path descendants', () => {
    const fixture = version('https://api.example.com/v1/users')
    expect(externalCapability(fixture, new URL('https://api.example.com/v1/users'), 'GET')).toBeDefined()
    expect(externalCapability(fixture, new URL('https://api.example.com/v1/users?page=2'), 'GET')).toBeDefined()
    expect(externalCapability(fixture, new URL('https://api.example.com/v1/users/42'), 'GET')).toBeDefined()
  })

  it('rejects lookalike paths, different origins, credentials, fragments, and methods', () => {
    const fixture = version('https://api.example.com/v1/users')
    expect(externalCapability(fixture, new URL('https://api.example.com/v1/users-admin'), 'GET')).toBeUndefined()
    expect(externalCapability(fixture, new URL('https://api.example.com/v1/users%2Fadmin'), 'GET')).toBeUndefined()
    expect(externalCapability(fixture, new URL('https://other.example.com/v1/users'), 'GET')).toBeUndefined()
    expect(externalCapability(fixture, new URL('https://name@api.example.com/v1/users'), 'GET')).toBeUndefined()
    expect(externalCapability(fixture, new URL('https://api.example.com/v1/users#private'), 'GET')).toBeUndefined()
    expect(externalCapability(fixture, new URL('https://api.example.com/v1/users'), 'POST')).toBeUndefined()
  })

  it('treats a declared query as exact and shows the approved route to the user', () => {
    const fixture = version('https://api.example.com/v1/users?scope=public')
    expect(externalCapability(fixture, new URL('https://api.example.com/v1/users?scope=public'), 'GET')).toBeDefined()
    expect(externalCapability(fixture, new URL('https://api.example.com/v1/users?scope=private'), 'GET')).toBeUndefined()
    expect(externalCapability(fixture, new URL('https://api.example.com/v1/users?scope=public&admin=true'), 'GET')).toBeUndefined()
    expect(permissionView(fixture.capabilities[0]!)).toMatchObject({ destination: 'api.example.com/v1/users?scope=public' })
  })
})
