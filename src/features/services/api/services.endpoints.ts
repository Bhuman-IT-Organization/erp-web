import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  servicesSchema,
  type Services,
  type ServicesFormValues,
} from '@/features/services/schemas/services.schema';

/**
 * The resource's wire contract: every call this feature makes, method and path. The api half is
 * erp-api `src/v1/services`. A row is the whole record: `{ id, name }`. A delete is `DELETE …/:id`
 * (204, 404, or 409 while a ticket uses the service).
 * Export is supported through GET /api/v1/services/export.
 */
export const SERVICES_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/services' },
  export: { method: 'GET', path: '/api/v1/services/export' },
  detail: { method: 'GET', path: '/api/v1/services/:id' },
  create: { method: 'POST', path: '/api/v1/services' },
  update: { method: 'PATCH', path: '/api/v1/services/:id' },
  remove: { method: 'DELETE', path: '/api/v1/services/:id' },
} as const;

export const SERVICES_PATH = SERVICES_ENDPOINTS.list.path satisfies ApiPath;
export const SERVICES_EXPORT_PATH = SERVICES_ENDPOINTS.export.path satisfies ApiPath;

/**
 * The export's columns in the api's order (erp-api's export columns: Perfex's ID, Service Name);
 * `ListExport` types one label per column against it. The usage is never exported.
 */
export const SERVICES_EXPORT_COLUMNS = ['id', 'name'] as const;
export type ServicesExportColumn = (typeof SERVICES_EXPORT_COLUMNS)[number];

/** One record's path, the id encoded. */
export function servicesPath(id: string): ApiPath {
  return SERVICES_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

export const servicesHooks = createResourceHooks<Services, ServicesFormValues>(
  SERVICES_PATH,
  servicesSchema,
);

/** The 400 whose problem body carries `issues` the form maps onto its fields. */
export const VALIDATION_CODE = 'ERP-VALIDATION-0001';

/** The api's one not-found answer. */
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

/** The delete refused while a ticket uses the service (409). MUST equal the code the api module throws. */
export const IN_USE_CODE = 'ERP-SERVICES-0001';

export const SERVICES_ERRORS: FeatureErrorCodes = {
  namespace: 'services',
  codes: [NOT_FOUND_CODE, IN_USE_CODE],
};
