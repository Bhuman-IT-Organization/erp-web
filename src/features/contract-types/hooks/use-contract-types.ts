import { contractTypesHooks } from '@/features/contract-types/api/contract-types.endpoints';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import type { CommonMutation } from '@/lib/api/use-common-mutation';
import type { ContractTypes } from '@/features/contract-types/schemas/contract-types.schema';

/**
 * The record read (FE-03): `GET /api/v1/contract-types/:id` through SWR under the global policy: a
 * 5xx, a timeout or a network failure is retried, a 4xx never. A `null` id (the create screen) is
 * a `null` key: no request. The list itself is `ListPageTemplate`'s read, not a hook here.
 */
export function useContractTypes(id: string | null): CommonApiResult<ContractTypes> {
  return contractTypesHooks.useOne(id);
}

/**
 * `DELETE /api/v1/contract-types/:id` (the `useDeleteRole` shape): 204 is success and revalidates the
 * list pages (the totals moved); a 409 `ERP-CONTRACTTYPES-0001` (still in use) or a 404 is a resolved
 * failure the dialog shows. A write is NEVER retried (ADR-0031 §5).
 */
export function useDeleteContractType(id: string): CommonMutation<undefined, null> {
  return contractTypesHooks.useRemove(id);
}
