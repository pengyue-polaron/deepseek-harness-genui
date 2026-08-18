import type { PermissionRequest } from './types.ts';
export declare function enqueuePermission(queue: PermissionRequest[], request: PermissionRequest): PermissionRequest[];
export declare function settlePermission(queue: PermissionRequest[], permissionId: string): {
    answered: PermissionRequest[];
    remaining: PermissionRequest[];
};
//# sourceMappingURL=permission-queue.d.ts.map