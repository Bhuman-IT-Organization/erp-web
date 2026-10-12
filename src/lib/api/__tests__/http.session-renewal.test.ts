import { AxiosHeaders, type AxiosAdapter } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fakeAdapter, problem } from '@/test/axios-fakes';

/**
 * The 401 path and the expiry gate of the transport (quick task fix/quick-session-refresh).
 *
 * A guarded read that answers 401 while this tab believes it is signed in runs the tab's ONE
 * `csrf → refresh` (or joins it), and only THEN rejects, so the screen never shows "Your session has
 * ended" while a refresh is in flight (D-39). The request itself is never re-sent by the transport:
 * SWR re-runs a failed read, and a mutation is retried only by the member. A request issued with a
 * token already past 80% of its stated lifetime is held for the refresh first, like the bootstrap gate.
 *
 * Every test builds a fresh module graph so no session or registration leaks between tests.
 */
const MEMBERS_PATH = '/api/v1/identity/members?limit=25';
const ROLES_PATH = '/api/v1/identity/roles?limit=25';
const CSRF_PATH = '/api/v1/auth/csrf';
const REFRESH_PATH = '/api/v1/auth/refresh';
const LOGIN_PATH = '/api/v1/auth/login';
const OK = 200;
const UNAUTHORIZED = 401;
const EXPIRED = 'ERP-AUTH-0004';
const LIFETIME_S = 900;
const HELD_FOR_MS = 50;

const anything = z.unknown();

interface Seen {
  readonly url: string;
  readonly method: string;
  readonly bearer: string | undefined;
}

/**
 * The api: csrf answers at once; refresh waits for `releaseRefresh` and issues `fresh` (or answers
 * `refreshAnswer`); every other path answers 200 to `Bearer fresh` and 401 to anything else, as
 * erp-api's guard answers an expired token.
 */
