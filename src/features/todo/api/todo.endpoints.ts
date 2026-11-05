import type { ApiPath } from '@/lib/api/call-api';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';

/** The wire contract of the To Do screen: every call, method and path (erp-api `src/v1/todos`). */
export const TODOS_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/todo' },
  detail: { method: 'GET', path: '/api/v1/todo/:id' },
  create: { method: 'POST', path: '/api/v1/todo' },
  update: { method: 'PATCH', path: '/api/v1/todo/:id' },
  finish: { method: 'PATCH', path: '/api/v1/todo/:id/finished' },
  remove: { method: 'DELETE', path: '/api/v1/todo/:id' },
} as const;

export const TODOS_PATH = TODOS_ENDPOINTS.list.path satisfies ApiPath;

/** Perfex shows 20 per "Load more". */
export const TODOS_PAGE_SIZE = 20;

export type TodoStatus = 'unfinished' | 'finished';

export function todosPath(id: string): ApiPath {
  return TODOS_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

export function todoFinishedPath(id: string): ApiPath {
  return TODOS_ENDPOINTS.finish.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

/** One page of one panel; `cursor` is the previous page's `meta.nextCursor`. */
export function todosListPath(status: TodoStatus, cursor: string | null): ApiPath {
  const query = new URLSearchParams({ status, limit: String(TODOS_PAGE_SIZE) });
  if (cursor !== null) query.set('cursor', cursor);
  return `${TODOS_PATH}?${query.toString()}` as ApiPath;
}

export const VALIDATION_CODE = 'ERP-VALIDATION-0001';
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

export const TODOS_ERRORS: FeatureErrorCodes = {
  namespace: 'todo',
  codes: [NOT_FOUND_CODE],
};
