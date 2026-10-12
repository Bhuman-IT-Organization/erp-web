import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  BASE_CODE,
  BASE_LOCKED_CODE,
  CODE_LOCKED_CODE,
  currenciesSchema,
  IN_USE_CODE,
  OTHER_MODULE_CODE,
  type Currencies,
  type CurrenciesFormValues,
} from '@/features/currencies/schemas/currencies.schema';

/**
 * The resource's wire contract: every call this feature makes, method and path. The api half is
 * erp-api `src/v1/currencies` (started as a copy of erp-docs 05-templates/backend-module, plus the
 * make-base switch and the DELETE added by hand, plan 04.1-28), which serves exactly these seven
 * routes (`CURRENCIES_ROUTES`). The list, `GET ...?q&sort&limit&cursor`, answers `{ data:
 * Currencies[], meta: { nextCursor, prevCursor, total, rangeStart, exportLimit, printLimit } }`
 * (BE-19; `ListPageTemplate` reads it), the code descending by default (Perfex's DataTable order); a
 * row is the whole record: the five fields of Perfex's form, whether it is the base, the 24 delete
 * groups, the three lock groups, other modules' registered uses and whether it can be made the base
 * now (so a delete and a make-base are refused up front, D-39 to D-41). A record is `GET|PATCH
 * .../:id` (the body the five fields), a new one `POST`, the base switch `PATCH .../:id/base` with
 * `{}` answering `{ id, isBase: true }` (D-39), the export `GET .../export` with the list's query
 * and one `header` per column (D-26, D-42, ADR-0043), and a delete `DELETE .../:id` (204, 404, or a
 * 409 while in use, for the base, or while another module uses it).
 *
 * No axios import, no raw transport, no duration literal here: reads go through `useCommonApi`
 * (retried per ADR-0031 §5 by SWR), writes through `useCommonMutation` (NEVER retried; the form
 * offers Retry for a retryable code), FE-03.
 */
export const CURRENCIES_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/currencies' },
  export: { method: 'GET', path: '/api/v1/currencies/export' },
  detail: { method: 'GET', path: '/api/v1/currencies/:id' },
  create: { method: 'POST', path: '/api/v1/currencies' },
  update: { method: 'PATCH', path: '/api/v1/currencies/:id' },
  makeBase: { method: 'PATCH', path: '/api/v1/currencies/:id/base' },
  remove: { method: 'DELETE', path: '/api/v1/currencies/:id' },
} as const;

export const CURRENCIES_PATH = CURRENCIES_ENDPOINTS.list.path satisfies ApiPath;
export const CURRENCIES_EXPORT_PATH = CURRENCIES_ENDPOINTS.export.path satisfies ApiPath;

/**
 * The export's columns in the api's order (erp-api `CURRENCIES_EXPORT_COLUMNS`: Perfex's code and
 * symbol, then whether it is the base); `ListExport` types one label per column against it. The
 * usage is never exported.
 */
export const CURRENCIES_EXPORT_COLUMNS = ['name', 'symbol', 'isBase'] as const;
export type CurrenciesExportColumn = (typeof CURRENCIES_EXPORT_COLUMNS)[number];

/** One record's path (its detail read, its update, its seed from the list row), the id encoded. */
export function currenciesPath(id: string): ApiPath {
  return CURRENCIES_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

/** The make-base switch's path for one record (D-39), the id encoded. */
export function currencyBasePath(id: string): ApiPath {
  return CURRENCIES_ENDPOINTS.makeBase.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

export const currenciesHooks = createResourceHooks<Currencies, CurrenciesFormValues>(
  CURRENCIES_PATH,
  currenciesSchema,
);

/** The 400 whose problem body carries `issues` the form maps onto its fields. */
export const VALIDATION_CODE = 'ERP-VALIDATION-0001';

/**
 * The api's one not-found answer: a record that is not there, or one the caller may not read (the
 * same 404, so an id reveals nothing). A permalink to it says so in plain words (D-32).
 */
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

/**
 * The api's five refusals (409), defined beside `refusalOf` in the schema (this file imports the
 * schema, so the schema cannot import them from here): `IN_USE_CODE`
 * (`ERP-CURRENCIES-0001`, a delete while any delete group uses it, D-40), `BASE_CODE`
 * (`ERP-CURRENCIES-0002`, a delete of the base), `OTHER_MODULE_CODE` (`ERP-CURRENCIES-0003`, a
 * delete while another module's registered use counts, D-41), `BASE_LOCKED_CODE`
 * (`ERP-CURRENCIES-0004`, a make-base while the current base has transactions, D-39) and
 * `CODE_LOCKED_CODE` (`ERP-CURRENCIES-0005`, a code change while anything uses it, D-42 widened).
 * The list refuses up front from the row and keeps the live answer for the race.
 */
export { BASE_CODE, BASE_LOCKED_CODE, CODE_LOCKED_CODE, IN_USE_CODE, OTHER_MODULE_CODE };

/**
 * The feature's own codes, each with a `currencies.errors.<code>` message: `useErrorText` renders a
 * refusal as `'errors.<code>'` of this namespace (messages/en.json), so the list, the dialogs and
 * the save summary say it in the feature's words (D-32).
 */
export const CURRENCIES_ERRORS: FeatureErrorCodes = {
  namespace: 'currencies',
  codes: [
    NOT_FOUND_CODE,
    IN_USE_CODE,
    BASE_CODE,
    OTHER_MODULE_CODE,
    BASE_LOCKED_CODE,
    CODE_LOCKED_CODE,
  ],
};
