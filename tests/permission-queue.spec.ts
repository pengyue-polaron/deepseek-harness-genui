import { describe, expect, it } from 'vitest'
import { enqueuePermission, settlePermission } from '../src/client/permission-queue.ts'
import type { PermissionRequest } from '../src/client/types.ts'

function request(requestId: string, permissionId: string): PermissionRequest {
  return {
    requestId,
    permission: {
      id: permissionId,
      kind: 'external',
      label: permissionId,
      reason: 'Test access',
      access: 'read',
    },
  }
}

describe('permission queue', () => {
  it('keeps simultaneous requests in arrival order', () => {
    const first = enqueuePermission([], request('request-a', 'github'))
    const second = enqueuePermission(first, request('request-b', 'huggingface'))
    expect(second.map(item => item.permission.id)).toEqual(['github', 'huggingface'])
  })

  it('ignores duplicate delivery and settles every waiter for one capability', () => {
    const github = request('request-a', 'github')
    const queue = [github, request('request-b', 'huggingface'), request('request-c', 'github')]
    expect(enqueuePermission(queue, github)).toBe(queue)
    expect(settlePermission(queue, 'github')).toEqual({
      answered: [queue[0], queue[2]],
      remaining: [queue[1]],
    })
  })
})
