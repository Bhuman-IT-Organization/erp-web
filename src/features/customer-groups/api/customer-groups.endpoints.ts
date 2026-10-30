import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  customerGroupsSchema,
  type CustomerGroups,
  type CustomerGroupsFormValues,
} from '@/features/customer-groups/schemas/customer-groups.schema';

/** The wire contract: the six routes of erp-api `src/v1/customer-groups` (including export). */
export const CUSTOMER_GROUPS_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/customer-groups' },
  detail: { method: 'GET', path: '/api/v1/customer-groups/:id' },
  create: { method: 'POST', path: '/api/v1/customer-groups' },
  update: { method: 'PATCH', path: '/api/v1/customer-groups/:id' },
  remove: { method: 'DELETE', path: '/api/v1/customer-groups/:id' },
  export: { method: 'GET', path: '/api/v1/customer-groups/export' },
} as const;

export const CUSTOMER_GROUPS_PATH = CUSTOMER_GROUPS_ENDPOINTS.list.path satisfies ApiPath;
export const CUSTOMER_GROUPS_EXPORT_PATH = CUSTOMER_GROUPS_ENDPOINTS.export.path satisfies ApiPath;
export const CUSTOMER_GROUPS_EXPORT_COLUMNS = ['name'] as const;

export function customerGroupsPath(id: string): ApiPath {
  return CUSTOMER_GROUPS_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

export const customerGroupsHooks = createResourceHooks<CustomerGroups, CustomerGroupsFormValues>(
  CUSTOMER_GROUPS_PATH,
  customerGroupsSchema,
);

export const VALIDATION_CODE = 'ERP-VALIDATION-0001';
export const NOT_FOUND_CODE = 'ERP-CORE-0004';
export const IN_USE_CODE = 'ERP-CUSTOMERGROUPS-0001';

export const CUSTOMER_GROUPS_ERRORS: FeatureErrorCodes = {
  namespace: 'customer-groups',
  codes: [NOT_FOUND_CODE, IN_USE_CODE],
};
