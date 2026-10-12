// @vitest-environment happy-dom
import { AxiosHeaders, type AxiosAdapter } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAdapter, networkFailureAdapter, problem } from '@/test/axios-fakes';

/**
 * The renewal of a LIVE session (quick task fix/quick-session-refresh, 2026-10-02). The bug: the tab
 * refreshed only in its one bootstrap, so 15 minutes after it every guarded read answered `401
 * ERP-AUTH-0004` and the list said "Your session has ended" while the 30-day refresh cookie was valid.
 *
 * These tests drive the module-level scheduler and wake listeners with Vitest fake timers and NO
 * Testing Library: fake timers hang its async wrapper. Every test builds a
 * fresh module graph (one "tab"), and every graph is reset after the test, so the listeners an old
 * graph left on `document` find no live session and do nothing.
 */
const CSRF_PATH = '/api/v1/auth/csrf';
const REFRESH_PATH = '/api/v1/auth/refresh';
const OK = 200;
const UNAUTHORIZED = 401;
const LIFETIME_S = 900;
const LIFETIME_MS = LIFETIME_S * 1000;
const RENEW_AFTER_MS = LIFETIME_MS * 0.8;

interface Call {
  readonly url: string;
  readonly locked: boolean;
}

interface FakeLocks {
  held: boolean;
  request: (name: string, cb: () => Promise<unknown>) => Promise<unknown>;
}

/** `navigator.locks` as the browser has it for every tab of one origin: FIFO, one holder at a time. */
function fifoLocks(): FakeLocks {
  let tail: Promise<unknown> = Promise.resolve();
  const locks: FakeLocks = {
    held: false,
    request(_name, cb) {
      const run = tail.then(async () => {
        locks.held = true;
        try {
          return await cb();
        } finally {
          locks.held = false;
        }
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
  return locks;
}

/**
 * The api: csrf answers a token, refresh answers a new access token `a1`, `a2`, ... with the stated
 * lifetime (or `refreshWith` when set), each after a microtask so two unlocked sequences WOULD
 * interleave. Records each call and whether the lock was held while it went out.
 */
function fakeApi(locks: FakeLocks) {
  const calls: Call[] = [];
  let issued = 0;
  const api = {
    calls,
    refreshWith: null as AxiosAdapter | null,
    refreshes: () => calls.filter((c) => c.url === REFRESH_PATH).length,
    adapter: (async (config) => {
      const url = config.url ?? '';
      calls.push({ url, locked: locks.held });
      await Promise.resolve();
      if (url === CSRF_PATH) return fakeAdapter(OK, { csrfToken: 'c' }).adapter(config);
      if (api.refreshWith !== null) return api.refreshWith(config);
      issued += 1;
      return fakeAdapter(OK, {
        accessToken: `a${String(issued)}`,
        csrfToken: 'c',
        expiresIn: LIFETIME_S,
      }).adapter(config);
    }) as AxiosAdapter,
  };
  return api;
}

type Api = ReturnType<typeof fakeApi>;
const tabs: { clearSession: () => void }[] = [];

/** One tab: a fresh session store, transport and bootstrap (importing use-session registers it). */
async function openTab(api: Api) {
  vi.resetModules();
  const session = await import('@/lib/auth/session');
  const { http } = await import('@/lib/api/http');
  const { bootstrapSession } = await import('@/lib/hooks/use-session');
  http.defaults.adapter = api.adapter;
  tabs.push(session);
  return { session, bootstrapSession, http };
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

let locks: FakeLocks;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  locks = fifoLocks();
  Object.defineProperty(window.navigator, 'locks', { value: locks, configurable: true });
});

afterEach(() => {
  for (const tab of tabs.splice(0)) tab.clearSession();
  vi.useRealTimers();
  Reflect.deleteProperty(window.navigator, 'locks');
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('proactive renewal: one refresh at 80% of the lifetime the api stated', () => {
  it('refreshes once at 80% after the bootstrap, not a millisecond before, then again from the new lifetime', async () => {
    const api = fakeApi(locks);
    const { session, bootstrapSession } = await openTab(api);
    await bootstrapSession();
    expect(session.getAccessToken()).toBe('a1');

    await vi.advanceTimersByTimeAsync(RENEW_AFTER_MS - 1);
    expect(api.refreshes()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.refreshes()).toBe(2);
    expect(session.getAccessToken()).toBe('a2');
    expect(session.getSessionStatus()).toBe('signedIn');

    await vi.advanceTimersByTimeAsync(RENEW_AFTER_MS);
    expect(api.refreshes()).toBe(3);
    expect(session.getAccessToken()).toBe('a3');
  });

  it('runs the timer refresh inside the cross-tab lock, csrf first', async () => {
    const api = fakeApi(locks);
    const { bootstrapSession } = await openTab(api);
    await bootstrapSession();
    api.calls.splice(0);
    await vi.advanceTimersByTimeAsync(RENEW_AFTER_MS);
    expect(api.calls).toEqual([
      { url: CSRF_PATH, locked: true },
      { url: REFRESH_PATH, locked: true },
    ]);
  });

  it('a login schedules it too: the expiry comes from the login response', async () => {
    const api = fakeApi(locks);
    const { session } = await openTab(api);
    session.setSession({ accessToken: 'login', csrfToken: 'c', expiresInS: LIFETIME_S });
    await vi.advanceTimersByTimeAsync(RENEW_AFTER_MS);
    expect(api.refreshes()).toBe(1);
    expect(session.getAccessToken()).toBe('a1');
  });

  it('schedules nothing when the response states no lifetime (never a hard-coded 15 minutes)', async () => {
    const api = fakeApi(locks);
    const { session } = await openTab(api);
    session.setSession({ accessToken: 'story', csrfToken: 'c' });
    await vi.advanceTimersByTimeAsync(LIFETIME_MS * 2);
    expect(api.refreshes()).toBe(0);
  });

  it('is cancelled by a sign-out (clearSession) and by a refused bootstrap (markSignedOut)', async () => {
    const api = fakeApi(locks);
    const { session, bootstrapSession } = await openTab(api);
    await bootstrapSession();
    session.clearSession();
    await vi.advanceTimersByTimeAsync(LIFETIME_MS);
    expect(api.refreshes()).toBe(1);

    session.setSession({ accessToken: 'x', csrfToken: 'c', expiresInS: LIFETIME_S });
    session.markSignedOut();
    await vi.advanceTimersByTimeAsync(LIFETIME_MS);
    expect(api.refreshes()).toBe(1);
  });

  it('a newer token cancels the older timer: one refresh, at 80% of the newer lifetime', async () => {
    const api = fakeApi(locks);
    const { session, bootstrapSession } = await openTab(api);
    await bootstrapSession();
    await vi.advanceTimersByTimeAsync(RENEW_AFTER_MS / 2);
    // A refresh landed meanwhile (a 401 renewal, another path): its lifetime starts now.
    session.setSession({ accessToken: 'newer', csrfToken: 'c', expiresInS: LIFETIME_S });
    await vi.advanceTimersByTimeAsync(RENEW_AFTER_MS / 2);
    expect(api.refreshes()).toBe(1);
    await vi.advanceTimersByTimeAsync(RENEW_AFTER_MS / 2);
    expect(api.refreshes()).toBe(2);
  });

  it('a refused renewal ends the session once and schedules nothing more', async () => {
    const api = fakeApi(locks);
    const { session, bootstrapSession } = await openTab(api);
    await bootstrapSession();
    api.refreshWith = fakeAdapter(UNAUTHORIZED, problem(UNAUTHORIZED, 'ERP-AUTH-0002')).adapter;
    await vi.advanceTimersByTimeAsync(RENEW_AFTER_MS);
    expect(session.getSessionStatus()).toBe('signedOut');
    expect(api.refreshes()).toBe(2);
    await vi.advanceTimersByTimeAsync(LIFETIME_MS * 4);
    expect(api.refreshes()).toBe(2);
  });

  it('an unreachable api keeps the live session (a waking laptop is not a sign-out) and does not loop', async () => {
    const api = fakeApi(locks);
    const { session, bootstrapSession } = await openTab(api);
    await bootstrapSession();
    api.refreshWith = networkFailureAdapter().adapter;
    await vi.advanceTimersByTimeAsync(RENEW_AFTER_MS);
    expect(session.getSessionStatus()).toBe('signedIn');
    expect(session.getAccessToken()).toBe('a1');
    expect(api.refreshes()).toBe(2);
    await vi.advanceTimersByTimeAsync(LIFETIME_MS * 4);
    expect(api.refreshes()).toBe(2);
  });
});

describe('wake renewal: visibilitychange to visible and online', () => {
  /** The laptop slept: the clock moved on, the timer did not fire. */
  async function asleepPastRenewal(api: Api) {
    const tab = await openTab(api);
    await tab.bootstrapSession();
    vi.setSystemTime(Date.now() + RENEW_AFTER_MS + 1);
    return tab;
  }

  it('refreshes once when the tab becomes visible with the token in its early window', async () => {
    const api = fakeApi(locks);
    const { session } = await asleepPastRenewal(api);
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.refreshes()).toBe(2);
    expect(session.getAccessToken()).toBe('a2');
  });

  it('refreshes once on online', async () => {
    const api = fakeApi(locks);
    await asleepPastRenewal(api);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.refreshes()).toBe(2);
  });

  it('visible and online together join ONE refresh', async () => {
    const api = fakeApi(locks);
    await asleepPastRenewal(api);
    setVisibility('visible');
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.refreshes()).toBe(2);
  });

  it('does nothing while hidden, nor with a token outside its early window', async () => {
    const api = fakeApi(locks);
    await asleepPastRenewal(api);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.refreshes()).toBe(1);

    const fresh = fakeApi(locks);
    const { bootstrapSession } = await openTab(fresh);
    await bootstrapSession();
    setVisibility('visible');
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fresh.refreshes()).toBe(1);
  });
});

