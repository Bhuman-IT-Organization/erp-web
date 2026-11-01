import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  predefinedRepliesSchema,
  type PredefinedReplies,
  type PredefinedRepliesFormValues,
} from '@/features/predefined-replies/schemas/predefined-replies.schema';

export const PREDEFINED_REPLIES_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/predefined-replies' },
  detail: { method: 'GET', path: '/api/v1/predefined-replies/:id' },
  create: { method: 'POST', path: '/api/v1/predefined-replies' },
  update: { method: 'PATCH', path: '/api/v1/predefined-replies/:id' },
  delete: { method: 'DELETE', path: '/api/v1/predefined-replies/:id' },
} as const;

export const PREDEFINED_REPLIES_PATH = PREDEFINED_REPLIES_ENDPOINTS.list.path satisfies ApiPath;

export const PREDEFINED_REPLIES_EXPORT_PATH = '/api/v1/predefined-replies/export' satisfies ApiPath;

export const PREDEFINED_REPLIES_EXPORT_COLUMNS = ['name'] as const;

export function predefinedRepliesPath(id: string): ApiPath {
  return PREDEFINED_REPLIES_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

const resourceHooks = createResourceHooks<PredefinedReplies, PredefinedRepliesFormValues>(
  PREDEFINED_REPLIES_PATH,
  predefinedRepliesSchema,
);

export const predefinedRepliesHooks = resourceHooks;

export const VALIDATION_CODE = 'ERP-VALIDATION-0001';
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

export const PREDEFINED_REPLIES_ERRORS: FeatureErrorCodes = {
  namespace: 'predefined-replies',
  codes: [NOT_FOUND_CODE],
};
