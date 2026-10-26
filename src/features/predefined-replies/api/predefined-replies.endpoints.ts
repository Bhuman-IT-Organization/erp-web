import type { ApiPath } from '@/lib/api/call-api';
import { useCommonMutation } from '@/lib/api/use-common-mutation';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  predefinedRepliesSchema,
  type PredefinedReplies,
  type PredefinedRepliesFormValues,
} from '@/features/predefined-replies/schemas/predefined-replies.schema';
import { z } from 'zod';

export const PREDEFINED_REPLIES_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/predefined-replies' },
  detail: { method: 'GET', path: '/api/v1/predefined-replies/:id' },
  create: { method: 'POST', path: '/api/v1/predefined-replies' },
  update: { method: 'PATCH', path: '/api/v1/predefined-replies/:id' },
  delete: { method: 'DELETE', path: '/api/v1/predefined-replies/:id' },
} as const;

export const PREDEFINED_REPLIES_PATH = PREDEFINED_REPLIES_ENDPOINTS.list.path satisfies ApiPath;

export function predefinedRepliesPath(id: string): ApiPath {
  return PREDEFINED_REPLIES_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

const predefinedReplyDeleteSchema = z.object({
  success: z.literal(true),
});

const resourceHooks = createResourceHooks<PredefinedReplies, PredefinedRepliesFormValues>(
  PREDEFINED_REPLIES_PATH,
  predefinedRepliesSchema,
);

export const predefinedRepliesHooks = {
  ...resourceHooks,
  useRemove: (id: string) =>
    useCommonMutation<undefined, { success: true }>(
      `${PREDEFINED_REPLIES_PATH}/${encodeURIComponent(id)}` as ApiPath,
      {
        method: 'DELETE',
        schema: predefinedReplyDeleteSchema,
        invalidate: [PREDEFINED_REPLIES_PATH],
      },
    ),
};

export const VALIDATION_CODE = 'ERP-VALIDATION-0001';
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

export const PREDEFINED_REPLIES_ERRORS: FeatureErrorCodes = {
  namespace: 'predefined-replies',
  codes: [NOT_FOUND_CODE],
};
