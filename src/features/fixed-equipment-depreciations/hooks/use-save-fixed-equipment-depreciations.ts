import {
  FIXED_EQUIPMENT_DEPRECIATIONS_ENDPOINTS,
  FIXED_EQUIPMENT_DEPRECIATIONS_PATH,
  fixedEquipmentDepreciationsPath,
} from '@/features/fixed-equipment-depreciations/api/fixed-equipment-depreciations.endpoints';
import {
  fixedEquipmentDepreciationsSchema,
  type FixedEquipmentDepreciations,
  type FixedEquipmentDepreciationsBody,
} from '@/features/fixed-equipment-depreciations/schemas/fixed-equipment-depreciations.schema';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';

/** The two writes of the form, one for each screen. */
export interface FixedEquipmentDepreciationsSave {
  readonly create: CommonMutation<FixedEquipmentDepreciationsBody, FixedEquipmentDepreciations>;
  readonly update: CommonMutation<FixedEquipmentDepreciationsBody, FixedEquipmentDepreciations>;
}

/**
 * The writes (FE-03): `.create` and `.update` of the endpoints table, each with the body
 * `{ name, term }` (`toFixedEquipmentDepreciationsBody` builds it from the form), NEVER retried
 * automatically (ADR-0031 §5); a 400 carries `issues` for the form, a 404 says the record is gone.
 * They invalidate nothing: the screen swaps the saved row into the cached list pages after an edit
 * and revalidates them after a create. With no id (the create screen) `update` is never triggered.
 */
export function useSaveFixedEquipmentDepreciations(
  id: string | null,
): FixedEquipmentDepreciationsSave {
  const create = useCommonMutation<FixedEquipmentDepreciationsBody, FixedEquipmentDepreciations>(
    FIXED_EQUIPMENT_DEPRECIATIONS_PATH,
    {
      method: FIXED_EQUIPMENT_DEPRECIATIONS_ENDPOINTS.create.method,
      schema: fixedEquipmentDepreciationsSchema,
      invalidate: [],
    },
  );
  const update = useCommonMutation<FixedEquipmentDepreciationsBody, FixedEquipmentDepreciations>(
    id === null ? FIXED_EQUIPMENT_DEPRECIATIONS_PATH : fixedEquipmentDepreciationsPath(id),
    {
      method: FIXED_EQUIPMENT_DEPRECIATIONS_ENDPOINTS.update.method,
      schema: fixedEquipmentDepreciationsSchema,
      invalidate: [],
    },
  );
  return { create, update };
}