function fakeApi(refreshAnswer?: AxiosAdapter) {
  const seen: Seen[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const adapter: AxiosAdapter = async (config) => {
    const url = config.url ?? '';
    const header = AxiosHeaders.from(config.headers).get('authorization');
    const bearer = typeof header === 'string' ? header : undefined;
    seen.push({ url, method: (config.method ?? 'get').toUpperCase(), bearer });
    if (url === CSRF_PATH) return fakeAdapter(OK, { csrfToken: 'c2' }).adapter(config);
    if (url === REFRESH_PATH) {
      await gate;
      if (refreshAnswer !== undefined) return refreshAnswer(config);
      return fakeAdapter(OK, {
        accessToken: 'fresh',
        csrfToken: 'c3',
        expiresIn: LIFETIME_S,
      }).adapter(config);
    }
    return bearer === 'Bearer fresh'
      ? fakeAdapter(OK, { ok: true }).adapter(config)
      : fakeAdapter(UNAUTHORIZED, problem(UNAUTHORIZED, EXPIRED)).adapter(config);
  };
  const count = (url: string) => seen.filter((s) => s.url === url).length;
  return {
    adapter,
    seen,
    releaseRefresh: () => {
      release();
    },
    count,
  };
}

/** A signed-in tab whose in-memory token `stale` the api no longer accepts. */
async function signedInTab(api: ReturnType<typeof fakeApi>) {
  vi.resetModules();
  const session = await import('@/lib/auth/session');
  const { http } = await import('@/lib/api/http');
  const { callApi } = await import('@/lib/api/call-api');
  await import('@/lib/hooks/use-session');
  http.defaults.adapter = api.adapter;
  session.setSession({ accessToken: 'stale', csrfToken: 'c1' });
  return { session, callApi };
}

/** Has the promise settled within `HELD_FOR_MS`? */
async function settledSoon(promise: Promise<unknown>): Promise<boolean> {
  const held = new Promise<false>((resolve) => {
    setTimeout(() => {
      resolve(false);
    }, HELD_FOR_MS);
  });
  return Promise.race([promise.then(() => true as const), held]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a 401 while signed in runs the one refresh, never a re-send', () => {
  it('refreshes once, rejects the read without re-sending it, and the next read carries the new bearer', async () => {
    const api = fakeApi();
    api.releaseRefresh();
    const { session, callApi } = await signedInTab(api);

    const first = await callApi(MEMBERS_PATH, { schema: anything });

    expect(first).toMatchObject({ ok: false, status: UNAUTHORIZED, code: EXPIRED });
    expect(api.seen.map((s) => s.url)).toEqual([MEMBERS_PATH, CSRF_PATH, REFRESH_PATH]);
    expect(session.getAccessToken()).toBe('fresh');
    expect(session.getSessionStatus()).toBe('signedIn');

    const second = await callApi(MEMBERS_PATH, { schema: anything });
    expect(second.ok).toBe(true);
    expect(api.count(MEMBERS_PATH)).toBe(2);
    expect(api.count(REFRESH_PATH)).toBe(1);
  });

  it('concurrent 401s join ONE refresh', async () => {
    const api = fakeApi();
    const { callApi } = await signedInTab(api);

    const both = Promise.all([
      callApi(MEMBERS_PATH, { schema: anything }),
      callApi(ROLES_PATH, { schema: anything }),
    ]);
    await settledSoon(both);
    api.releaseRefresh();
    const [members, roles] = await both;

    expect(members.status).toBe(UNAUTHORIZED);
    expect(roles.status).toBe(UNAUTHORIZED);
    expect(api.count(CSRF_PATH)).toBe(1);
    expect(api.count(REFRESH_PATH)).toBe(1);
  });

  it('D-39: the 401 is not delivered while the refresh is in flight', async () => {
    const api = fakeApi();
    const { session, callApi } = await signedInTab(api);

    const read = callApi(MEMBERS_PATH, { schema: anything });
    expect(await settledSoon(read)).toBe(false);
    expect(api.count(REFRESH_PATH)).toBe(1);

    api.releaseRefresh();
    await read;
    // By the time the screen can learn of the 401, the session is already renewed.
    expect(session.getAccessToken()).toBe('fresh');
  });

  it('a refused refresh ends the session once, and a later 401 starts no second refresh', async () => {
    const api = fakeApi(fakeAdapter(UNAUTHORIZED, problem(UNAUTHORIZED, 'ERP-AUTH-0002')).adapter);
    api.releaseRefresh();
    const { session, callApi } = await signedInTab(api);

    const first = await callApi(MEMBERS_PATH, { schema: anything });
    expect(first.status).toBe(UNAUTHORIZED);
    expect(session.getSessionStatus()).toBe('signedOut');

    const again = await callApi(MEMBERS_PATH, { schema: anything });
    expect(again.status).toBe(UNAUTHORIZED);
    expect(api.count(REFRESH_PATH)).toBe(1);
    expect(api.count(MEMBERS_PATH)).toBe(2);
  });

  it('a mutation that answers 401 is never re-sent', async () => {
    const api = fakeApi();
    api.releaseRefresh();
    const { callApi } = await signedInTab(api);

    const saved = await callApi(MEMBERS_PATH, { method: 'POST', body: {}, schema: anything });

    expect(saved.status).toBe(UNAUTHORIZED);
    expect(api.seen.filter((s) => s.method === 'POST' && s.url === MEMBERS_PATH)).toHaveLength(1);
    expect(api.count(REFRESH_PATH)).toBe(1);
  });

  it('a 401 from a session-free path (a wrong password) starts no refresh', async () => {
    const api = fakeApi();
    api.releaseRefresh();
    const { callApi } = await signedInTab(api);

    const login = await callApi(LOGIN_PATH, { method: 'POST', body: {}, schema: anything });

    expect(login.status).toBe(UNAUTHORIZED);
    expect(api.count(CSRF_PATH)).toBe(0);
    expect(api.count(REFRESH_PATH)).toBe(0);
  });

  it('a 401 for a token another refresh already replaced starts no second refresh', async () => {
    const api = fakeApi();
    api.releaseRefresh();
    const { session, callApi } = await signedInTab(api);
    const answer = api.adapter;
    const { http } = await import('@/lib/api/http');
    http.defaults.adapter = async (config) => {
      // The renewal landed while this request was on the wire.
      session.setSession({ accessToken: 'fresh', csrfToken: 'c3' });
      return answer(config);
    };

    const read = await callApi(MEMBERS_PATH, { schema: anything });

    expect(read.status).toBe(UNAUTHORIZED);
    expect(api.count(REFRESH_PATH)).toBe(0);
  });
});

describe('the expiry gate: a token in its early window is renewed BEFORE the request goes out', () => {
  it('holds the request for the one refresh and sends it with the new bearer: no 401 at all', async () => {
    const api = fakeApi();
    api.releaseRefresh();
    const { session, callApi } = await signedInTab(api);
    const start = Date.now();
    session.setSession({ accessToken: 'stale', csrfToken: 'c1', expiresInS: LIFETIME_S });
    vi.spyOn(Date, 'now').mockReturnValue(start + LIFETIME_S * 1000);

    const read = await callApi(MEMBERS_PATH, { schema: anything });

    expect(read.ok).toBe(true);
    expect(api.seen.map((s) => s.url)).toEqual([CSRF_PATH, REFRESH_PATH, MEMBERS_PATH]);
    expect(api.seen.at(-1)?.bearer).toBe('Bearer fresh');
  });

  it('holds nothing while the token is young', async () => {
    const api = fakeApi();
    const { session, callApi } = await signedInTab(api);
    session.setSession({ accessToken: 'fresh', csrfToken: 'c1', expiresInS: LIFETIME_S });

    const read = await callApi(MEMBERS_PATH, { schema: anything });

    expect(read.ok).toBe(true);
    expect(api.seen.map((s) => s.url)).toEqual([MEMBERS_PATH]);
  });
});
