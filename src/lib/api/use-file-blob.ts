import useSWR from 'swr';
import { ApiError } from './api-error';
import type { ApiPath } from './call-api';
import { fetchBlob } from './download-file';

/** `fetchBlob` that throws an `ApiError`, so SWR's retry policy sees the status (as `swrFetcher`). */
async function blobFetcher(path: ApiPath): Promise<Blob> {
  const result = await fetchBlob(path);
  if (!result.ok) {
    throw new ApiError(result.status, result.code, result.retryAfterS, undefined, result.issues);
  }
  return result.data;
}

/**
 * The bytes of an api-only file (PATTERNS M7) through SWR, keyed on the path: two thumbnails of one
 * file share one request, and a revisit is a cache hit. Bytes do not change under a path, so a
 * window focus does not re-read them. `isLoading` has `useCommonApi`'s D-39 meaning.
 */
export function useFileBlob(path: ApiPath | null): {
  readonly blob: Blob | undefined;
  readonly error: ApiError | undefined;
  readonly isLoading: boolean;
} {
  const { data, error, isLoading } = useSWR<Blob, ApiError>(path, blobFetcher, {
    revalidateOnFocus: false,
  });
  return { blob: data, error, isLoading: isLoading && error === undefined };
}
