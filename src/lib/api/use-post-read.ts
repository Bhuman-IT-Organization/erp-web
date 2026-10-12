import useSWR, { type SWRConfiguration } from 'swr';
import { z } from 'zod';
import { ApiError } from './api-error';
import { callApi, type ApiPath } from './call-api';
import type { CommonApiResult } from './use-common-api';

/**
 * A read that must be a POST (the mail preview renders a draft). Keyed on path plus the serialised
 * body; never from an effect.
 *
 * 04.3 PATTERNS M7: `useCommonApi` keys a GET, and `useCommonMutation` is a write that is never
 * retried, so a rendered preview of an unsaved draft has no door without this one. This is still
 * the FE-03 read door: the request runs inside SWR under the global policy `SwrProvider` mounts
 * (a 5xx, a timeout or a network failure retried, a 4xx never; `callApi` itself never retries), and
 * a component asks for it by rendering, never from `useEffect` (FE-04).
 *
 * - The key is `['post', path, JSON.stringify(body)]`: the same draft twice is one request (a
 *   cache hit), a changed draft another. Callers build `body` with a fixed key order.
 * - `path === null` or `body === null` asks nothing (`isLoading` false). The body is any JSON
 *   object (not a type parameter: it is used once, so the caller's own type already checks it).
 * - `isLoading` is `useCommonApi`'s: SWR's AND no error yet (D-39).
 * - `keepPreviousData` defaults to true: the old preview stays on screen while the new one loads.
 *
 * Writes never come through here; the mail preview is the first user.
 */
export function usePostRead<T>(
  path: ApiPath | null,
  schema: z.ZodType<T>,
  body: object | null,
  options?: SWRConfiguration<T, ApiError>,
): CommonApiResult<T> {
  const key =
    path === null || body === null ? null : (['post', path, JSON.stringify(body)] as const);
  const { data, error, isLoading, isValidating, mutate } = useSWR<
    T,
    ApiError,
    readonly ['post', ApiPath, string] | null
  >(
    key,
    async ([, url]) => {
      const result = await callApi(url, { method: 'POST', body, schema });
      if (!result.ok) {
        throw new ApiError(
          result.status,
          result.code,
          result.retryAfterS,
          undefined,
          result.issues,
        );
      }
      return result.data;
    },
    { keepPreviousData: true, ...options },
  );
  return { data, error, isLoading: isLoading && error === undefined, isValidating, mutate };
}
