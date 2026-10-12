import { taxesHooks } from '@/features/taxes/api/taxes.endpoints';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import type { CommonMutation } from '@/lib/api/use-common-mutation';
import type { Taxes } from '@/features/taxes/schemas/taxes.schema';

/**
 * The record read (FE-03): `GET /api/v1/taxes/:id` through SWR under the global policy: a 5xx, a
 * timeout or a network failure is retried, a 4xx never. A `null` id (the create screen) is a `null`
 * key: no request. The list itself is `ListPageTemplate`'s read, not a hook here.
 */
export function useTaxes(id: string | null): CommonApiResult<Taxes> {
  return taxesHooks.useOne(id);
}

/**
 * `DELETE /api/v1/taxes/:id` (the `useDeleteRole` shape): 204 is success and revalidates the list
 * pages (the totals moved); a 409 `ERP-TAXES-0001` (still in use) or a 404 is a resolved failure the
 * dialog shows. A write is NEVER retried (ADR-0031 §5).
 */
export function useDeleteTax(id: string): CommonMutation<undefined, null> {
  return taxesHooks.useRemove(id);
}
