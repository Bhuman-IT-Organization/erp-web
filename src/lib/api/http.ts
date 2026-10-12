import axios, {
  AxiosError,
  AxiosHeaders,
  isAxiosError,
  type InternalAxiosRequestConfig,
  type RawAxiosHeaders,
} from 'axios';
import { ApiError, HTTP_UNAUTHORIZED } from './api-error';
import { markReachable, markUnreachable } from './api-status';
import { CLIENT_TIMINGS } from './client-timings';
import {
  getAccessToken,
  getSessionGeneration,
  getSessionStatus,
  needsRenewal,
  recoverSession,
  renewSession,
} from '@/lib/auth/session';

/**
 * The one axios instance (ADR-0002, ADR-0031 §5). Only `call-api.ts` imports it; features never
 * import axios directly.
 *
 * - No `baseURL`: requests are RELATIVE (`/api/v1/...`) so they go to the Nginx origin the page
 *   was served from (FE-03 keeps `process.env` server-side; the browser needs no API origin).
 * - `timeout` from `CLIENT_TIMINGS` (axios's own timeout, no second AbortSignal layer).
 * - `withCredentials` so the httpOnly refresh/CSRF cookies travel; the page never reads them.
 * - Request interceptor: attach the in-memory bearer token unless the caller set one — and, while
 *   the session status is still `pending`, WAIT for this tab's one bootstrap first (see
 *   `bearerFor`), so a request issued on first paint cannot go out bearer-less; once signed in, a
 *   token in its early window is renewed the same way before it is sent (`heldForBootstrap`).
 * - Response interceptor: map every failure to a typed `ApiError` (4xx vs 5xx/timeout/network
 *   stay distinguishable through `status`) and mark reachability for the global banner. A 401 to
 *   the tab's current bearer renews the session BEFORE the failure is delivered (`renewedAfter401`),
 *   and the failure is delivered unchanged: the request itself is never sent again from here.
 * - NO retry here — no axios-retry, no interceptor re-invoking the request. SWR's `onErrorRetry`
 *   is the only retry layer; mutations are retried only by an explicit user action.
 */
export const NETWORK_CODE = 'ERP-NETWORK-0001';
export const TIMEOUT_CODE = 'ERP-TIMEOUT-0001';
/** The one status that means "the api is up but its upstream is not": marks the API unreachable. */
export const HTTP_SERVICE_UNAVAILABLE = 503;

const TIMEOUT_CODES: readonly string[] = [AxiosError.ECONNABORTED, AxiosError.ETIMEDOUT];

export const http = axios.create({
  timeout: CLIENT_TIMINGS.apiTimeoutMs,
  withCredentials: true,
  headers: { accept: 'application/json' },
  responseType: 'json',
});

/**
 * The paths that ESTABLISH or END a session, and therefore never wait for one. The bootstrap's own
 * `csrf → refresh` is the reason this list exists: made to wait for the session it is itself
 * recovering, it would wait for itself forever. `login` and `logout` are here because neither needs
 * the bootstrap either — logout carries its own bearer explicitly — and gating a sign-in on a
 * session would be backwards.
 *
 * `/api/v1/auth/me` is deliberately ABSENT: it is a guarded read like any other and wants the bearer.
 *
 * A path list rather than a per-call flag or a second axios instance, on purpose: the whole rule
 * then lives in this one file, where no caller can forget it (a per-caller discipline is exactly
 * what let the first-paint 401 through a whole phase), and the instance stays the ONE instance
 * (ADR-0002, FE-08) with one set of interceptors. They mirror `AUTH_PATHS` in
 * `src/features/auth/api/auth.endpoints.ts`; `src/lib` never imports a feature (FE-01), so
 * `use-session.ts` and `use-permissions.ts` already write their auth paths out the same way.
 */
const SESSION_FREE_PATHS: readonly string[] = [
  '/api/v1/auth/csrf',
  '/api/v1/auth/refresh',
  '/api/v1/auth/login',
  '/api/v1/auth/logout',
];

function isSessionFree(url: string | undefined): boolean {
  if (url === undefined) return false;
  return SESSION_FREE_PATHS.includes(url.split('?')[0] ?? url);
}

function withBearer(
  config: InternalAxiosRequestConfig,
  token: string | null,
): InternalAxiosRequestConfig {
  if (token !== null) config.headers.set('authorization', `Bearer ${token}`);
  return config;
}

