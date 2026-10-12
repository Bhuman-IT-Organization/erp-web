import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeAdapter } from '@/test/axios-fakes';
import { clearSession, setSession } from '@/lib/auth/session';
import { ApiError } from '../api-error';
import { getApiStatus, resetApiStatus } from '../api-status';
import { http, toApiError } from '../http';

const config = { headers: new AxiosHeaders() };

describe('http (the one axios instance)', () => {
  beforeEach(() => {
    resetApiStatus();
    clearSession();
  });
  afterEach(() => {
    clearSession();
  });

  it('has no retry layer: no axios-retry, exactly one response interceptor pair', () => {
    // Interceptor handlers are internal; a retry interceptor would show as a second entry.
    const handlers = (http.interceptors.response as unknown as { handlers: unknown[] }).handlers;
    expect(handlers.filter(Boolean)).toHaveLength(1);
  });

  it('attaches the in-memory bearer token when one is set', async () => {
    setSession({ accessToken: 'at', csrfToken: 'ct' });
    const fake = fakeAdapter(200, {});
    await http.get('/api/v1/auth/me', { adapter: fake.adapter });
    expect(fake.calls[0]?.headers.authorization).toBe('Bearer at');
  });

  it('sends no authorization header without a session', async () => {
    const fake = fakeAdapter(200, {});
    await http.get('/api/v1/health', { adapter: fake.adapter });
    expect(fake.calls[0]?.headers.authorization).toBeUndefined();
  });

  it('an explicit authorization header wins over the session token', async () => {
    setSession({ accessToken: 'at', csrfToken: 'ct' });
    const fake = fakeAdapter(204);
    await http.post('/api/v1/auth/logout', undefined, {
      adapter: fake.adapter,
      headers: { authorization: 'Bearer explicit' },
    });
    expect(fake.calls[0]?.headers.authorization).toBe('Bearer explicit');
  });

  it('rejects with ApiError carrying status, code and Retry-After', async () => {
    const fake = fakeAdapter(429, { code: 'ERP-AUTH-0006' }, { 'retry-after': '30' });
    const err = await http
      .post('/api/v1/auth/login', {}, { adapter: fake.adapter })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, code: 'ERP-AUTH-0006', retryAfterS: 30 });
    expect((err as ApiError).retryable).toBe(false);
    expect(getApiStatus().reachable).toBe(true);
  });

  describe('toApiError', () => {
    it('maps ECONNABORTED (the axios timeout) to ERP-TIMEOUT-0001 with status 0', () => {
      const e = toApiError(
        new AxiosError('timeout of 50ms exceeded', AxiosError.ECONNABORTED, config),
      );
      expect(e).toMatchObject({ status: 0, code: 'ERP-TIMEOUT-0001', retryAfterS: null });
      expect(e.retryable).toBe(true);
    });

    it('maps ETIMEDOUT (clarifyTimeoutError) to ERP-TIMEOUT-0001 too', () => {
      expect(toApiError(new AxiosError('t', AxiosError.ETIMEDOUT, config)).code).toBe(
        'ERP-TIMEOUT-0001',
      );
    });

    it('maps ERR_NETWORK / ECONNREFUSED to ERP-NETWORK-0001', () => {
      expect(toApiError(new AxiosError('n', AxiosError.ERR_NETWORK, config)).code).toBe(
        'ERP-NETWORK-0001',
      );
      expect(toApiError(new AxiosError('n', 'ECONNREFUSED', config)).code).toBe('ERP-NETWORK-0001');
    });

    it('a 4xx and a 5xx stay distinguishable through status', () => {
      const res = (status: number) => ({
        data: { code: `X-${String(status)}` },
        status,
        statusText: '',
        headers: {},
        config: config as never,
      });
      const bad = toApiError(new AxiosError('4', 'ERR_BAD_REQUEST', config, null, res(404)));
      const down = toApiError(new AxiosError('5', 'ERR_BAD_RESPONSE', config, null, res(502)));
      expect(bad.retryable).toBe(false);
      expect(down.retryable).toBe(true);
      expect(bad.code).toBe('X-404');
    });

    it('passes an ApiError through and maps a foreign error to network', () => {
      const own = new ApiError(503, 'x', 1);
      expect(toApiError(own)).toBe(own);
      expect(toApiError(new Error('boom')).code).toBe('ERP-NETWORK-0001');
    });
  });
});

describe('a staff read', () => {
  afterEach(() => {
    clearSession();
  });

  it('a staff read keeps its adapter and its credentials', async () => {
    setSession({ accessToken: 'at', csrfToken: 'ct' });
    const fake = fakeAdapter(200, {});
    await http.get('/api/v1/auth/me', { adapter: fake.adapter });
    expect(fake.calls[0]?.withCredentials).toBe(true);
    expect(fake.calls[0]?.headers.authorization).toBe('Bearer at');
  });
});
