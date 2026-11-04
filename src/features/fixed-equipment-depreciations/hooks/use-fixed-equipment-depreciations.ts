import { fixedEquipmentDepreciationsHooks } from '@/features/fixed-equipment-depreciations/api/fixed-equipment-depreciations.endpoints';
import type { FixedEquipmentDepreciations } from '@/features/fixed-equipment-depreciations/schemas/fixed-equipment-depreciations.schema';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import type { CommonMutation } from '@/lib/api/use-common-mutation';

/**
 * The record read (FE-03): `GET /api/v1/fixed-equipment-depreciations/:id` through SWR under the
 * global policy: a 5xx, a timeout or a network failure is retried, a 4xx never. A `null` id (the
 * create screen) is a `null` key: no request. The list itself is `ListPageTemplate`'s read, not a
 * hook here.
 */
export function useFixedEquipmentDepreciations(
  id: string | null,
): CommonApiResult<FixedEquipmentDepreciations> {
  return fixedEquipmentDepreciationsHooks.useOne(id);
}

/**
 * `DELETE /api/v1/fixed-equipment-depreciations/:id`: 204 is success and revalidates the list
 * pages; a 404 is a resolved failure the dialog shows. A write is NEVER retried (ADR-0031 §5).
 */
export function useDeleteFixedEquipmentDepreciation(id: string): CommonMutation<undefined, null> {
  return fixedEquipmentDepreciationsHooks.useRemove(id);
}
