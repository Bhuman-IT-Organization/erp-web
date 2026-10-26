import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  contractTypesSchema,
  type ContractTypes,
  type ContractTypesFormValues,
} from '@/features/contract-types/schemas/contract-types.schema';

/**
 * The resource's wire contract: every call this feature makes, method and path. The api half is
 * erp-api `src/v1/contract-types` which serves exactly these six routes. The list,
 * `GET …?q&sort&limit&cursor`, answers `{ data: ContractTypes[], meta: { nextCursor, prevCursor,
 * total, rangeStart, exportLimit, printLimit } }` (BE-19; `ListPageTemplate` reads it), the id
 * descending by default (Perfex's order); a row is the whole record: the contract type, its Date
 * Created (an instant, or `null` when Perfex stored none) and its usage groups (so a delete is
 * refused up front, D-07, D-28). A record is `GET|PATCH …/:id`, a new one `POST` (the body
 * `{ name }`), the export `GET …/export` with the list's query and one `header` per column (D-26,
 * D-42, ADR-0043), and a delete `DELETE …/:id` (204, 404, or 409 while in use).
 *
 * No axios import, no raw transport, no duration literal here: reads go through `useCommonApi`
 * (retried per ADR-0031 §5 by SWR), writes through `useCommonMutation` (NEVER retried; the form
 * offers Retry for a retryable code), FE-03.
 */
export const CONTRACT_TYPES_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/contract-types' },
  export: { method: 'GET', path: '/api/v1/contract-types/export' },
  detail: { method: 'GET', path: '/api/v1/contract-types/:id' },
  create: { method: 'POST', path: '/api/v1/contract-types' },
  update: { method: 'PATCH', path: '/api/v1/contract-types/:id' },
  remove: { method: 'DELETE', path: '/api/v1/contract-types/:id' },
} as const;

export const CONTRACT_TYPES_PATH = CONTRACT_TYPES_ENDPOINTS.list.path satisfies ApiPath;
export const CONTRACT_TYPES_EXPORT_PATH = CONTRACT_TYPES_ENDPOINTS.export.path satisfies ApiPath;

/**
 * The export's columns in the api's order (erp-api's export columns: Perfex's ID, Contract Type Name
 * and Date Created); `ListExport` types one label per column against it. The usage is never exported.
 */
export const CONTRACT_TYPES_EXPORT_COLUMNS = ['id', 'name', 'dateCreated'] as const;
export type ContractTypesExportColumn = (typeof CONTRACT_TYPES_EXPORT_COLUMNS)[number];

/** One record's path (its detail read, its update, its seed from the list row), the id encoded. */
export function contractTypesPath(id: string): ApiPath {
  return CONTRACT_TYPES_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

export const contractTypesHooks = createResourceHooks<ContractTypes, ContractTypesFormValues>(
  CONTRACT_TYPES_PATH,
  contractTypesSchema,
);

/** The 400 whose problem body carries `issues` the form maps onto its fields. */
export const VALIDATION_CODE = 'ERP-VALIDATION-0001';

/**
 * The api's one not-found answer: a record that is not there, or one the caller may not read (the
 * same 404, so an id reveals nothing). A permalink to it says so in plain words (D-32).
 */
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

/**
 * The api's refusal of a delete while anything still uses the contract type: purchase requests,
 * purchase orders, purchase quotations, shipping charges, expenses or assets (409, D-07, D-28). The
 * list refuses up front from the row's usage (`refusedCode`) and keeps the live answer for the race.
 */
export const IN_USE_CODE = 'ERP-CONTRACTTYPES-0001';

/**
 * The feature's own codes, each with an `contract-types.errors.<code>` message: `useErrorText` renders
 * a refusal as `'errors.<code>'` of this namespace (messages/en.json), so the list, the dialog and
 * the save summary say it in the feature's words (D-32).
 */
export const CONTRACT_TYPES_ERRORS: FeatureErrorCodes = {
  namespace: 'contract-types',
  codes: [NOT_FOUND_CODE, IN_USE_CODE],
};
