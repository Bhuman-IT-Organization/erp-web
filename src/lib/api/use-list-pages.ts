import useSWRInfinite from 'swr/infinite';
import type { z } from 'zod';
import type { ApiError } from './api-error';
import { swrFetcher, type ApiPath } from './call-api';
import { apiKey, type Params } from './keys';
import { listSchema, type ListPage } from './use-common-api';

/**
 * A BE-19 keyset list read page after page, for a picker that grows ("Show more results", K7): the
 * same string keys (`apiKey`) and the same fetcher (`swrFetcher(listSchema(schema))`) as `useList`,
 * so the global retry policy applies, through `useSWRInfinite`. Page one asks `limit` with no cursor;
 * each next page asks the previous page's `meta.nextCursor`, and a `null` cursor ends the list.
 * `path === null` requests nothing (a closed popover). Loading more never re-reads page one
 * (`revalidateFirstPage: false`). `isLoading` follows `useCommonApi`'s D-39 meaning: never once an
 * error is known.
 */
export interface ListPages<T> {
  readonly rows: readonly T[];
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  readonly isLoading: boolean;
  readonly isLoadingMore: boolean;
  readonly error: ApiError | undefined;
  readonly retry: () => void;
}

/** The rows of every page loaded so far, `pageSize` at a time, with `params` on each page. */
export function useListPages<T>(
  path: ApiPath | null,
  schema: z.ZodType<T>,
  params: Params,
  pageSize: number,
): ListPages<T> {
  const { data, error, isLoading, size, setSize, mutate } = useSWRInfinite<ListPage<T>, ApiError>(
    (index: number, previous: ListPage<T> | null) => {
      if (path === null) return null;
      if (index === 0) return apiKey(path, { ...params, limit: pageSize });
      const cursor = previous?.meta.nextCursor ?? null;
      return cursor === null ? null : apiKey(path, { ...params, limit: pageSize, cursor });
    },
    swrFetcher(listSchema(schema)),
    { revalidateFirstPage: false },
  );
  const pages = data ?? [];
  const last = pages.at(-1);
  return {
    rows: pages.flatMap((page) => page.data),
    hasMore: last !== undefined && last.meta.nextCursor !== null,
    loadMore: () => {
      void setSize(size + 1);
    },
    isLoading: isLoading && error === undefined,
    isLoadingMore: pages.length > 0 && size > pages.length && error === undefined,
    error,
    retry: () => {
      void mutate();
    },
  };
}
