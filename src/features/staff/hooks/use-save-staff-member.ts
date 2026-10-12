import { IDENTITY_MEMBERS_PATH, memberPath } from '@/features/staff/api/staff.endpoints';
import {
  staffMemberDetailSchema,
  type CreateStaffMemberInput,
  type StaffMemberDetail,
  type UpdateStaffMemberInput,
} from '@/features/staff/schemas/staff.schema';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';

/**
 * The member save (FE-08): `POST /api/v1/identity/members` on create,
 * `PATCH /api/v1/identity/members/:id` on edit — ONE request carrying profile, departments and
 * permissions, which the api writes in one transaction (brief §9.1).
 *
 * - **Success answers the saved record**, parsed as the DETAIL (the api answers
 *   `memberResponseSchema`), so the form resets from it and the screen puts it in the detail cache
 *   and swaps its row into the cached list pages.
 * - **It invalidates nothing** (D-36): a prefix invalidation of the members path would ask every
 *   mounted list page again; the screen updates them in place instead (`replaceRowInLists`), or,
 *   after a create, revalidates the list pages only (`revalidateLists`).
 * - **A failure is `{ ok: false, code, retryAfterS, issues }`**, never a throw, and it is NEVER
 *   retried (ADR-0031 §5, FE-12): the member's own Retry is the only retry.
 *
 * Both hooks are called unconditionally (the rules of hooks); `id === null` on the create screen
 * registers an update that is never triggered.
 */
export interface StaffMemberSave {
  readonly create: CommonMutation<CreateStaffMemberInput, StaffMemberDetail>;
  readonly update: CommonMutation<UpdateStaffMemberInput, StaffMemberDetail>;
}

export function useSaveStaffMember(id: number | null): StaffMemberSave {
  const create = useCommonMutation<CreateStaffMemberInput, StaffMemberDetail>(
    IDENTITY_MEMBERS_PATH,
    { method: 'POST', schema: staffMemberDetailSchema, invalidate: [] },
  );
  const update = useCommonMutation<UpdateStaffMemberInput, StaffMemberDetail>(memberPath(id ?? 0), {
    method: 'PATCH',
    schema: staffMemberDetailSchema,
    invalidate: [],
  });
  return { create, update };
}
