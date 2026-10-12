import { AxiosHeaders, type AxiosAdapter } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fakeAdapter, problem } from '@/test/axios-fakes';

/**
 * The first-paint authorization race (quick task 260925-401, found in the Phase 3.1 UAT).
 *
 * A full navigation into the shell has NO in-memory access token (ADR-0005): `PageShell`'s effect
 * starts the `csrf → refresh` bootstrap, but a data hook's own effect runs BEFORE its parent's, so
 * the first list request could go out while the token was still `null`. The interceptor sent it
 * anyway, bearer-less, and the api answered `401 ERP-AUTH-0004` — a 4xx, so `ApiError.retryable`
 * is false and SWR never retries it: the screen rendered `staff.errors.ERP-AUTH-0004`
 * ("Sign in to continue") with no Try again, and recovered only on a refocus or a reload.
 *
 * The fix is in ONE place, `http.ts`'s request interceptor: while the status is `pending` a request
 * WAITS for this tab's one bootstrap and then carries the bearer. No hook gates its own SWR key for
 * this, and no retry layer is involved — a held request never 401s in the first place.
 *
 * Every test builds a fresh module graph (`vi.resetModules`) so the session store, the axios
 * instance and the bootstrap registration of one test cannot leak into the next.
 */
const MEMBERS_PATH = '/api/v1/identity/members?limit=25';
const ROLES_PATH = '/api/v1/identity/roles?limit=25';
const CSRF_PATH = '/api/v1/auth/csrf';
const REFRESH_PATH = '/api/v1/auth/refresh';
const LOGIN_PATH = '/api/v1/auth/login';
const LOGOUT_PATH = '/api/v1/auth/logout';
const ME_PATH = '/api/v1/auth/me';
const OK = 200;
const UNAUTHORIZED = 401;
const MISSING_BEARER = 'ERP-AUTH-0004';

const listSchema = z.object({ data: z.array(z.object({ id: z.number() })) });
const LIST_BODY = { data: [{ id: 1 }], meta: { nextCursor: null } };

interface Seen {
  readonly url: string;
  readonly bearer: string | undefined;
}

/**
 * The api as the browser meets it: `csrf` answers at once, `refresh` waits for `releaseRefresh` (so
 * a test can hold the bootstrap in flight for as long as it likes), and every other path answers
 * `401 ERP-AUTH-0004` without a bearer and `200` with one — exactly what erp-api's guard does.
 */
function fakeApi() {
  const csrf = fakeAdapter(OK, { csrfToken: 'c1' });
  const refreshed = fakeAdapter(OK, { accessToken: 'a1', csrfToken: 'c2' });
  const list = fakeAdapter(OK, LIST_BODY);
  const refused = fakeAdapter(UNAUTHORIZED, problem(UNAUTHORIZED, MISSING_BEARER));
  const seen: Seen[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = () => {
      resolve();
    };
  });
  const adapter: AxiosAdapter = async (config) => {
    const url = config.url ?? '';
    const header = AxiosHeaders.from(config.headers).get('authorization');
    const bearer = typeof header === 'string' ? header : undefined;
    seen.push({ url, bearer });
    if (url === CSRF_PATH) return csrf.adapter(config);
    if (url === REFRESH_PATH) {
      await gate;
      return refreshed.adapter(config);
    }
    return bearer === undefined ? refused.adapter(config) : list.adapter(config);
  };
  return { adapter, seen, releaseRefresh: release, urls: () => seen.map((s) => s.url) };
}

/** Answers everything `200 {}` and records the authorization header each request carried. */
function echoApi() {
  const ok = fakeAdapter(OK, {});
  const seen: Seen[] = [];
  const adapter: AxiosAdapter = (config) => {
    const header = AxiosHeaders.from(config.headers).get('authorization');
    seen.push({
      url: config.url ?? '',
      bearer: typeof header === 'string' ? header : undefined,
    });
    return ok.adapter(config);
  };
  return { adapter, seen, urls: () => seen.map((s) => s.url) };
}

/** A macrotask boundary: every pending microtask chain has run by the time it resolves. */
const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/** A fresh session store, axios instance and `callApi`, with NO bootstrap registered yet. */
async function freshGate() {
  vi.resetModules();
  const session = await import('@/lib/auth/session');
  const { http } = await import('@/lib/api/http');
  const { callApi } = await import('@/lib/api/call-api');
  return { session, http, callApi };
}

