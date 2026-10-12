'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { HTTP_UNAUTHORIZED } from '@/lib/api/api-error';
import { callApi, type ApiAdapter } from '@/lib/api/call-api';
import {
  getAccessToken,
  getRenewAt,
  getSessionGeneration,
  getSessionStatus,
  markSignedOut,
  needsRenewal,
  renewSession,
  setSession,
  setSessionRecovery,
  subscribeSession,
  type SessionStatus,
} from '@/lib/auth/session';

export interface Session {
  /** The bootstrap has finished, successfully or not: the UI may stop showing a skeleton. */
  readonly isReady: boolean;
  readonly isSignedIn: boolean;
}

export interface UseSessionOptions {
  /** Test seam only, as every other transport caller has. */
  readonly adapter?: ApiAdapter;
}

/**
 * The paths are written here rather than imported from `@/features/auth`: `src/lib` never imports
 * a feature (FE-01, `G_ANY_FEATURE` in S10). `src/lib/auth/use-permissions.ts` set this precedent
 * with `/api/v1/auth/me`. They mirror `AUTH_PATHS` in `src/features/auth/api/auth.endpoints.ts`.
 */
const CSRF_PATH = '/api/v1/auth/csrf';
const REFRESH_PATH = '/api/v1/auth/refresh';
const CSRF_HEADER = 'x-csrf-token';

/** The Web Lock every tab of this origin takes around its csrf → refresh sequence. */
export const REFRESH_LOCK_NAME = 'erp-session-refresh';

/** CSRF refused (erp-api `ERP-AUTH-0008`); with 401 the only answers that END a live session. */
const HTTP_FORBIDDEN = 403;

const csrfSchema = z.object({ csrfToken: z.string() });
/** `expiresIn` (seconds) is the lifetime erp-api states for the new access token; optional so an older api still parses. */
const refreshSchema = z.object({
  accessToken: z.string(),
  csrfToken: z.string(),
  expiresIn: z.number().int().positive().optional(),
});

/** `refused`: the api answered and said no (401 or 403), as opposed to not answering usefully. */
type RefreshResult =
  | { ok: true; accessToken: string; csrfToken: string; expiresInS: number | undefined }
  | { ok: false; refused: boolean };

function refusal(status: number): RefreshResult {
  return { ok: false, refused: status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN };
}

interface LockManagerLike {
  request: (name: string, callback: () => Promise<unknown>) => Promise<unknown>;
}

/**
 * Runs `fn` holding the `erp-session-refresh` Web Lock where the browser has one, so two tabs'
 * sequences never interleave. Without `navigator.locks`, or if `request` rejects before the
 * callback ran, `fn` runs unlocked. It never throws into the caller for want of a lock.
 *
 * Exported for the one other refresh in the app, `LogoutButton`'s `csrf → refresh → logout`: it must
 * take the same lock, or a renewal in flight in this tab and the sign-out would refresh one cookie
 * twice (reuse, WR-07).
 */
export async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as { locks?: Partial<LockManagerLike> }).locks;
  if (typeof locks?.request !== 'function') return fn();
  // A holder, not a `let`: the callback assigns it, which control-flow analysis cannot see.
  const run: { promise?: Promise<T> } = {};
  try {
    await locks.request(REFRESH_LOCK_NAME, () => {
      run.promise = fn();
      return run.promise;
    });
  } catch {
    // Rejected before the callback ran (no lock was granted): run unlocked. A rejection from
    // `fn` itself is returned below through `run.promise`.
  }
  return run.promise ?? fn();
}

async function refreshSequence(adapter: ApiAdapter | undefined): Promise<RefreshResult> {
  const csrf = await callApi(CSRF_PATH, {
    schema: csrfSchema,
    ...(adapter ? { adapter } : {}),
  });
  if (!csrf.ok) return refusal(csrf.status);
  const refreshed = await callApi(REFRESH_PATH, {
    method: 'POST',
    headers: { [CSRF_HEADER]: csrf.data.csrfToken },
    schema: refreshSchema,
    ...(adapter ? { adapter } : {}),
  });
  if (!refreshed.ok) return refusal(refreshed.status);
  const { accessToken, csrfToken, expiresIn } = refreshed.data;
  return { ok: true, accessToken, csrfToken, expiresInS: expiresIn };
}

