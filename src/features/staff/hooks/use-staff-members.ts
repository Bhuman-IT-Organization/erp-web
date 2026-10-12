import { memberPath } from '@/features/staff/api/staff.endpoints';
import {
  staffMemberDetailSchema,
  type StaffMemberDetail,
} from '@/features/staff/schemas/staff.schema';
import { useCommonApi, type CommonApiResult } from '@/lib/api/use-common-api';

/**
 * One member's read (FE-08) through `useCommonApi` with the DETAIL schema. The list reads itself
 * through `ListPageTemplate` (plan 03.2-15), so the list hook this file held is gone.
 *
 * It deliberately does not use `staffMemberHooks.useOne`: that hook parses with
 * `staffMemberSchema`, the LIST row, which would drop the profile, the departments and the
 * permission set the form needs. The SWR key is the same string either way
 * (`/api/v1/identity/members/<id>`).
 *
 * `id === null` makes no request (SWR skips a null key): the create screen loads no member. A hook
 * file carries no `'use client'`; the component that calls it does.
 */
export function useStaffMember(id: number | null): CommonApiResult<StaffMemberDetail> {
  return useCommonApi(id === null ? null : memberPath(id), staffMemberDetailSchema);
}