/**
 * A fresh transport WITH the real bootstrap: importing `use-session` is what registers this tab's
 * one recovery on the session store, which is precisely what the interceptor awaits.
 */
async function freshShell() {
  const gate = await freshGate();
  const { bootstrapSession } = await import('@/lib/hooks/use-session');
  return { ...gate, bootstrapSession };
}

type Http = Awaited<ReturnType<typeof freshGate>>['http'];

const SENT = 'sent';
const HELD = 'held';
const HELD_FOR_MS = 50;

type Dispatched = typeof SENT | typeof HELD;

/** Was the request dispatched to the adapter, or is the gate still holding it? */
function dispatch(http: Http, url: string, method = 'get'): Promise<Dispatched> {
  const sent = http.request({ url, method }).then((): Dispatched => SENT);
  return Promise.race([sent, heldAfter()]);
}

/** Resolves `held` once nothing more is going to happen on its own. */
function heldAfter(): Promise<Dispatched> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(HELD);
    }, HELD_FOR_MS);
  });
}

/** A bootstrap that never settles: anything the gate holds for it stays held. */
const neverSettles = () => new Promise<void>(() => undefined);

describe('the session gate in the request interceptor (the real bootstrap)', () => {
  it('holds a request issued while the bootstrap is in flight, then sends it with the bearer', async () => {
    const api = fakeApi();
    const { http, callApi, bootstrapSession } = await freshShell();
    http.defaults.adapter = api.adapter;

    // The UAT sequence: the bootstrap is in flight (PageShell's effect) and the list request is
    // issued before it settles (the child hook's effect ran first).
    const bootstrap = bootstrapSession();
    const members = callApi(MEMBERS_PATH, { schema: listSchema });
    await settle();
    // The request is HELD, not sent bearer-less: only the bootstrap's own two calls have gone out.
    expect(api.urls()).toEqual([CSRF_PATH, REFRESH_PATH]);

    api.releaseRefresh();
    const result = await members;
    await bootstrap;

    expect(result).toMatchObject({ ok: true, status: OK });
    expect(api.seen.filter((s) => s.url === MEMBERS_PATH)).toEqual([
      { url: MEMBERS_PATH, bearer: 'Bearer a1' },
    ]);
  });

  it('starts the bootstrap itself when a request is the first thing to happen', async () => {
    const api = fakeApi();
    api.releaseRefresh();
    const { http, callApi } = await freshShell();
    http.defaults.adapter = api.adapter;

    const result = await callApi(MEMBERS_PATH, { schema: listSchema });

    expect(result).toMatchObject({ ok: true, status: OK });
    expect(api.urls()).toEqual([CSRF_PATH, REFRESH_PATH, MEMBERS_PATH]);
  });

  it('joins the one bootstrap: two racing requests do not start a second csrf → refresh', async () => {
    const api = fakeApi();
    const { http, callApi, bootstrapSession } = await freshShell();
    http.defaults.adapter = api.adapter;

    const bootstrap = bootstrapSession();
    const both = Promise.all([
      callApi(MEMBERS_PATH, { schema: listSchema }),
      callApi(ROLES_PATH, { schema: listSchema }),
    ]);
    await settle();
    api.releaseRefresh();
    const [members, roles] = await both;
    await bootstrap;

    expect(api.urls().filter((u) => u === CSRF_PATH)).toHaveLength(1);
    expect(api.urls().filter((u) => u === REFRESH_PATH)).toHaveLength(1);
    expect(members.ok).toBe(true);
    expect(roles.ok).toBe(true);
  });
});