/**
 * Applies a settled refresh. A session is established or renewed; a refusal ends it; an answer that
 * is not a refusal (network, timeout, 5xx) ends only a session that did not exist yet (the bootstrap,
 * as before), and leaves a LIVE one as it is: a laptop waking before its network is not a sign-out.
 * The next wake, `online`, request or 401 asks again; nothing here re-schedules, so nothing loops.
 */
function applyRefresh(result: RefreshResult): void {
  if (result.ok) {
    setSession({
      accessToken: result.accessToken,
      csrfToken: result.csrfToken,
      expiresInS: result.expiresInS,
    });
  } else if (result.refused || getSessionStatus() !== 'signedIn') {
    markSignedOut();
  }
}

let inFlight: { readonly generation: number; readonly promise: Promise<void> } | null = null;

/**
 * Recovers the in-memory access token after a full navigation: the same `fetchCsrf → refresh`
 * sequence `LogoutButton` runs. The refresh cookie is `Path=/api/v1/auth/refresh` and httpOnly,
 * so only the api can see it, and the access token itself is never persisted (ADR-0005).
 *
 * ONE refresh per tab, by design (WR-07). Each refresh rotates the cookie, and the api treats a
 * second refresh with the cookie it just rotated as reuse: it revokes the family and signs the
 * member out on every device. React StrictMode's double mount and two consumers (`PageShell`,
 * `withAuth`) used to run two refreshes on one cookie. A single flight fixes that within a tab:
 * every caller of the same generation joins the one promise, which resets once it settles. The
 * `erp-session-refresh` Web Lock fixes it across tabs: the browser's cookie jar is shared, so a
 * tab that waited for the lock refreshes with the cookie the first tab already rotated. There is
 * deliberately no api grace window for the previous cookie (it would weaken reuse detection). A
 * hung call holds the lock for at most `CLIENT_TIMINGS.apiTimeoutMs` per request, and closing a
 * tab releases its locks. A result is applied only if no `clearSession` happened meanwhile.
 *
 * The same single flight RENEWS a live session (`renewSession` in `session.ts`): ahead of expiry,
 * on wake, and after a 401 (see `scheduleRenewal` below and `http.ts`). One per tab AT A TIME is
 * the rule: a renewal starts only after the previous flight settled and rotated the cookie, so each
 * refresh presents the cookie the last one set, which is never reuse.
 */
export function bootstrapSession({ adapter }: UseSessionOptions = {}): Promise<void> {
  const generation = getSessionGeneration();
  if (inFlight?.generation === generation) return inFlight.promise;
  const promise = withRefreshLock(() => refreshSequence(adapter)).then(
    (result) => {
      if (getSessionGeneration() === generation) applyRefresh(result);
    },
    () => {
      // `callApi` never throws; this only keeps an unexpected failure from staying `pending`.
      if (getSessionGeneration() === generation) applyRefresh({ ok: false, refused: false });
    },
  );
  const flight = { generation, promise };
  inFlight = flight;
  void promise.finally(() => {
    if (inFlight === flight) inFlight = null;
  });
  return promise;
}

/**
 * The transport's door onto this tab's ONE bootstrap (quick task 260925-401). `http.ts`'s request
 * interceptor awaits it whenever a request is issued while the status is `pending`, so the first
 * paint of a shell page cannot send a bearer-less request and take a 401 nothing retries. It is
 * registered on the React-free session store rather than imported: `http.ts` importing this module
 * would be a cycle through `call-api.ts`, and it would pull React into the transport.
 *
 * At module load, not in an effect: a data hook's effect — and therefore its request — runs BEFORE
 * its parent `PageShell`'s, so the interceptor must be able to START the flight, not only join it.
 * `bootstrapSession` is a single flight, so starting and joining are the same call.
 */
setSessionRecovery(() => bootstrapSession());

let renewTimer: ReturnType<typeof setTimeout> | undefined;
let scheduledFor: number | null = null;

