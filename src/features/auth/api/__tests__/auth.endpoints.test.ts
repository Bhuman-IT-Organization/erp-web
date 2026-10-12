import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { getApiStatus, resetApiStatus } from '@/lib/api/api-status';
import { fakeAdapter, networkFailureAdapter, problem } from '@/test/axios-fakes';
import {
  RETRYABLE_LOGIN_CODES,
  fetchCsrf,
  isRetryableLoginCode,
  login,
  logout,
  messageKeyFor,
  refresh,
} from '../auth.endpoints';
import authEn from '../../messages/en.json';

const LOGIN_OK = {
  accessToken: 'eyJ.access',
  tokenType: 'Bearer',
  expiresIn: 900,
  csrfToken: 'csrf-1',
  user: { staffId: 7, email: 'a@b.c', firstName: 'A', lastName: 'B', isAdmin: false },
};

const input = { email: 'a@b.c', password: 'pw' };

describe('auth endpoints', () => {
  beforeEach(() => {
    resetApiStatus();
  });

  it('login 200 -> ok with the parsed user', async () => {
    const r = await login(input, fakeAdapter(200, LOGIN_OK).adapter);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.user).toEqual(LOGIN_OK.user);
      expect(r.data.accessToken).toBe('eyJ.access');
      expect(r.data.csrfToken).toBe('csrf-1');
    }
  });

  it.each([
    ['absent (an older api)', undefined],
    ['null (default_language unset)', null],
    ['a BCP-47 tag', 'ar'],
  ])('login 200 parses user.locale when %s', async (_label, locale) => {
    const user = locale === undefined ? LOGIN_OK.user : { ...LOGIN_OK.user, locale };
    const r = await login(input, fakeAdapter(200, { ...LOGIN_OK, user }).adapter);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.user.locale).toBe(locale);
  });

  it('login sends POST /api/v1/auth/login with credentials and the JSON input', async () => {
    const fake = fakeAdapter(200, LOGIN_OK);
    await login(input, fake.adapter);
    expect(fake.calls[0]?.url).toBe('/api/v1/auth/login');
    expect(fake.calls[0]?.method).toBe('POST');
    expect(fake.calls[0]?.withCredentials).toBe(true);
    expect(fake.calls[0]?.data).toEqual(input);
    expect(fake.calls[0]?.headers['content-type']).toBe('application/json');
  });

  it('login 401 problem -> ERP-AUTH-0001', async () => {
    const r = await login(input, fakeAdapter(401, problem(401, 'ERP-AUTH-0001')).adapter);
    expect(r).toEqual({ ok: false, status: 401, code: 'ERP-AUTH-0001', retryAfterS: null });
  });

  it('login 429 with Retry-After 30 -> retryAfterS 30', async () => {
    const fake = fakeAdapter(429, problem(429, 'ERP-AUTH-0006'), { 'retry-after': '30' });
    const r = await login(input, fake.adapter);
    expect(r).toEqual({ ok: false, status: 429, code: 'ERP-AUTH-0006', retryAfterS: 30 });
  });

  it('login 503 ERP-UPSTREAM-0001 -> retryAfterS 10 and the transport called exactly once (never retried)', async () => {
    const fake = fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'), { 'retry-after': '10' });
    const r = await login(input, fake.adapter);
    expect(r).toEqual({ ok: false, status: 503, code: 'ERP-UPSTREAM-0001', retryAfterS: 10 });
    expect(fake.spy).toHaveBeenCalledTimes(1);
    expect(getApiStatus()).toMatchObject({ reachable: false, retryAfterS: 10 });
  });

  it('login 200 with a body missing csrfToken -> ERP-CLIENT-0001', async () => {
    const withoutCsrf: Partial<typeof LOGIN_OK> = { ...LOGIN_OK };
    delete withoutCsrf.csrfToken;
    const r = await login(input, fakeAdapter(200, withoutCsrf).adapter);
    expect(r).toMatchObject({ ok: false, code: 'ERP-CLIENT-0001' });
  });

  it('login connection failure -> ERP-NETWORK-0001, called once', async () => {
    const fake = networkFailureAdapter();
    const r = await login(input, fake.adapter);
    expect(r).toEqual({ ok: false, status: 0, code: 'ERP-NETWORK-0001', retryAfterS: null });
    expect(fake.spy).toHaveBeenCalledTimes(1);
  });

  it('fetchCsrf is a GET of /api/v1/auth/csrf', async () => {
    const fake = fakeAdapter(200, { csrfToken: 'c' });
    const r = await fetchCsrf(fake.adapter);
    expect(r).toEqual({ ok: true, status: 200, data: { csrfToken: 'c' } });
    expect(fake.calls[0]?.url).toBe('/api/v1/auth/csrf');
    expect(fake.calls[0]?.method).toBe('GET');
  });

  it("refresh('tok') posts with header x-csrf-token: tok", async () => {
    const fake = fakeAdapter(200, LOGIN_OK);
    const r = await refresh('tok', fake.adapter);
    expect(r.ok).toBe(true);
    expect(fake.calls[0]?.url).toBe('/api/v1/auth/refresh');
    expect(fake.calls[0]?.method).toBe('POST');
    expect(fake.calls[0]?.headers['x-csrf-token']).toBe('tok');
  });

  it("logout('a','c') sends the bearer and the csrf header and maps 204 -> ok", async () => {
    const fake = fakeAdapter(204);
    const r = await logout('a', 'c', fake.adapter);
    expect(r).toEqual({ ok: true, status: 204, data: null });
    expect(fake.calls[0]?.headers.authorization).toBe('Bearer a');
    expect(fake.calls[0]?.headers['x-csrf-token']).toBe('c');
    expect(fake.calls[0]?.url).toBe('/api/v1/auth/logout');
  });

  it('messageKeyFor answers a key under auth.errors plus the ICU values, never text', () => {
    expect(messageKeyFor('ERP-AUTH-0001', null)).toEqual({
      key: 'errors.ERP-AUTH-0001',
      values: { seconds: 'none' },
    });
    expect(messageKeyFor('ERP-AUTH-0006', 30)).toEqual({
      key: 'errors.ERP-AUTH-0006',
      values: { seconds: '30' },
    });
    expect(messageKeyFor('ERP-UPSTREAM-0001', 10)).toEqual({
      key: 'errors.ERP-UPSTREAM-0001',
      values: { seconds: '10' },
    });
    for (const code of [
      'ERP-AUTH-0007',
      'ERP-VALIDATION-0001',
      'ERP-NETWORK-0001',
      'ERP-TIMEOUT-0001',
    ]) {
      expect(messageKeyFor(code, null).key).toBe(`errors.${code}`);
    }
    expect(messageKeyFor('ERP-HTTP-500', null)).toEqual({
      key: 'errors.unknown',
      values: { code: 'ERP-HTTP-500' },
    });
  });

  it('every known code has an English message, and the retryable set is unchanged', () => {
    const errors = authEn.auth.errors as Record<string, string>;
    for (const code of [
      'ERP-AUTH-0001',
      'ERP-AUTH-0006',
      'ERP-AUTH-0007',
      'ERP-VALIDATION-0001',
      'ERP-UPSTREAM-0001',
      'ERP-NETWORK-0001',
      'ERP-TIMEOUT-0001',
    ]) {
      expect(errors[code], code).toBeTruthy();
      expect(messageKeyFor(code, null).key).toBe(`errors.${code}`);
    }
    expect(errors.unknown).not.toContain('{code}'); // D-32: no code is ever rendered
    expect(RETRYABLE_LOGIN_CODES).toEqual([
      'ERP-UPSTREAM-0001',
      'ERP-NETWORK-0001',
      'ERP-TIMEOUT-0001',
    ]);
    expect(isRetryableLoginCode('ERP-TIMEOUT-0001')).toBe(true);
    expect(isRetryableLoginCode('ERP-AUTH-0001')).toBe(false);
  });

  it('the source imports no axios, calls no raw transport and holds no duration literal (callApi owns them)', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../auth.endpoints.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/from 'axios'/);
    expect(source).not.toMatch(/\baxios\(/);
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/AbortSignal/);
    expect(source).not.toMatch(/\d_000/);
    expect(source).toMatch(/callApi\(/);
  });
});