describe('what the gate holds, and what it never holds', () => {
  it('never holds the session-free paths — the bootstrap would be waiting for itself', async () => {
    const { session, http } = await freshGate();
    const recovery = vi.fn(neverSettles);
    session.setSessionRecovery(recovery);
    http.defaults.adapter = echoApi().adapter;

    expect(await dispatch(http, CSRF_PATH)).toBe(SENT);
    expect(await dispatch(http, REFRESH_PATH, 'post')).toBe(SENT);
    expect(await dispatch(http, LOGIN_PATH, 'post')).toBe(SENT);
    expect(await dispatch(http, LOGOUT_PATH, 'post')).toBe(SENT);
    // Not even consulted: a request that establishes a session asks nothing of one.
    expect(recovery).not.toHaveBeenCalled();
  });

  it('holds /api/v1/auth/me and every data path while the bootstrap is unsettled', async () => {
    const { session, http } = await freshGate();
    session.setSessionRecovery(neverSettles);
    const api = echoApi();
    http.defaults.adapter = api.adapter;

    expect(await dispatch(http, ME_PATH)).toBe(HELD);
    expect(await dispatch(http, MEMBERS_PATH)).toBe(HELD);
    expect(api.urls()).toEqual([]);
  });

  it('lets the request through bearer-less when the bootstrap settles signed out', async () => {
    const { session, http, callApi } = await freshGate();
    session.setSessionRecovery(async () => {
      await Promise.resolve();
      session.markSignedOut();
    });
    const api = fakeApi();
    http.defaults.adapter = api.adapter;

    const result = await callApi(MEMBERS_PATH, { schema: listSchema });

    // Its honest 401, once. Nothing hangs and nothing retries: the gate holds a request at most
    // once, before it is ever sent, and a 4xx is not retryable (SWR stays the only retry layer).
    expect(result).toMatchObject({ ok: false, status: UNAUTHORIZED, code: MISSING_BEARER });
    expect(api.seen).toEqual([{ url: MEMBERS_PATH, bearer: undefined }]);
  });

  it('attaches no token when the session was cleared while the request waited', async () => {
    const { session, http } = await freshGate();
    session.setSessionRecovery(async () => {
      await Promise.resolve();
      session.setSession({ accessToken: 'bootstrapped', csrfToken: 'c1' });
      // A sign-out overtakes the bootstrap, and another session is established after it.
      session.clearSession();
      session.setSession({ accessToken: 'someone-else', csrfToken: 'c2' });
    });
    const api = echoApi();
    http.defaults.adapter = api.adapter;

    expect(await dispatch(http, MEMBERS_PATH)).toBe(SENT);
    expect(api.seen).toEqual([{ url: MEMBERS_PATH, bearer: undefined }]);
  });

  it('does not wait twice when the bootstrap leaves the status pending', async () => {
    const { session, http } = await freshGate();
    const recovery = vi.fn(async () => {
      await Promise.resolve();
      // What `bootstrapSession` does when a `clearSession` overtook it: it drops its own result.
      session.clearSession();
    });
    session.setSessionRecovery(recovery);
    http.defaults.adapter = echoApi().adapter;

    expect(await dispatch(http, MEMBERS_PATH)).toBe(SENT);
    expect(recovery).toHaveBeenCalledTimes(1);
    expect(session.getSessionStatus()).toBe('pending');
  });

  it('waits for nothing once the status is settled', async () => {
    const { session, http } = await freshGate();
    const recovery = vi.fn(neverSettles);
    session.setSessionRecovery(recovery);
    const api = echoApi();
    http.defaults.adapter = api.adapter;
    session.setSession({ accessToken: 'at', csrfToken: 'ct' });

    expect(await dispatch(http, MEMBERS_PATH)).toBe(SENT);
    expect(api.seen).toEqual([{ url: MEMBERS_PATH, bearer: 'Bearer at' }]);
    expect(recovery).not.toHaveBeenCalled();
  });

  it('proceeds at once where no bootstrap is registered at all (the /login page)', async () => {
    const { http } = await freshGate();
    const api = echoApi();
    http.defaults.adapter = api.adapter;

    expect(await dispatch(http, MEMBERS_PATH)).toBe(SENT);
    expect(api.seen).toEqual([{ url: MEMBERS_PATH, bearer: undefined }]);
  });

  it('an explicit authorization header wins and skips the wait (logout carries its own)', async () => {
    const { session, http } = await freshGate();
    const recovery = vi.fn(neverSettles);
    session.setSessionRecovery(recovery);
    const api = echoApi();
    http.defaults.adapter = api.adapter;

    const sent = await Promise.race([
      http
        .request({
          url: MEMBERS_PATH,
          method: 'get',
          headers: { authorization: 'Bearer explicit' },
        })
        .then((): Dispatched => SENT),
      heldAfter(),
    ]);

    expect(sent).toBe(SENT);
    expect(api.seen).toEqual([{ url: MEMBERS_PATH, bearer: 'Bearer explicit' }]);
    expect(recovery).not.toHaveBeenCalled();
  });
});
