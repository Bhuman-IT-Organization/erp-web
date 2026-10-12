import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  CREDIT_MODE_CODE,
  IN_USE_CODE,
  paymentModesSchema,
  type PaymentModes,
  type PaymentModesFormValues,
} from '@/features/payment-modes/schemas/payment-modes.schema';

/**
 * The resource's wire contract: every call this feature makes, method and path. The api half is
 * erp-api `src/v1/payment-modes` (started as a copy of erp-docs 05-templates/backend-module, plus the
 * switch and the DELETE added by hand, plan 04.1-23), which serves exactly these seven routes
 * (`PAYMENT_MODES_ROUTES`). The list, `GET ...?q&sort&limit&cursor`, answers `{ data:
 * PaymentModes[], meta: { nextCursor, prevCursor, total, rangeStart, exportLimit, printLimit } }`
 * (BE-19; `ListPageTemplate` reads it), the name ascending by default (Perfex's order); a row is the
 * whole record: the seven fields of Perfex's form (the description in its read form), the eight
 * usage groups and whether Perfex's `expense_credit_payment_mode` names it (so a delete is refused up
 * front, D-33, D-37). A record is `GET|PATCH .../:id` (the body the seven fields), a new one `POST`,
 * the list's one-click switch `PATCH .../:id/active` with `{ active }` answering `{ id, active }`
 * (D-34), the export `GET .../export` with the list's query and one `header` per column (D-26,
 * D-42, ADR-0043), and a delete `DELETE .../:id` (204, 404, or a 409 while in use or for the credit
 * expense mode).
 *
 * No axios import, no raw transport, no duration literal here: reads go through `useCommonApi`
 * (retried per ADR-0031 §5 by SWR), writes through `useCommonMutation` (NEVER retried; the form
 * offers Retry for a retryable code), FE-03.
 */
export const PAYMENT_MODES_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/payment-modes' },
  export: { method: 'GET', path: '/api/v1/payment-modes/export' },
  detail: { method: 'GET', path: '/api/v1/payment-modes/:id' },
  create: { method: 'POST', path: '/api/v1/payment-modes' },
  update: { method: 'PATCH', path: '/api/v1/payment-modes/:id' },
  active: { method: 'PATCH', path: '/api/v1/payment-modes/:id/active' },
  remove: { method: 'DELETE', path: '/api/v1/payment-modes/:id' },
} as const;

export const PAYMENT_MODES_PATH = PAYMENT_MODES_ENDPOINTS.list.path satisfies ApiPath;
export const PAYMENT_MODES_EXPORT_PATH = PAYMENT_MODES_ENDPOINTS.export.path satisfies ApiPath;

/**
 * The export's columns in the api's order (erp-api `PAYMENT_MODES_EXPORT_COLUMNS`: Perfex's ID,
 * Name, Description and Active; no date column); `ListExport` types one label per column against
 * it. The usage and the credit-expense flag are never exported.
 */
export const PAYMENT_MODES_EXPORT_COLUMNS = ['id', 'name', 'description', 'active'] as const;
export type PaymentModesExportColumn = (typeof PAYMENT_MODES_EXPORT_COLUMNS)[number];

/** One record's path (its detail read, its update, its seed from the list row), the id encoded. */
export function paymentModesPath(id: string): ApiPath {
  return PAYMENT_MODES_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

/** The list's Active switch path for one record (D-34), the id encoded. */
export function paymentModeActivePath(id: string): ApiPath {
  return PAYMENT_MODES_ENDPOINTS.active.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

export const paymentModesHooks = createResourceHooks<PaymentModes, PaymentModesFormValues>(
  PAYMENT_MODES_PATH,
  paymentModesSchema,
);

/** The 400 whose problem body carries `issues` the form maps onto its fields. */
export const VALIDATION_CODE = 'ERP-VALIDATION-0001';

/**
 * The api's one not-found answer: a record that is not there, or one the caller may not read (the
 * same 404, so an id reveals nothing). A permalink to it says so in plain words (D-32).
 */
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

/**
 * The api's two delete refusals (409), defined beside `refusalOf` in the schema (this file imports
 * the schema, so the schema cannot import them from here): `IN_USE_CODE`, `ERP-PAYMENTMODES-0001`,
 * while any of the eight transactional columns uses the mode (D-33), and `CREDIT_MODE_CODE`,
 * `ERP-PAYMENTMODES-0002`, for the mode Perfex's `expense_credit_payment_mode` names (D-37). The
 * list refuses up front from the row and keeps the live answer for the race.
 */
export { CREDIT_MODE_CODE, IN_USE_CODE };

/**
 * The feature's own codes, each with a `payment-modes.errors.<code>` message: `useErrorText`
 * renders a refusal as `'errors.<code>'` of this namespace (messages/en.json), so the list, the
 * dialog and the save summary say it in the feature's words (D-32).
 */
export const PAYMENT_MODES_ERRORS: FeatureErrorCodes = {
  namespace: 'payment-modes',
  codes: [NOT_FOUND_CODE, IN_USE_CODE, CREDIT_MODE_CODE],
};
