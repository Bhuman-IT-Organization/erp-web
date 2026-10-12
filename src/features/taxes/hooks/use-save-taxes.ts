import { TAXES_ENDPOINTS, TAXES_PATH, taxesPath } from '@/features/taxes/api/taxes.endpoints';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  taxesSchema,
  type Taxes,
  type TaxesFormValues,
} from '@/features/taxes/schemas/taxes.schema';

/** The two writes of the form, one for each screen. */
export interface TaxesSave {
  readonly create: CommonMutation<TaxesFormValues, Taxes>;
  readonly update: CommonMutation<TaxesFormValues, Taxes>;
}

/**
 * The writes (FE-03): `TAXES_ENDPOINTS.create` and `.update`, each with the body `{ name, rate }`
 * (both strings): the method and the path come from the table the api module is held to, NEVER
 * retried automatically (ADR-0031 §5); a 400 carries `issues` for the form, a 409 one of the four
 * taxes refusals. They invalidate nothing: the screen swaps the saved row into the cached list pages
 * after an edit and revalidates them after a create, so no list page is asked again for an edit
 * (D-36). With no id (the create screen) `update` is never triggered.
 */
export function useSaveTaxes(id: string | null): TaxesSave {
  const create = useCommonMutation<TaxesFormValues, Taxes>(TAXES_PATH, {
    method: TAXES_ENDPOINTS.create.method,
    schema: taxesSchema,
    invalidate: [],
  });
  const update = useCommonMutation<TaxesFormValues, Taxes>(
    id === null ? TAXES_PATH : taxesPath(id),
    { method: TAXES_ENDPOINTS.update.method, schema: taxesSchema, invalidate: [] },
  );
  return { create, update };
}
