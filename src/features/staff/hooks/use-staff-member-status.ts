import { z } from 'zod';
import { memberStatusPath } from '@/features/staff/api/staff.endpoints';
import type { StaffMember, StaffMemberStatusInput } from '@/features/staff/schemas/staff.schema';
import type { ApiResult } from '@/lib/api/call-api';
import { useCommonMutation } from '@/lib/api/use-common-mutation';

export interface StaffMemberStatus {
  /**
   * Sets the member active or inactive. Success answers the SAVED row — the list row with the new
   * flag, since the api answers 204 with no body — for the caller's `replaceRowInLists` (D-36: the
   * row updates in place, no list page is asked for again). A failure answers
   * `{ ok: false, code, retryAfterS }`, which `ConfirmDialog` shows inside itself. Never throws.
   */
  readonly setActive: (active: boolean) => Promise<ApiResult<StaffMember>>;
  readonly isMutating: boolean;
}

/**
 * The Active column's write: `PATCH /api/v1/identity/members/:id/status` — 204, no body (plan
 * 03.1-12), gated by `staff.members.edit` on the api. Like every write it is NEVER retried
 * (ADR-0031 §5): the member decides whether to try again. It invalidates nothing: the caller swaps
 * the saved row into the cached list pages instead of refetching them.
 */
export function useStaffMemberStatus(row: StaffMember): StaffMemberStatus {
  const { trigger, isMutating } = useCommonMutation<StaffMemberStatusInput, null>(
    memberStatusPath(row.staffId),
    { method: 'PATCH', schema: z.null(), expectNoContent: true, invalidate: [] },
  );
  const setActive = async (active: boolean): Promise<ApiResult<StaffMember>> => {
    const result = await trigger({ active });
    return result.ok ? { ok: true, status: result.status, data: { ...row, active } } : result;
  };
  return { setActive, isMutating };
}
