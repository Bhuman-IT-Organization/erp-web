import { getAccessToken, recoverSession } from '@/lib/auth/session';

/**
 * The tab's one legacy handoff (quick 261009-lgn, ADR-0038 amendment): the Perfex CodeIgniter
 * session is opened in the background after a sign-in, as ONE shared flight, and whatever needs it
 * (a Perfex `next`, a Perfex link clicked in Node) awaits that flight instead of starting another.
 *
 * The handoff itself stays in `src/features/auth/api/legacy-handoff.ts` (the named raw-fetch
 * exception, FE-09); `src/lib` never imports a feature (FE-01), so callers pass it in as `open`.
 * This file holds no token: it reads the in-memory one from `session.ts` when it must hand off.
 *
 * A completed handoff is also stamped in this tab's session storage, so a full page load (Perfex to
 * Node, a reload) does not hand off again before every Perfex link: only a handoff that failed or
 * never completed in this tab runs again. The stamp authorises nothing; a stale one only means
 * Perfex sends the member to `/login`, which resumes (ADR-0038).
 */
export type LegacyOpener = (accessToken: string) => Promise<boolean>;

/** Session storage key: this tab's handoff completed since the last sign-in or sign-out. */
export const LEGACY_OPENED_KEY = 'erp-legacy-opened';

/**
 * The Node pages behind the shell gate: `proxy.ts`'s `config.matcher`, which must stay literal there
 * (Next reads it statically); `__tests__/proxy.test.ts` keeps the two equal.
 */
export const NODE_GATED_PREFIXES = ['/setup'] as const;

/** Node's own pages outside the gate. */
const NODE_OPEN_PAGES = ['/login', '/logout', '/status'] as const;

let flight: Promise<boolean> | null = null;
let opened = false;

/**
 * Is `path` (a same-origin path, query and hash allowed) a Node page? Anything else is served by
 * Perfex, which is the safe side: the caller waits for the handoff, as before this change.
 */
export function isNodePage(path: string): boolean {
  const pathname = path.replace(/[?#].*$/s, '');
  return [...NODE_GATED_PREFIXES, ...NODE_OPEN_PAGES].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function readStamp(): boolean {
  try {
    return window.sessionStorage.getItem(LEGACY_OPENED_KEY) !== null;
  } catch {
    return false;
  }
}

function writeStamp(): void {
  try {
    window.sessionStorage.setItem(LEGACY_OPENED_KEY, '1');
  } catch {
    // No storage: this page knows the session is open; the next page load hands off once more.
  }
}

/** Is the Perfex session known open: this page's flight succeeded, or this tab's stamp says so. */
export function isLegacySessionOpen(): boolean {
  return opened || (flight === null && readStamp());
}

/**
 * Hands off with `accessToken`, once: a call while a flight is pending (or after it succeeded in this
 * page) returns that flight. A failed flight is dropped, so the next call hands off again. Never
 * rejects.
 */
export function openLegacySession(accessToken: string, open: LegacyOpener): Promise<boolean> {
  if (flight !== null) return flight;
  const current: Promise<boolean> = open(accessToken)
    .catch(() => false)
    .then((ok) => {
      // Forgotten while in flight (a sign-out, a new sign-in): its result belongs to nobody.
      if (flight !== current) return ok;
      if (ok) {
        opened = true;
        writeStamp();
      } else {
        flight = null;
      }
      return ok;
    });
  flight = current;
  return current;
}

/**
 * What a Perfex link awaits: true at once when the session is open; else the pending flight; else
 * (it failed, or never ran in this tab) a new handoff with the session's token, after the tab's
 * session bootstrap settles. False when there is no token to hand off.
 */
export async function ensureLegacySession(open: LegacyOpener): Promise<boolean> {
  if (isLegacySessionOpen()) return true;
  if (flight !== null && (await flight)) return true;
  await recoverSession();
  const token = getAccessToken();
  if (token === null) return false;
  return openLegacySession(token, open);
}

/** A sign-in or sign-out: the old session's flight and stamp no longer say anything. */
export function forgetLegacySession(): void {
  flight = null;
  opened = false;
  try {
    window.sessionStorage.removeItem(LEGACY_OPENED_KEY);
  } catch {
    // No storage: nothing was stamped either.
  }
}
