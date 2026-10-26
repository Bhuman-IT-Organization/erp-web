import useSWR, { type KeyedMutator, type SWRConfiguration } from 'swr';
import { z } from 'zod';
import type { ApiError } from './api-error';
import { swrFetcher, type ApiPath } from './call-api';
import { apiKey, type Params } from './keys';

/**
 * The READ hook (FE-03): `useSWR(apiKey(path, params), swrFetcher(schema))` under the global
 * policy `SwrProvider` mounts (ADR-0031 §5 — a 5xx, a timeout or a network failure is retried
 * with full-jitter delays, a 4xx never; axios itself never retries). The key is the canonical
 * URL string from `keys.ts`, so a mutation can revalidate every page of a resource by prefix.
 *
 * Reads never call `callApi` directly (they would lose the retry policy and the cache); writes
 * never go through `swrFetcher` (they must not be retried) — see `use-common-mutation.ts`.
 * A hook file carries no `'use client'` directive; the component that calls it does.
 *
 * **`isLoading` means "the first answer is still unknown" (D-39).** SWR's own `isLoading` turns true
 * again on EVERY revalidation while there is no data — including its automatic 5xx retries — so a
 * consumer following the `isLoading` → error → empty → loaded precedence flickered skeleton → error
 * → skeleton through an outage. Here `isLoading` is SWR's AND no error yet: once a failure is known
 * it stays shown through the retries until data arrives. `isValidating` is SWR's, unchanged — the
 * "a retry is in flight" signal (a busy Retry button).
 */
export interface CommonApiResult<T> {
  readonly data: T | undefined;
  readonly error: ApiError | undefined;
  /** True only while the first answer is unknown: never once an error is known (D-39). */
  readonly isLoading: boolean;
  readonly isValidating: boolean;
  readonly mutate: KeyedMutator<T>;
}

/**
 * `path === null` is the conditional-fetch idiom: a `null` key makes SWR skip the request.
 * `headers` (opt-in, 04.7-12) ride every request of the read, and the key becomes
 * `[url, headers]`: a read addressed by a header is cached per header value while its URL stays
 * free of it. Absent: today's string key.
 */
export function useCommonApi<T>(
  path: ApiPath | null,
  schema: z.ZodType<T>,
  params?: Params,
  options?: SWRConfiguration<T, ApiError>,
  headers?: Readonly<Record<string, string>>,
): CommonApiResult<T> {
  const url = path === null ? null : apiKey(path, params);
  const { data, error, isLoading, isValidating, mutate } = useSWR<T, ApiError>(
    url === null || headers === undefined ? url : [url, headers],
    swrFetcher(schema, headers),
    options,
  );
  return { data, error, isLoading: isLoading && error === undefined, isValidating, mutate };
}

/**
 * The BE-19 list envelope. `nextCursor` is `null` on the last page, `prevCursor` on the first;
 * `total` is every row matching the filters and `q`, `rangeStart` the 1-based rank of the first row
 * (0 on an empty page) — the pager's "Showing 26–50 of 1,240" (D-17).
 *
 * The three newer keys are DEFAULTED or OPTIONAL, never required, so this parses whichever api is
 * deployed: an older one that sends only `{ nextCursor }` reads as "no previous page, no total"
 * (03.2 PATTERNS correction 5). A consumer shows the range only when both numbers are present.
 */
export interface ListPage<T> {
  readonly data: readonly T[];
  readonly meta: {
    readonly nextCursor: string | null;
    readonly prevCursor: string | null;
    readonly total?: number | undefined;
    readonly rangeStart?: number | undefined;
    /** The most rows the list's CSV export answers (03.2 lead decision 2); absent from an older api. */
    readonly exportLimit?: number | undefined;
    /** The most rows the list's PDF and Print answer (4.1.1 D-06); absent from an older api. */
    readonly printLimit?: number | undefined;
    /** A list's deployment settings (4.7 plan 23), unparsed; most lists send none. */
    readonly options?: Readonly<Record<string, unknown>> | undefined;
  };
}

export function listSchema<T>(item: z.ZodType<T>): z.ZodType<ListPage<T>> {
  return z.object({
    data: z.array(item).readonly(),
    meta: z.object({
      nextCursor: z.string().nullable(),
      prevCursor: z.string().nullable().default(null),
      total: z.number().int().nonnegative().optional(),
      rangeStart: z.number().int().nonnegative().optional(),
      exportLimit: z.number().int().positive().optional(),
      printLimit: z.number().int().positive().optional(),
      options: z.record(z.string(), z.unknown()).optional(),
    }),
  });
}

/** `useCommonApi` over the list envelope: `data.data` is the page, `data.meta.nextCursor` the cursor. */
export function useList<T>(
  path: ApiPath | null,
  item: z.ZodType<T>,
  params?: Params,
  options?: SWRConfiguration<ListPage<T>, ApiError>,
): CommonApiResult<ListPage<T>> {
  return useCommonApi(path, listSchema(item), params, options);
}
