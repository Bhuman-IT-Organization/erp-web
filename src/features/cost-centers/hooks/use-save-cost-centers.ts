import {
  COST_CENTERS_ENDPOINTS,
  COST_CENTERS_PATH,
  costCentersPath,
} from '@/features/cost-centers/api/cost-centers.endpoints';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  costCentersSchema,
  type CostCenters,
  type CostCentersFormValues,
} from '@/features/cost-centers/schemas/cost-centers.schema';

/** The two writes of the form, one for each screen. */
export interface CostCentersSave {
  readonly create: CommonMutation<CostCentersFormValues, CostCenters>;
  readonly update: CommonMutation<CostCentersFormValues, CostCenters>;
}

/**
 * The writes (FE-03): `COST_CENTERS_ENDPOINTS.create` and `.update`, each with the body `{ name }`:
 * the method and the path come from the table the api module is held to, NEVER retried
 * automatically (ADR-0031 §5); a 400 carries `issues` for the form, a 404 says the record is gone.
 * They invalidate nothing: the screen swaps the saved row into the cached list pages after an edit
 * and revalidates them after a create, so no list page is asked again for an edit (D-36). With no
 * id (the create screen) `update` is never triggered.
 */
export function useSaveCostCenters(id: string | null): CostCentersSave {
  const create = useCommonMutation<CostCentersFormValues, CostCenters>(COST_CENTERS_PATH, {
    method: COST_CENTERS_ENDPOINTS.create.method,
    schema: costCentersSchema,
    invalidate: [],
  });
  const update = useCommonMutation<CostCentersFormValues, CostCenters>(
    id === null ? COST_CENTERS_PATH : costCentersPath(id),
    { method: COST_CENTERS_ENDPOINTS.update.method, schema: costCentersSchema, invalidate: [] },
  );
  return { create, update };
}
