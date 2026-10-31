import { customerGroupsHooks } from '@/features/customer-groups/api/customer-groups.endpoints';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import type { CommonMutation } from '@/lib/api/use-common-mutation';
import type { CustomerGroups } from '@/features/customer-groups/schemas/customer-groups.schema';

/**
 * The record read (FE-03): `GET /api/v1/customer-groups/:id` through SWR. A `null` id (the create
 * screen) is a `null` key: no request. The list itself is `ListPageTemplate`'s read, not a hook here.
 */
export function useCustomerGroups(id: string | null): CommonApiResult<CustomerGroups> {
  return customerGroupsHooks.useOne(id);
}

/**
 * `DELETE /api/v1/customer-groups/:id`: 204 is success and revalidates the list pages; a 404 is a
 * resolved failure the dialog shows. A write is NEVER retried (ADR-0031 §5).
 */
export function useDeleteCustomerGroup(id: string): CommonMutation<undefined, null> {
  return customerGroupsHooks.useRemove(id);
}
