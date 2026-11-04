import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  fixedEquipmentDepreciationsSchema,
  type FixedEquipmentDepreciations,
  type FixedEquipmentDepreciationsBody,
} from '@/features/fixed-equipment-depreciations/schemas/fixed-equipment-depreciations.schema';

/**
 * The resource's wire contract: every call this feature makes, method and path (erp-api
 * `src/v1/fixed-equipment-depreciations`). The list answers `{ data, meta }` (BE-19;
 * `ListPageTemplate` reads it); a record is `GET|PATCH …/:id`, a new one `POST` (body
 * `{ name, term }`), a delete `DELETE …/:id` (204, 404, or a 409 refusal).
 *
 * No axios import, no raw transport here: reads go through `useCommonApi` (retried per ADR-0031 §5
 * by SWR), writes through `useCommonMutation` (NEVER retried), FE-03.
 */
export const FIXED_EQUIPMENT_DEPRECIATIONS_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/fixed-equipment-depreciations' },
  export: { method: 'GET', path: '/api/v1/fixed-equipment-depreciations/export' },
  detail: { method: 'GET', path: '/api/v1/fixed-equipment-depreciations/:id' },
  create: { method: 'POST', path: '/api/v1/fixed-equipment-depreciations' },
  update: { method: 'PATCH', path: '/api/v1/fixed-equipment-depreciations/:id' },
  remove: { method: 'DELETE', path: '/api/v1/fixed-equipment-depreciations/:id' },
} as const;

export const FIXED_EQUIPMENT_DEPRECIATIONS_PATH = FIXED_EQUIPMENT_DEPRECIATIONS_ENDPOINTS.list
  .path satisfies ApiPath;

/** One record's path (its detail read, its update, its seed from the list row), the id encoded. */
export function fixedEquipmentDepreciationsPath(id: string): ApiPath {
  return FIXED_EQUIPMENT_DEPRECIATIONS_ENDPOINTS.detail.path.replace(
    ':id',
    encodeURIComponent(id),
  ) as ApiPath;
}

export const fixedEquipmentDepreciationsHooks = createResourceHooks<
  FixedEquipmentDepreciations,
  FixedEquipmentDepreciationsBody
>(FIXED_EQUIPMENT_DEPRECIATIONS_PATH, fixedEquipmentDepreciationsSchema);

export const FIXED_EQUIPMENT_DEPRECIATIONS_EXPORT_PATH = FIXED_EQUIPMENT_DEPRECIATIONS_ENDPOINTS
  .export.path satisfies ApiPath;

/** The export's columns in the api's order (erp-api's export columns): Perfex's three. */
export const FIXED_EQUIPMENT_DEPRECIATIONS_EXPORT_COLUMNS = ['id', 'name', 'term'] as const;
export type FixedEquipmentDepreciationsExportColumn =
  (typeof FIXED_EQUIPMENT_DEPRECIATIONS_EXPORT_COLUMNS)[number];

/** The 400 whose problem body carries `issues` the form maps onto its fields. */
export const VALIDATION_CODE = 'ERP-VALIDATION-0001';

/** The api's one not-found answer: a record that is not there, or one the caller may not read. */
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

/** The two 409 refusals of a delete: 0001 the depreciation is still in use; 0002 its use could not be checked. */
export const DELETE_REFUSED_CODES = [
  'ERP-FIXEDEQUIPMENTDEPRECIATIONS-0001',
  'ERP-FIXEDEQUIPMENTDEPRECIATIONS-0002',
] as const;

/**
 * The feature's own codes, each with a `fixed-equipment-depreciations.errors.<code>` message:
 * `useErrorText` reads them. Perfex has no unique-name rule, so the save has no "name taken" code.
 */
export const FIXED_EQUIPMENT_DEPRECIATIONS_ERRORS: FeatureErrorCodes = {
  namespace: 'fixed-equipment-depreciations',
  codes: [NOT_FOUND_CODE, ...DELETE_REFUSED_CODES],
};