/**
 * The proactive renewal (quick task fix/quick-session-refresh). The access token lives minutes
 * (erp-api `TIMINGS.auth.accessTokenTtlMs`) and the refresh cookie weeks, so an idle tab used to
 * outlive its token and show "Your session has ended" on its next read. Now every session change
 * re-aims ONE timer at the token's early window (`getRenewAt`: 80% of the lifetime the response
 * stated): a newer token moves it, a sign-out or reset (`markSignedOut`, `clearSession`) cancels it,
 * and an unchanged token leaves it alone. When it fires it joins or starts the one single flight.
 *
 * A background tab's timer may fire late (browsers throttle them) and a sleeping laptop's not at
 * all, which is why the wake listeners and the expiry gate in `http.ts` exist beside it.
 */
function scheduleRenewal(): void {
  const at = getRenewAt();
  if (at === scheduledFor) return;
  clearTimeout(renewTimer);
  renewTimer = undefined;
  scheduledFor = at;
  if (at === null) return;
  renewTimer = setTimeout(
    () => {
      renewTimer = undefined;
      void renewSession();
    },
    Math.max(0, at - Date.now()),
  );
}

/** Wake: a tab shown again, or a network back, renews at once if its token is in the early window. */
function renewIfDue(): void {
  if (needsRenewal()) void renewSession();
}

subscribeSession(scheduleRenewal);
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renewIfDue();
  });
  window.addEventListener('online', renewIfDue);
}

const pendingOnServer = (): SessionStatus => 'pending';

/** Reads this tab's session status; never starts a bootstrap. */
export function useSessionStatus(): SessionStatus {
  return useSyncExternalStore(subscribeSession, getSessionStatus, pendingOnServer);
}

/**
 * Starts this tab's one session bootstrap, or joins it, while the status is unknown. `PageShell`
 * calls it for every shell page and `withAuth` calls it again: the second call joins the first.
 *
 * This is PRESENTATION ONLY, like `usePermissions`: it decides whether to show a skeleton or the
 * page, never whether a call is allowed. `proxy.ts` gates the route on `erp_session_present` and
 * the api guards every request regardless (FE-16).
 *
 * The one `useEffect` of the shell's session, and the reason `src/lib/hooks/` exists: a bootstrap
 * is a subscription to something outside React, which is exactly what an effect is for (FE-04).
 */
export function useSession({ adapter }: UseSessionOptions = {}): Session {
  const status = useSessionStatus();
  // Reruns only when the status or the test seam changes; a settled status starts nothing.
  // effect: subscribe: start (or join) this tab's one session bootstrap while the status is unknown (FE-16)
  useEffect(() => {
    if (status === 'pending') void bootstrapSession(adapter ? { adapter } : {});
  }, [status, adapter]);
  return { isReady: status !== 'pending', isSignedIn: status === 'signedIn' };
}

/**
 * Runs `run` exactly once, the first time `ready` is true, and never again for this mount, StrictMode's
 * double effect included (a ref, not state). The one home of "act once on arrival" (ADR-0038, FE-04):
 * the /login resume and the automatic sign-out of /logout?from=legacy. Exactly once matters: a second
 * refresh with a rotated cookie is reuse, which revokes the family and bumps the member's token version (WR-07).
 */
export function useRunOnce(ready: boolean, run: () => void): void {
  const ran = useRef(false);
  // effect: subscribe: run the caller's one action the first time its condition holds (the /login resume and the /logout?from=legacy sign-out, ADR-0038)
  useEffect(() => {
    if (!ready || ran.current) return;
    ran.current = true;
    run();
  }, [ready, run]);
}

export interface ResumeHandlers {
  /** The FIRST settled answer is a session: its access token. */
  readonly onSignedIn: (accessToken: string) => void;
  /** The FIRST settled answer is no session: refused, unreachable, or no token. */
  readonly onSignedOut: () => void;
}

/**
 * The `/login` resume (ADR-0038): starts or joins this tab's one bootstrap through `useSession` and
 * reports how it FIRST settled, exactly once (useRunOnce). A later change is ignored on purpose: a sign-in
 * made on the same page afterwards belongs to its form, which runs its own handoff.
 */
export function useResumeSession(
  handlers: ResumeHandlers,
  { adapter }: UseSessionOptions = {},
): void {
  const { isReady, isSignedIn } = useSession(adapter ? { adapter } : {});
  useRunOnce(isReady, () => {
    const token = getAccessToken();
    if (isSignedIn && token !== null) handlers.onSignedIn(token);
    else handlers.onSignedOut();
  });
}
