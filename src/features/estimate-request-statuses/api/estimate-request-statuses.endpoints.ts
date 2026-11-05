import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  estimateRequestStatusSchema,
  type EstimateRequestStatus,
  type EstimateRequestStatusWriteValues,
} from '@/features/estimate-request-statuses/schemas/estimate-request-statuses.schema';

export const ESTIMATE_REQUEST_STATUSES_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/estimate-request-statuses' },
  export: { method: 'GET', path: '/api/v1/estimate-request-statuses/export' },
  detail: { method: 'GET', path: '/api/v1/estimate-request-statuses/:id' },
  create: { method: 'POST', path: '/api/v1/estimate-request-statuses' },
  update: { method: 'PATCH', path: '/api/v1/estimate-request-statuses/:id' },
  remove: { method: 'DELETE', path: '/api/v1/estimate-request-statuses/:id' },
} as const;

export const ESTIMATE_REQUEST_STATUSES_PATH = ESTIMATE_REQUEST_STATUSES_ENDPOINTS.list
  .path satisfies ApiPath;
export const ESTIMATE_REQUEST_STATUSES_EXPORT_PATH = ESTIMATE_REQUEST_STATUSES_ENDPOINTS.export
  .path satisfies ApiPath;
export const ESTIMATE_REQUEST_STATUSES_EXPORT_COLUMNS = ['id', 'name', 'total_request'] as const;
export type EstimateRequestStatusesExportColumn =
  (typeof ESTIMATE_REQUEST_STATUSES_EXPORT_COLUMNS)[number];

export function estimateRequestStatusesPath(id: string): ApiPath {
  return ESTIMATE_REQUEST_STATUSES_ENDPOINTS.detail.path.replace(
    ':id',
    encodeURIComponent(id),
  ) as ApiPath;
}

export const estimateRequestStatusesHooks = createResourceHooks<
  EstimateRequestStatus,
  EstimateRequestStatusWriteValues,
  EstimateRequestStatusWriteValues
>(ESTIMATE_REQUEST_STATUSES_PATH, estimateRequestStatusSchema);

export const VALIDATION_CODE = 'ERP-VALIDATION-0001';
export const NOT_FOUND_CODE = 'ERP-CORE-0004';
export const IN_USE_CODE = 'ERP-ESTIMATEREQUESTSTATUSES-0001';
export const BUILT_IN_CODE = 'ERP-ESTIMATEREQUESTSTATUSES-0002';

export const ESTIMATE_REQUEST_STATUSES_ERRORS: FeatureErrorCodes = {
  namespace: 'estimate-request-statuses',
  codes: [NOT_FOUND_CODE, IN_USE_CODE, BUILT_IN_CODE],
};
