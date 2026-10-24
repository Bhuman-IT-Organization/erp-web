import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';

import {
  leadStatusesSchema,
  type LeadStatuses,
  type LeadStatusesFormValues,
} from '../schemas/lead-statuses.schema';

export const LEAD_STATUSES_ENDPOINTS = {
  list: {
    method: 'GET',
    path: '/api/v1/lead-statuses',
  },
  export: {
    method: 'GET',
    path: '/api/v1/lead-statuses/export',
  },
  detail: {
    method: 'GET',
    path: '/api/v1/lead-statuses/:id',
  },
  create: {
    method: 'POST',
    path: '/api/v1/lead-statuses',
  },
  update: {
    method: 'PATCH',
    path: '/api/v1/lead-statuses/:id',
  },
  remove: {
    method: 'DELETE',
    path: '/api/v1/lead-statuses/:id',
  },
} as const;

export const LEAD_STATUSES_PATH = LEAD_STATUSES_ENDPOINTS.list.path satisfies ApiPath;

export const LEAD_STATUSES_EXPORT_PATH = LEAD_STATUSES_ENDPOINTS.export.path satisfies ApiPath;

export const LEAD_STATUSES_EXPORT_COLUMNS = [
  'id',
  'name',
  'statusorder',
  'color',
  'isdefault',
] as const;

export type LeadStatusesExportColumn = (typeof LEAD_STATUSES_EXPORT_COLUMNS)[number];

export function leadStatusesPath(id: string): ApiPath {
  return LEAD_STATUSES_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

export const leadStatusesHooks = createResourceHooks<LeadStatuses, LeadStatusesFormValues>(
  LEAD_STATUSES_PATH,
  leadStatusesSchema,
);

export const VALIDATION_CODE = 'ERP-VALIDATION-0001';

export const NOT_FOUND_CODE = 'ERP-CORE-0004';

export const IN_USE_CODE = 'ERP-LEADSTATUSES-0001';

export const BUILT_IN_CODE = 'ERP-LEADSTATUSES-0002';

export const DEFAULT_STATUS_CODE = 'ERP-LEADSTATUSES-0003';

export const LEAD_STATUSES_ERRORS: FeatureErrorCodes = {
  namespace: 'lead-statuses',
  codes: [NOT_FOUND_CODE, IN_USE_CODE, BUILT_IN_CODE, DEFAULT_STATUS_CODE],
};
