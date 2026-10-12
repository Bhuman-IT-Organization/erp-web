import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  expenseCategoriesSchema,
  type ExpenseCategories,
  type ExpenseCategoriesFormValues,
} from '@/features/expense-categories/schemas/expense-categories.schema';

/**
 * The resource's wire contract: every call this feature makes, method and path. The api half is
 * erp-api `src/v1/expense-categories` (started as a copy of erp-docs
 * 05-templates/backend-module, plus the DELETE added by hand), which serves exactly these six routes. The list,
 * `GET …?q&sort&limit&cursor`, answers `{ data: ExpenseCategoriesRow[], meta: { nextCursor,
 * prevCursor, total, rangeStart, exportLimit } }` (BE-19; `ListPageTemplate` reads it); a row also
 * carries its three usage counts so a delete can be refused up front (D-07, D-15). A record is
 * `GET|PATCH …/:id`, a new one `POST`, the CSV export `GET …/export` with the list's query and one
 * `header` per column (D-26, D-42), and a delete `DELETE …/:id` (204, 404, or 409 while in use).
 *
 * No axios import, no raw transport, no duration literal here: reads go through `useCommonApi`
 * (retried per ADR-0031 §5 by SWR), writes through `useCommonMutation` (NEVER retried; the form
 * offers Retry for a retryable code), FE-03.
 */
export const EXPENSE_CATEGORIES_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/expense-categories' },
  export: { method: 'GET', path: '/api/v1/expense-categories/export' },
  detail: { method: 'GET', path: '/api/v1/expense-categories/:id' },
  create: { method: 'POST', path: '/api/v1/expense-categories' },
  update: { method: 'PATCH', path: '/api/v1/expense-categories/:id' },
  remove: { method: 'DELETE', path: '/api/v1/expense-categories/:id' },
} as const;

export const EXPENSE_CATEGORIES_PATH = EXPENSE_CATEGORIES_ENDPOINTS.list.path satisfies ApiPath;
export const EXPENSE_CATEGORIES_EXPORT_PATH = EXPENSE_CATEGORIES_ENDPOINTS.export
  .path satisfies ApiPath;

/**
 * The export's columns in the api's order (erp-api `EXPENSE_CATEGORIES_EXPORT_COLUMNS`); `ListExport`
 * types one label per column against it. The usage counts are never exported.
 */
export const EXPENSE_CATEGORIES_EXPORT_COLUMNS = ['id', 'name', 'description'] as const;
export type ExpenseCategoriesExportColumn = (typeof EXPENSE_CATEGORIES_EXPORT_COLUMNS)[number];

/** One record's path (its detail read, its update, its seed from the list row), the id encoded. */
export function expenseCategoriesPath(id: string): ApiPath {
  return EXPENSE_CATEGORIES_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

export const expenseCategoriesHooks = createResourceHooks<
  ExpenseCategories,
  ExpenseCategoriesFormValues
>(EXPENSE_CATEGORIES_PATH, expenseCategoriesSchema);

/** The 400 whose problem body carries `issues` the form maps onto its fields. */
export const VALIDATION_CODE = 'ERP-VALIDATION-0001';

/**
 * The api's one not-found answer: a record that is not there, or one the caller may not read (the
 * same 404, so an id reveals nothing). A permalink to it says so in plain words (D-32).
 */
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

/**
 * The api's refusal of a delete while expenses, accounting mappings or petty cash advances still use
 * the category (409, D-07, D-15). The list refuses up front from the row's counts (`refusedCode`)
 * and keeps the live answer for the race.
 */
export const IN_USE_CODE = 'ERP-EXPENSECATEGORIES-0001';

/**
 * The feature's own codes, each with an `expense-categories.errors.<code>` message: `useErrorText`
 * renders `NOT_FOUND_CODE` as `'errors.ERP-CORE-0004'` of this namespace (messages/en.json).
 */
export const EXPENSE_CATEGORIES_ERRORS: FeatureErrorCodes = {
  namespace: 'expense-categories',
  codes: [NOT_FOUND_CODE, IN_USE_CODE],
};