/**
 * The gate: the request is HELD until this tab's session settles, then sent with whatever the
 * settled session has.
 *
 * While the status is `pending` there is no token YET, which is not the same as no session: after a
 * full navigation the token is recovered by the bootstrap (ADR-0005), and a data hook's effect runs
 * BEFORE its parent `PageShell`'s, so the first list request used to overtake it and take a `401
 * ERP-AUTH-0004` — a 4xx, so nothing retries it and the screen rendered a dead auth error until the
 * window refocused. `recoverSession` joins the tab's one bootstrap (or starts it, which for a single
 * flight is the same call); it never starts a second refresh, which would be cookie reuse (WR-07).
 *
 * Bounded, never a hang: it resolves as soon as the bootstrap settles either way, at once when no
 * bootstrap is registered (a page that has not loaded `src/lib/hooks/use-session.ts`, or the server),
 * and a `signedOut` result attaches nothing: the request goes out bearer-less and gets its honest
 * 401. The wait is outside the axios
 * `timeout` (which starts when the adapter dispatches), but the bootstrap's own two calls carry that
 * timeout, so the delay is bounded either way. It is NOT a retry: the request is held once, before
 * it is ever sent, and is dispatched exactly once — SWR remains the only retry layer.
 *
 * A generation bump while it waited means the session the request was issued under is gone
 * (`clearSession`: a sign-out or a reset), so it carries nothing rather than a token belonging to
 * the session that replaced it.
 *
 * The same hold covers a SIGNED-IN tab whose token is in its early window or already expired
 * (`needsRenewal`, quick task fix/quick-session-refresh): an idle tab's first reads on wake would
 * otherwise carry the dead token and 401. `wait` is then `renewSession`, the same single flight, so
 * a request issued while a renewal is in flight joins it and never starts a second refresh.
 */
async function heldForBootstrap(
  config: InternalAxiosRequestConfig,
  wait: () => Promise<void> = recoverSession,
): Promise<InternalAxiosRequestConfig> {
  const generation = getSessionGeneration();
  await wait();
  return withBearer(config, getSessionGeneration() === generation ? getAccessToken() : null);
}

http.interceptors.request.use((config) => {
  // An explicit header wins, and skips the gate with it: the caller already has its credentials.
  if (config.headers.has('authorization')) return config;
  // Deliberately SYNCHRONOUS unless the gate really holds this request: a settled session with a
  // live token and a session-free path keep exactly the dispatch they had before the gate existed.
  if (isSessionFree(config.url)) return withBearer(config, getAccessToken());
  if (getSessionStatus() === 'pending') return heldForBootstrap(config);
  if (needsRenewal()) return heldForBootstrap(config, renewSession);
  return withBearer(config, getAccessToken());
});

/**
 * The 401 path. A guarded request answered 401 to the bearer this tab still holds while the tab
 * believes it is signed in: the token expired (a background timer ran late, the clock jumped) or was
 * revoked. Run the tab's one `csrf → refresh` (`renewSession`; a 401 arriving while it is in flight
 * joins it) and only THEN deliver the failure, so no screen shows "Your session has ended" while
 * the refresh is in flight (D-39).
 *
 * It never re-sends the request: a read is re-run by SWR (`shouldRetry` in `swr-config.ts` retries a
 * 401 while the tab is still signed in, bounded by `errorRetryCount`), a mutation only by the member.
 * It cannot loop: the session-free paths (the refresh itself, login) never come here; a refusal marks
 * the tab signed out, after which no 401 renews; and a 401 to a token another flight already
 * replaced starts nothing.
 */
async function renewedAfter401(config: InternalAxiosRequestConfig | undefined): Promise<void> {
  if (config === undefined || isSessionFree(config.url)) return;
  const token = getAccessToken();
  if (getSessionStatus() !== 'signedIn' || token === null) return;
  if (config.headers.get('authorization') === `Bearer ${token}`) await renewSession();
}

function parseRetryAfter(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function problemCode(data: unknown, status: number): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'code' in data &&
    typeof data.code === 'string'
  ) {
    return data.code;
  }
  return `ERP-HTTP-${String(status)}`;
}

/** The `issues` array a 400 `ERP-VALIDATION-0001` problem body carries; `undefined` otherwise. */
function problemIssues(data: unknown): unknown {
  return typeof data === 'object' && data !== null && 'issues' in data ? data.issues : undefined;
}

/** Maps an axios failure to `ApiError`; `status === 0` when no response arrived. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (isAxiosError(error)) {
    if (error.response) {
      const status: number = error.response.status;
      const data: unknown = error.response.data;
      const headers = AxiosHeaders.from(error.response.headers as RawAxiosHeaders);
      const retryAfterS = parseRetryAfter(headers.get('retry-after'));
      return new ApiError(
        status,
        problemCode(data, status),
        retryAfterS,
        undefined,
        problemIssues(data),
      );
    }
    const code =
      error.code !== undefined && TIMEOUT_CODES.includes(error.code) ? TIMEOUT_CODE : NETWORK_CODE;
    return new ApiError(0, code, null);
  }
  return new ApiError(0, NETWORK_CODE, null);
}

/** Reachability side effect, in one place: 503, timeout or network → unreachable; anything else → reachable. */
export function markReachability(error: ApiError | null): void {
  if (error !== null && (error.status === HTTP_SERVICE_UNAVAILABLE || error.status === 0)) {
    markUnreachable(error.retryAfterS);
  } else {
    markReachable();
  }
}

http.interceptors.response.use(
  (response) => {
    markReachability(null);
    return response;
  },
  async (error: unknown) => {
    const apiError = toApiError(error);
    markReachability(apiError);
    if (apiError.status === HTTP_UNAUTHORIZED && isAxiosError(error)) {
      await renewedAfter401(error.config);
    }
    throw apiError;
  },
);
