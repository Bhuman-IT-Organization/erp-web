import type { SWRConfiguration } from 'swr';
import { z } from 'zod';
import type { ApiError } from './api-error';
import type { ApiPath } from './call-api';
import type { Params } from './keys';
import { useCommonApi, useList, type CommonApiResult, type ListPage } from './use-common-api';
import { useCommonMutation, type CommonMutation } from './use-common-mutation';

/**
 * The resource hook factory (FE-03): one call per REST resource gives a feature its five hooks,
 * reads over `useCommonApi` (retried per ADR-0031 §5) and writes over `useCommonMutation` (never
 * retried), every write invalidating the resource's prefix so each cached page refreshes.
 * The template's example feature is the first caller.
 */
export interface ResourceHooks<T, TCreate, TUpdate> {
  readonly useList: (
    params?: Params,
    options?: SWRConfiguration<ListPage<T>, ApiError>,
  ) => CommonApiResult<ListPage<T>>;
  /** `id === null` makes no request (SWR skips a `null` key). */
  readonly useOne: (
    id: string | null,
    options?: SWRConfiguration<T, ApiError>,
  ) => CommonApiResult<T>;
  readonly useCreate: () => CommonMutation<TCreate, T>;
  readonly useUpdate: (id: string) => CommonMutation<TUpdate, T>;
  readonly useRemove: (id: string) => CommonMutation<undefined, null>;
}

export function createResourceHooks<T, TCreate = Partial<T>, TUpdate = Partial<T>>(
  base: ApiPath,
  schema: z.ZodType<T>,
): ResourceHooks<T, TCreate, TUpdate> {
  const one = (id: string): ApiPath => `${base}/${encodeURIComponent(id)}`;
  return {
    useList: (params, options) => useList(base, schema, params, options),
    useOne: (id, options) => {
      // A null id becomes a null key: SWR makes no request and returns no data.
      const { data, error, isLoading, isValidating, mutate } = useCommonApi(
        id === null ? null : one(id),
        schema,
        undefined,
        options,
      );
      return { data, error, isLoading, isValidating, mutate };
    },
    useCreate: () =>
      useCommonMutation<TCreate, T>(base, { method: 'POST', schema, invalidate: [base] }),
    useUpdate: (id) =>
      useCommonMutation<TUpdate, T>(one(id), { method: 'PATCH', schema, invalidate: [base] }),
    useRemove: (id) =>
      useCommonMutation<undefined, null>(one(id), {
        method: 'DELETE',
        schema: z.null(),
        expectNoContent: true,
        invalidate: [base],
      }),
  };
}
