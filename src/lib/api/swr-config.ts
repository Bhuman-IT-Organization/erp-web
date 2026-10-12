import type { SWRConfiguration } from 'swr';
import { ApiError, HTTP_UNAUTHORIZED } from './api-error';
import { CLIENT_TIMINGS } from './client-timings';
import { getSessionStatus } from '@/lib/auth/session';

/**
 * The SWR global policy (ADR-0031 §5): reads retry a 5xx, a timeout or a network failure at
 * most `errorRetryCount` times with full-jitter exponential delays capped at `errorRetryMaxMs`,
 * NEVER a 4xx (save a 401 the tab has just renewed its session for, re-run at once within the same
 * `errorRetryCount`: `isRenewed401`), and dedupe / focus-throttle from `CLIENT_TIMINGS`. Mounted once by `SwrProvider`
 * in the root layout; every Phase 3 hook inherits it. Mutations do not go through SWR's retry at
 * all (`callApi` never retries; the UI offers a retry action).
 *
 * SWR's own `errorRetryInterval` is unused: `onErrorRetry` replaces SWR's default scheduling,
 * so the delay comes from `retryDelayMs` and `CLIENT_TIMINGS.swr`, not from that option.
 */
export function shouldRetry(error: unknown): boolean {
  return error instanceof ApiError && (error.retryable || isRenewed401(error));
}

/**
 * A 401 the tab survived (quick task fix/quick-session-refresh): `http.ts` delivers a 401 only after
 * the tab's one refresh settled, so if the tab is STILL signed in the session was renewed and the
 * read deserves one more run with the new bearer, at once. A refused refresh has marked the tab
 * signed out, and then it is not retried: the session ended, exactly as before.
 */
function isRenewed401(error: ApiError): boolean {
  return error.status === HTTP_UNAUTHORIZED && getSessionStatus() === 'signedIn';
}

/** Full jitter: `random() * min(errorRetryMaxMs, errorRetryBaseMs * 2 ** retryCount)`. */
export function retryDelayMs(retryCount: number, random: () => number = Math.random): number {
  const { errorRetryBaseMs, errorRetryMaxMs } = CLIENT_TIMINGS.swr;
  return random() * Math.min(errorRetryMaxMs, errorRetryBaseMs * 2 ** retryCount);
}

export interface OnErrorRetryDeps {
  setTimeout?: (fn: () => void, ms: number) => unknown;
  random?: () => number;
}

export function onErrorRetry(
  error: unknown,
  _key: string,
  config: { errorRetryCount?: number | undefined },
  revalidate: (opts: { retryCount: number }) => unknown,
  opts: { retryCount: number },
  deps: OnErrorRetryDeps = {},
): void {
  if (!shouldRetry(error)) return;
  const max = config.errorRetryCount ?? CLIENT_TIMINGS.swr.errorRetryCount;
  if (opts.retryCount >= max) return;
  const schedule = deps.setTimeout ?? globalThis.setTimeout;
  const renewed = error instanceof ApiError && isRenewed401(error);
  schedule(
    () => {
      void revalidate({ retryCount: opts.retryCount + 1 });
    },
    renewed ? 0 : retryDelayMs(opts.retryCount, deps.random),
  );
}

export const SWR_GLOBAL_CONFIG: SWRConfiguration = {
  errorRetryCount: CLIENT_TIMINGS.swr.errorRetryCount,
  dedupingInterval: CLIENT_TIMINGS.swr.dedupingIntervalMs,
  focusThrottleInterval: CLIENT_TIMINGS.swr.focusThrottleIntervalMs,
  shouldRetryOnError: shouldRetry,
  onErrorRetry: (error, key, config, revalidate, opts) => {
    onErrorRetry(error, key, config, revalidate, opts);
  },
  revalidateOnFocus: true,
};
