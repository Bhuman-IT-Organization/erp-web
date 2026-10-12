import {
  CURRENCIES_ENDPOINTS,
  CURRENCIES_PATH,
  currenciesHooks,
  currencyBasePath,
} from '@/features/currencies/api/currencies.endpoints';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  currenciesBaseSchema,
  type Currencies,
  type CurrenciesBase,
} from '@/features/currencies/schemas/currencies.schema';

/**
 * The record read (FE-03): `GET /api/v1/currencies/:id` through SWR under the global policy: a
 * 5xx, a timeout or a network failure is retried, a 4xx never. A `null` id (the create screen) is
 * a `null` key: no request. The list itself is `ListPageTemplate`'s read, not a hook here.
 */
export function useCurrencies(id: string | null): CommonApiResult<Currencies> {
  return currenciesHooks.useOne(id);
}

/**
 * `DELETE /api/v1/currencies/:id` (the `useDeleteRole` shape): 204 is success and revalidates the
 * list pages (the totals moved); a 409 `ERP-CURRENCIES-0001` (in use), `-0002` (the base) or `-0003`
 * (another module's use), or a 404, is a resolved failure the dialog shows. A write is NEVER retried
 * (ADR-0031 §5).
 */
export function useDeleteCurrency(id: string): CommonMutation<undefined, null> {
  return currenciesHooks.useRemove(id);
}

/**
 * `PATCH /api/v1/currencies/:id/base` with `{}`, the list's make-base action (D-39): its own
 * mutation, NEVER retried (ADR-0031 §5); it answers `{ id, isBase: true }`, and on success every
 * cached list page (and record) under `/api/v1/currencies` asks again, because two rows change (the
 * new base and the old one). A 409 `ERP-CURRENCIES-0004` or a 404 is a resolved failure the dialog
 * shows.
 */
export function useMakeBaseCurrency(
  id: string,
): CommonMutation<Record<string, never>, CurrenciesBase> {
  return useCommonMutation(currencyBasePath(id), {
    method: CURRENCIES_ENDPOINTS.makeBase.method,
    schema: currenciesBaseSchema,
    invalidate: [CURRENCIES_PATH],
  });
}
