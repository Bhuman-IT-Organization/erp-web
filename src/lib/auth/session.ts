import { CLIENT_TIMINGS } from '@/lib/api/client-timings';

/**
 * ADR-0005: the access token lives in memory only. A full navigation loses it; `/logout` and
 * future pages recover one through the refresh cookie + CSRF. Never persist it.
 *
 * The refresh token is an httpOnly cookie the browser sends by itself (`credentials: 'include'`
 * in `callApi`); this module never sees it. The CSRF token is the double-submit value the api
 * returns with every login/refresh response and expects back in `x-csrf-token`.
 *
 * The status is the one answer to "is there a session in this tab": `pending` until the bootstrap
 * (`src/lib/hooks/use-session.ts`) settles, then `signedIn` or `signedOut`. Hooks read it through
 * `subscribeSession` + `getSessionStatus` (`useSyncExternalStore`), so the menu, `withAuth` and
 * `usePermissions` all see the same answer at the same time (WR-07, WR-08). `clearSession` is a
 * full reset: status back to `pending` and a new generation, so a bootstrap that started before
 * it can never write its result afterwards. This file stays React-free because `http.ts` imports it,
 * which is also why the bootstrap registers itself here (`setSessionRecovery`): the transport awaits
 * `recoverSession()` rather than importing the React hook that owns the single flight.
 *
 * A LIVE session is renewed through the same seam (`renewSession`, quick task
 * fix/quick-session-refresh): the access token lasts minutes, so `setSession` records when its early
 * window opens and `use-session.ts` renews it then, on wake, before a request that would carry it
 * expired, and after a 401. The one single flight and its Web Lock are unchanged, so two refreshes
 * never overlap (WR-07).
 */
export type SessionStatus = 'pending' | 'signedIn' | 'signedOut';

/** The one thing that can turn `pending` into a settled status: this tab's session bootstrap. */
export type SessionRecovery = () => Promise<void>;

/**
 * The presence flag erp-api sets beside the refresh cookie (ADR-0032). Read server-side only: by
 * `proxy.ts` to gate the shell, and by `app/login/page.tsx` as a hint to ASK the api (ADR-0038).
 * It authorises nothing. Mirrors `SESSION_PRESENT_COOKIE` in erp-api `src/v1/auth/auth.routes.ts`.
 */
export const SESSION_PRESENT_COOKIE = 'erp_session_present';
/** Session storage key: when this tab last resumed a session by itself (the /login loop guard, ADR-0038). */
export const RESUMED_AT_KEY = 'erp-login-resumed-at';
/** Session storage key: when this tab last signed out (no resume right after a sign-out, ADR-0038). */
export const SIGNED_OUT_AT_KEY = 'erp-signed-out-at';

const MS_PER_SECOND = 1000;
const PERCENT = 100;

let accessToken: string | null = null;
let csrfToken: string | null = null;
let status: SessionStatus = 'pending';
let generation = 0;
let recovery: SessionRecovery | null = null;
/** When the access token enters its early window (epoch ms, this tab's clock); `null` when unknown. */
let renewAt: number | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * The access token's early window opens at `CLIENT_TIMINGS.session.renewAtPercent` of the lifetime
 * the login or refresh response states (`expiresIn`, seconds), measured on THIS tab's clock from the
 * moment the answer arrived, so a skewed client clock cannot move it. No stated lifetime (a story, an
 * older api) means no window: nothing is renewed ahead of time, and the 401 path still renews.
 */
function renewalTime(expiresInS: number | undefined): number | null {
  if (expiresInS === undefined) return null;
  return (
    Date.now() + (expiresInS * MS_PER_SECOND * CLIENT_TIMINGS.session.renewAtPercent) / PERCENT
  );
}

/**
 * A session was established (login) or renewed (refresh). `expiresInS` is the response's `expiresIn`;
 * with it the tab renews the token before it expires (`use-session.ts` schedules that).
 */
export function setSession(s: {
  accessToken: string;
  csrfToken: string;
  expiresInS?: number | undefined;
}): void {
  accessToken = s.accessToken;
  csrfToken = s.csrfToken;
  renewAt = renewalTime(s.expiresInS);
  status = 'signedIn';
  notify();
}

/** The bootstrap settled without a session (the refresh was refused or unreachable). */
export function markSignedOut(): void {
  accessToken = null;
  csrfToken = null;
  renewAt = null;
  status = 'signedOut';
  notify();
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function getSessionStatus(): SessionStatus {
  return status;
}

/** Bumped by every `clearSession`: a bootstrap applies its result only if this is unchanged. */
export function getSessionGeneration(): number {
  return generation;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Registers the tab's one session bootstrap, so anything that needs a settled status can WAIT for
 * it instead of racing it. `src/lib/hooks/use-session.ts` registers `bootstrapSession` at module
 * load — it cannot be imported here or by `http.ts`: it is a React module and it reaches the api
 * through `call-api.ts`, which imports `http.ts`. This file is the seam because it imports nothing
 * but the leaf `client-timings.ts`.
 */
export function setSessionRecovery(recover: SessionRecovery): void {
  recovery = recover;
}

/**
 * Awaits the registered bootstrap while the status is `pending`, so a caller that needs the bearer
 * asks for it AFTER the session settled (`http.ts`'s request interceptor is that caller — this is
 * the fix for the first-paint `401 ERP-AUTH-0004`, in one place rather than in every hook's key).
 *
 * It never throws and never loops: with nothing registered (a page that bootstraps no session, or
 * the server) it resolves at once; a bootstrap that settled `signedOut`, or that dropped its result
 * because a `clearSession` overtook it and left the status `pending`, resolves just the same. The
 * caller then sends what it has — which is honest: the api answers 401 and the UI reacts.
 */
export async function recoverSession(): Promise<void> {
  const recover = recovery;
  if (status !== 'pending' || recover === null) return;
  try {
    await recover();
  } catch {
    // A bootstrap that failed is a session that does not exist: the caller proceeds bearer-less.
  }
}

/** When this tab should renew its access token (epoch ms); `null` unless signed in with a stated lifetime. */
export function getRenewAt(): number | null {
  return status === 'signedIn' ? renewAt : null;
}

/** The access token is expired or in its early window: renew before using it. */
export function needsRenewal(now: number = Date.now()): boolean {
  const at = getRenewAt();
  return at !== null && now >= at;
}

/**
 * Renews a LIVE session through the same registered single flight as `recoverSession` (the tab's one
 * `csrf → refresh` under the `erp-session-refresh` Web Lock, WR-07): a caller arriving while it is in
 * flight joins it. The proactive timer, the wake listeners, the expiry gate and the 401 path of
 * `http.ts` all come through here. Like `recoverSession` it never throws and never loops: it does
 * nothing unless the status is `signedIn`, so a refusal (which marks the tab signed out) ends it.
 */
export async function renewSession(): Promise<void> {
  const recover = recovery;
  if (status !== 'signedIn' || recover === null) return;
  try {
    await recover();
  } catch {
    // The single flight settles the status itself; a failure here changes nothing for the caller.
  }
}

export function clearSession(): void {
  accessToken = null;
  csrfToken = null;
  renewAt = null;
  status = 'pending';
  generation += 1;
  notify();
}
