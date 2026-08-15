import type { PermissionRequest } from './types.ts'

export function enqueuePermission(queue: PermissionRequest[], request: PermissionRequest): PermissionRequest[] {
  return queue.some(item => item.requestId === request.requestId) ? queue : [...queue, request]
}

export function settlePermission(queue: PermissionRequest[], permissionId: string): {
  answered: PermissionRequest[]
  remaining: PermissionRequest[]
} {
  return {
    answered: queue.filter(item => item.permission.id === permissionId),
    remaining: queue.filter(item => item.permission.id !== permissionId),
  }
}
