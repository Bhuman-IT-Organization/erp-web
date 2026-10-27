import type { ApiPath, ApiResult } from '@/lib/api/call-api';
import { callApi } from '@/lib/api/call-api';
import { ApiError } from '@/lib/api/api-error';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import { z } from 'zod';

const MAX_NAME_LENGTH = 50;

export const ticketPrioritiesSchema = z.object({
  id: z.number(),
  name: z.string().min(1, 'Name is required').max(MAX_NAME_LENGTH),
});

export type Priority = z.infer<typeof ticketPrioritiesSchema>;
export interface CreatePriorityInput {
  name: string;
}
export type UpdatePriorityInput = CreatePriorityInput;

export const TICKET_PRIORITIES_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/ticket-priorities' },
  detail: { method: 'GET', path: '/api/v1/ticket-priorities/:id' },
  create: { method: 'POST', path: '/api/v1/ticket-priorities' },
  update: { method: 'PATCH', path: '/api/v1/ticket-priorities/:id' },
  remove: { method: 'DELETE', path: '/api/v1/ticket-priorities/:id' },
} as const;

export const TICKET_PRIORITIES_PATH = TICKET_PRIORITIES_ENDPOINTS.list.path satisfies ApiPath;

export function ticketPrioritiesPath(id: string | number): ApiPath {
  return TICKET_PRIORITIES_ENDPOINTS.detail.path.replace(
    ':id',
    encodeURIComponent(String(id)),
  ) as ApiPath;
}

export const ticketPrioritiesHooks = createResourceHooks<Priority, CreatePriorityInput>(
  TICKET_PRIORITIES_PATH,
  ticketPrioritiesSchema,
);

const listSchema = z.object({ data: z.array(ticketPrioritiesSchema) });

async function unwrap<T>(pending: Promise<ApiResult<T>>): Promise<T> {
  const r = await pending;
  if (!r.ok) throw new ApiError(r.status, r.code, r.retryAfterS, undefined, r.issues);
  return r.data;
}

export const prioritiesApi = {
  list: async (): Promise<Priority[]> => {
    const res = await unwrap(callApi(TICKET_PRIORITIES_PATH, { schema: listSchema }));
    return res.data;
  },
  getById: (id: string | number): Promise<Priority> =>
    unwrap(callApi(ticketPrioritiesPath(id), { schema: ticketPrioritiesSchema })),
  create: (data: CreatePriorityInput): Promise<Priority> =>
    unwrap(
      callApi(TICKET_PRIORITIES_PATH, {
        method: 'POST',
        body: data,
        schema: ticketPrioritiesSchema,
      }),
    ),
  update: (id: string | number, data: UpdatePriorityInput): Promise<Priority> =>
    unwrap(
      callApi(ticketPrioritiesPath(id), {
        method: 'PATCH',
        body: data,
        schema: ticketPrioritiesSchema,
      }),
    ),
  delete: async (id: string | number): Promise<void> => {
    await unwrap(
      callApi(ticketPrioritiesPath(id), {
        method: 'DELETE',
        schema: z.null(),
        expectNoContent: true,
      }),
    );
  },
};

export const NOT_FOUND_CODE = 'ERP-CORE-0004';
export const NAME_TAKEN_CODE = 'ERP-TICKET-PRIORITIES-0001';

export const TICKET_PRIORITIES_ERRORS: FeatureErrorCodes = {
  namespace: 'ticketPriorities',
  codes: [NOT_FOUND_CODE, NAME_TAKEN_CODE],
};
