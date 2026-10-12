import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  taxesSchema,
  type Taxes,
  type TaxesFormValues,
} from '@/features/taxes/schemas/taxes.schema';

/**
 * The resource's wire contract: every call this feature makes, method and path. The api half is
 * erp-api `src/v1/taxes` (started as a copy of erp-docs 05-templates/backend-module, plus the DELETE added by
 * hand, plan 04.1-11), which serves exactly these six routes. The list, `GET …?q&sort&limit&cursor`,
 * answers `{ data: Taxes[], meta: { nextCursor, prevCursor, total, rangeStart, exportLimit,
 * printLimit } }` (BE-19; `ListPageTemplate` reads it), rate ascending by default; a row is the whole
 * record: the tax, its nine usage groups (so a delete is refused up front, D-07) and whether
 * Perfex's `default_tax` setting names it (D-21). A record is `GET|PATCH …/:id`, a new one `POST`
 * (the body `{ name, rate }`, both strings), the export `GET …/export` with the list's query and one
 * `header` per column (D-26, D-42, ADR-0043), and a delete `DELETE …/:id` (204, 404, or 409 while
 * in use).
 *
 * No axios import, no raw transport, no duration literal here: reads go through `useCommonApi`
 * (retried per ADR-0031 §5 by SWR), writes through `useCommonMutation` (NEVER retried; the form
 * offers Retry for a retryable code), FE-03.
 */
export const TAXES_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/taxes' },
  export: { method: 'GET', path: '/api/v1/taxes/export' },
  detail: { method: 'GET', path: '/api/v1/taxes/:id' },
  create: { method: 'POST', path: '/api/v1/taxes' },
  update: { method: 'PATCH', path: '/api/v1/taxes/:id' },
  remove: { method: 'DELETE', path: '/api/v1/taxes/:id' },
} as const;

export const TAXES_PATH = TAXES_ENDPOINTS.list.path satisfies ApiPath;
export const TAXES_EXPORT_PATH = TAXES_ENDPOINTS.export.path satisfies ApiPath;

/**
 * The export's columns in the api's order (erp-api `TAXES_EXPORT_COLUMNS`); `ListExport` types one
 * label per column against it. The usage and the default flag are never exported.
 */
export const TAXES_EXPORT_COLUMNS = ['id', 'name', 'rate'] as const;
export type TaxesExportColumn = (typeof TAXES_EXPORT_COLUMNS)[number];

/** One record's path (its detail read, its update, its seed from the list row), the id encoded. */
export function taxesPath(id: string): ApiPath {
  return TAXES_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

export const taxesHooks = createResourceHooks<Taxes, TaxesFormValues>(TAXES_PATH, taxesSchema);

/** The 400 whose problem body carries `issues` the form maps onto its fields. */
export const VALIDATION_CODE = 'ERP-VALIDATION-0001';

/**
 * The api's one not-found answer: a record that is not there, or one the caller may not read (the
 * same 404, so an id reveals nothing). A permalink to it says so in plain words (D-32).
 */
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

/**
 * The api's refusal of a delete while anything still uses the tax: items, expenses, subscriptions,
 * vendor items, purchase, warehouse, fixed equipment or sales return lines, or accounting (409,
 * D-07). The list refuses up front from the row's usage (`refusedCode`) and keeps the live answer for
 * the race.
 */
export const IN_USE_CODE = 'ERP-TAXES-0001';

/** The api's refusal of an edit while expenses or subscriptions use the tax (409, Perfex's rule). */
export const LOCKED_BY_USE_CODE = 'ERP-TAXES-0002';

/** The api's refusal of a name another tax already holds, on create and on update (409). */
export const NAME_TAKEN_CODE = 'ERP-TAXES-0003';

/** The api's refusal of a name or rate change while Perfex's `default_tax` setting names the tax (409, D-21). */
export const DEFAULT_TAX_CODE = 'ERP-TAXES-0004';

/**
 * The feature's own codes, each with a `taxes.errors.<code>` message: `useErrorText` renders a
 * refusal as `'errors.<code>'` of this namespace (messages/en.json), so the list, the dialog and the
 * save summary say it in the feature's words (D-32).
 */
export const TAXES_ERRORS: FeatureErrorCodes = {
  namespace: 'taxes',
  codes: [NOT_FOUND_CODE, IN_USE_CODE, LOCKED_BY_USE_CODE, NAME_TAKEN_CODE, DEFAULT_TAX_CODE],
};