describe('two tabs never refresh at once (WR-07)', () => {
  it('both timers fire together: csrf, refresh, csrf, refresh, each inside the lock', async () => {
    const api = fakeApi(locks);
    const first = await openTab(api);
    const second = await openTab(api);
    await first.bootstrapSession();
    await second.bootstrapSession();
    api.calls.splice(0);

    await vi.advanceTimersByTimeAsync(RENEW_AFTER_MS);

    expect(api.calls.map((c) => c.url)).toEqual([CSRF_PATH, REFRESH_PATH, CSRF_PATH, REFRESH_PATH]);
    expect(api.calls.every((c) => c.locked)).toBe(true);
    // Each tab holds its own token: the second refreshed with the cookie the first had rotated.
    expect(first.session.getAccessToken()).not.toBe(second.session.getAccessToken());
  });

  it('the bearer each tab sends afterwards is its own new token', async () => {
    const api = fakeApi(locks);
    const tab = await openTab(api);
    await tab.bootstrapSession();
    await vi.advanceTimersByTimeAsync(RENEW_AFTER_MS);
    const seen: unknown[] = [];
    tab.http.defaults.adapter = (config) => {
      seen.push(AxiosHeaders.from(config.headers).get('authorization'));
      return fakeAdapter(OK, {}).adapter(config);
    };
    await tab.http.get('/api/v1/identity/members');
    expect(seen).toEqual(['Bearer a2']);
  });
});
