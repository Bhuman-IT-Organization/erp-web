import {
  IDENTITY_ROLES_PATH,
  rolePath,
  staffRoleHooks,
} from '@/features/staff/api/staff.endpoints';
import {
  staffRoleDetailSchema,
  type CreateStaffRoleInput,
  type StaffRoleDetail,
  type UpdateStaffRoleInput,
} from '@/features/staff/schemas/staff.schema';
import { useCommonApi, type CommonApiResult } from '@/lib/api/use-common-api';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';

/**
 * The role reads and writes the two roles screens use (FE-08); the list itself is
 * `ListPageTemplate`'s. A hook file carries no `'use client'`; the component that calls it does.
 *
 * `staffRoleHooks.useOne` is deliberately not used for the single role: it parses with
 * `staffRoleSchema`, the LIST row, which would drop the template and the members the form renders.
 *
 * Every write is NEVER retried (ADR-0031 §5): a role write changes what other people may do, so the
 * only retry is the member pressing the button again.
 */

/** `id === null` makes no request (SWR skips a null key): the create screen loads no role. */
export function useRole(id: number | null): CommonApiResult<StaffRoleDetail> {
  return useCommonApi(id === null ? null : rolePath(id), staffRoleDetailSchema);
}

export interface RoleSave {
  readonly create: CommonMutation<CreateStaffRoleInput, StaffRoleDetail>;
  readonly update: CommonMutation<UpdateStaffRoleInput, StaffRoleDetail>;
}

/**
 * Both role saves. Success answers the saved role as the DETAIL (the api answers
 * `roleResponseSchema`), and **nothing is invalidated** (D-36): the screen swaps the saved row into
 * the cached list pages after an edit, and revalidates them after a create — a prefix invalidation
 * would ask every mounted list page again. Both are registered unconditionally (the rules of hooks);
 * `id === null` on the create screen registers an update that is never triggered.
 */
export function useSaveRole(id: number | null): RoleSave {
  const create = useCommonMutation<CreateStaffRoleInput, StaffRoleDetail>(IDENTITY_ROLES_PATH, {
    method: 'POST',
    schema: staffRoleDetailSchema,
    invalidate: [],
  });
  const update = useCommonMutation<UpdateStaffRoleInput, StaffRoleDetail>(rolePath(id ?? 0), {
    method: 'PATCH',
    schema: staffRoleDetailSchema,
    invalidate: [],
  });
  return { create, update };
}

/**
 * `DELETE /api/v1/identity/roles/:id` — 204, or 409 while a member still holds the role. On success
 * it revalidates the roles list pages (the totals moved).
 */
export function useDeleteRole(id: number): CommonMutation<undefined, null> {
  return staffRoleHooks.useRemove(String(id));
}
