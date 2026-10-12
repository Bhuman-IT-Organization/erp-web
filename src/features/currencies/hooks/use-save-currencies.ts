import {
  CURRENCIES_ENDPOINTS,
  CURRENCIES_PATH,
  currenciesPath,
} from '@/features/currencies/api/currencies.endpoints';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  currenciesSchema,
  type Currencies,
  type CurrenciesFormValues,
} from '@/features/currencies/schemas/currencies.schema';

/** The two writes of the form, one for each screen. */
export interface CurrenciesSave {
  readonly create: CommonMutation<CurrenciesFormValues, Currencies>;
  readonly update: CommonMutation<CurrenciesFormValues, Currencies>;
}

/**
 * The writes (FE-03): `CURRENCIES_ENDPOINTS.create` and `.update`, each with the five fields of
 * Perfex's form (an update rewrites all five, as Perfex's does): the method and the path come from
 * the table the api module is held to, NEVER retried automatically (ADR-0031 §5); a 400 carries
 * `issues` for the form, a 404 says the record is gone, a 409 `ERP-CURRENCIES-0005` that the code
 * cannot change while the currency is in use. They invalidate
 * nothing: the screen swaps the saved row into the cached list pages after an edit and revalidates
 * them after a create, so no list page is asked again for an edit (D-36). With no id (the create
 * screen) `update` is never triggered.
 */
export function useSaveCurrencies(id: string | null): CurrenciesSave {
  const create = useCommonMutation<CurrenciesFormValues, Currencies>(CURRENCIES_PATH, {
    method: CURRENCIES_ENDPOINTS.create.method,
    schema: currenciesSchema,
    invalidate: [],
  });
  const update = useCommonMutation<CurrenciesFormValues, Currencies>(
    id === null ? CURRENCIES_PATH : currenciesPath(id),
    { method: CURRENCIES_ENDPOINTS.update.method, schema: currenciesSchema, invalidate: [] },
  );
  return { create, update };
}
