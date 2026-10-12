import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fakeAdapter, networkFailureAdapter, problem } from '@/test/axios-fakes';
import { ApiError } from '../api-error';
import { getApiStatus, resetApiStatus } from '../api-status';
import { callApi, HTTP_NO_CONTENT, swrFetcher } from '../call-api';
import { http } from '../http';

const schema = z.object({ id: z.number() });

/** A server that accepts the connection and never answers, to prove the axios timeout. */
let hung: Server;
let hungOrigin: string;

beforeAll(async () => {
  hung = createServer(() => {
    /* never respond */
  });
  await new Promise<void>((resolve) => hung.listen(0, '127.0.0.1', resolve));
  const { port } = hung.address() as AddressInfo;
  hungOrigin = `http://127.0.0.1:${String(port)}`;
});

afterAll(async () => {
  hung.closeAllConnections();
  await new Promise<void>((resolve) => {
    hung.close(() => {
      resolve();
    });
  });
});

describe('callApi (axios instance, ADR-0002 / ADR-0031 §5)', () => {
  beforeEach(() => {
    resetApiStatus();
  });
  afterEach(() => {
    delete http.defaults.adapter;
    delete http.defaults.baseURL;
    vi.restoreAllMocks();
  });

  it('(a) 200 with a valid body: ok, parsed, credentials, accept json, timeout from CLIENT_TIMINGS', async () => {
    const fake = fakeAdapter(200, { id: 7 });
    const result = await callApi('/api/v1/things', { schema, adapter: fake.adapter });
    expect(result).toEqual({ ok: true, status: 200, data: { id: 7 } });
    expect(fake.calls).toHaveLength(1);
    const req = fake.calls[0];
    expect(req?.url).toBe('/api/v1/things');
    expect(req?.method).toBe('GET');
    expect(req?.withCredentials).toBe(true);
    expect(req?.headers.accept).toBe('application/json');
    expect(req?.timeout).toBe(10_000);
    expect(getApiStatus().reachable).toBe(true);
  });

  it('(b) 200 with a body failing the schema: ERP-CLIENT-0001', async () => {
    const result = await callApi('/api/v1/things', {
      schema,
      adapter: fakeAdapter(200, { nope: true }).adapter,
    });
    expect(result).toEqual({ ok: false, status: 200, code: 'ERP-CLIENT-0001', retryAfterS: null });
  });

  it('(c) 401 problem body: returned after exactly one request and leaves the API reachable', async () => {
    const fake = fakeAdapter(401, problem(401, 'ERP-AUTH-0001'));
    const result = await callApi('/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'a@b.c', password: 'x' },
      schema,
      adapter: fake.adapter,
    });
    expect(result).toEqual({ ok: false, status: 401, code: 'ERP-AUTH-0001', retryAfterS: null });
    expect(fake.spy).toHaveBeenCalledTimes(1);
    expect(getApiStatus().reachable).toBe(true);
  });

  it('(d) 503 ERP-UPSTREAM-0001 with Retry-After 10 marks the API unreachable, once', async () => {
    const fake = fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'), { 'retry-after': '10' });
    const result = await callApi('/api/v1/things', { schema, adapter: fake.adapter });
    expect(result).toEqual({ ok: false, status: 503, code: 'ERP-UPSTREAM-0001', retryAfterS: 10 });
    expect(getApiStatus()).toMatchObject({ reachable: false, retryAfterS: 10 });
    expect(fake.spy).toHaveBeenCalledTimes(1);
  });

  it('(e) a server that never answers is cut by the axios timeout (ECONNABORTED): ERP-TIMEOUT-0001, status 0, unreachable', async () => {
    http.defaults.baseURL = hungOrigin;
    const started = Date.now();
    const result = await callApi('/api/v1/things', { schema, timeoutMs: 50 });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result).toEqual({ ok: false, status: 0, code: 'ERP-TIMEOUT-0001', retryAfterS: null });
    expect(getApiStatus().reachable).toBe(false);
  });

  it('(f) a connection failure (no response): ERP-NETWORK-0001, unreachable', async () => {
    const result = await callApi('/api/v1/things', {
      schema,
      adapter: networkFailureAdapter().adapter,
    });
    expect(result).toEqual({ ok: false, status: 0, code: 'ERP-NETWORK-0001', retryAfterS: null });
    expect(getApiStatus().reachable).toBe(false);
  });

  it('(g) a 200 after a 503 flips the state back to reachable', async () => {
    await callApi('/api/v1/things', {
      schema,
      adapter: fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001')).adapter,
    });
    expect(getApiStatus().reachable).toBe(false);
    await callApi('/api/v1/things', { schema, adapter: fakeAdapter(200, { id: 1 }).adapter });
    expect(getApiStatus().reachable).toBe(true);
  });

  it('(h) expectNoContent maps a 204 to ok with data null', async () => {
    const result = await callApi('/api/v1/auth/logout', {
      method: 'POST',
      schema: z.null(),
      expectNoContent: true,
      adapter: fakeAdapter(204).adapter,
    });
    expect(result).toEqual({ ok: true, status: 204, data: null });
  });

  it('(i) swrFetcher throws ApiError: retryable for the 503, not for a 404', async () => {
    http.defaults.adapter = fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'), {
      'retry-after': '10',
    }).adapter;
    const err = await swrFetcher(schema)('/api/v1/things').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 503, code: 'ERP-UPSTREAM-0001', retryAfterS: 10 });
    expect((err as ApiError).retryable).toBe(true);

    http.defaults.adapter = fakeAdapter(404, problem(404, 'ERP-HTTP-0404')).adapter;
    const notFound = await swrFetcher(schema)('/api/v1/things').catch((e: unknown) => e);
    expect((notFound as ApiError).retryable).toBe(false);
  });

  it('swrFetcher with headers (opt-in, 04.7-12): a tuple key, its URL fetched with the headers', async () => {
    const fake = fakeAdapter(200, { id: 3 });
    http.defaults.adapter = fake.adapter;
    const headers = { 'X-Made-Up': 'zz' };
    await expect(swrFetcher(schema, headers)(['/api/v1/things', headers])).resolves.toEqual({
      id: 3,
    });
    await swrFetcher(schema)('/api/v1/things');
    expect(fake.calls.map((call) => call.url)).toEqual(['/api/v1/things', '/api/v1/things']);
    expect(fake.calls[0]?.headers['x-made-up']).toBe('zz');
    expect(fake.calls[1]?.headers['x-made-up']).toBeUndefined();
  });

  it('a non-problem error body falls back to ERP-HTTP-<status>; a plain 500 is not "unreachable"', async () => {
    const result = await callApi('/api/v1/things', {
      schema,
      adapter: fakeAdapter(500, 'oops').adapter,
    });
    expect(result).toEqual({ ok: false, status: 500, code: 'ERP-HTTP-500', retryAfterS: null });
    expect(getApiStatus().reachable).toBe(true);
  });

  it('a POST carries the JSON body and extra headers; a GET has no body', async () => {
    const get = fakeAdapter(200, { id: 1 });
    await callApi('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'x-csrf-token': 'tok' },
      schema,
      adapter: get.adapter,
    });
    expect(get.calls[0]?.method).toBe('POST');
    expect(get.calls[0]?.data).toBeUndefined();
    expect(get.calls[0]?.headers['x-csrf-token']).toBe('tok');

    const post = fakeAdapter(200, { id: 1 });
    await callApi('/api/v1/auth/login', {
      method: 'POST',
      body: { a: 1 },
      schema,
      adapter: post.adapter,
    });
    expect(post.calls[0]?.data).toEqual({ a: 1 });
    expect(post.calls[0]?.headers['content-type']).toBe('application/json');
  });

  it('ifMatch sends If-Match (ADR-0040), merged with the other headers', async () => {
    const fake = fakeAdapter(200, { id: 1 });
    await callApi('/api/v1/things/1', {
      method: 'PUT',
      body: { a: 1 },
      headers: { 'x-csrf-token': 'tok' },
      ifMatch: '"x"',
      schema,
      adapter: fake.adapter,
    });
    expect(fake.calls[0]?.headers['if-match']).toBe('"x"');
    expect(fake.calls[0]?.headers['x-csrf-token']).toBe('tok');
  });

  it('idempotencyKey sends Idempotency-Key (BE-15), merged with the other headers', async () => {
    const fake = fakeAdapter(200, { id: 1 });
    await callApi('/api/v1/things', {
      method: 'POST',
      body: { a: 1 },
      headers: { 'x-csrf-token': 'tok' },
      idempotencyKey: 'k',
      schema,
      adapter: fake.adapter,
    });
    expect(fake.calls[0]?.headers['idempotency-key']).toBe('k');
    expect(fake.calls[0]?.headers['x-csrf-token']).toBe('tok');
  });

  it('without ifMatch and idempotencyKey neither header is sent', async () => {
    const fake = fakeAdapter(200, { id: 1 });
    await callApi('/api/v1/things', { method: 'POST', body: {}, schema, adapter: fake.adapter });
    expect(fake.calls[0]?.headers).not.toHaveProperty('if-match');
    expect(fake.calls[0]?.headers).not.toHaveProperty('idempotency-key');
  });

  it('never retries on its own: a failing adapter is invoked exactly once per call', async () => {
    const fake = fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'));
    await callApi('/api/v1/things', { schema, adapter: fake.adapter });
    expect(fake.spy).toHaveBeenCalledTimes(1);
  });

  it('a 400 ERP-VALIDATION-0001 problem body surfaces its issues (A1: problem-details.filter.ts:79)', async () => {
    const issues = [{ path: ['email'], message: 'Invalid email' }];
    const result = await callApi('/api/v1/things', {
      method: 'POST',
      body: { email: 'x' },
      schema,
      adapter: fakeAdapter(400, { ...problem(400, 'ERP-VALIDATION-0001'), issues }).adapter,
    });
    expect(result).toEqual({
      ok: false,
      status: 400,
      code: 'ERP-VALIDATION-0001',
      retryAfterS: null,
      issues,
    });
    // A problem body without issues carries no `issues` key at all.
    const plain = await callApi('/api/v1/things', {
      schema,
      adapter: fakeAdapter(404, problem(404, 'ERP-HTTP-0404')).adapter,
    });
    expect(plain).not.toHaveProperty('issues');
  });

  it('swrFetcher carries the issues on the thrown ApiError', async () => {
    const issues = [{ path: ['name'], message: 'Required' }];
    http.defaults.adapter = fakeAdapter(400, {
      ...problem(400, 'ERP-VALIDATION-0001'),
      issues,
    }).adapter;
    const err = await swrFetcher(schema)('/api/v1/things').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).issues).toEqual(issues);
  });

  it.each(['PUT', 'PATCH', 'DELETE'] as const)(
    '%s reaches the adapter with that method',
    async (method) => {
      const fake = fakeAdapter(200, { id: 1 });
      await callApi('/api/v1/things/1', { method, body: { a: 1 }, schema, adapter: fake.adapter });
      expect(fake.calls[0]?.method).toBe(method);
      expect(fake.calls[0]?.url).toBe('/api/v1/things/1');
    },
  );

  it('HTTP_NO_CONTENT names the 204 expectNoContent maps', () => {
    expect(HTTP_NO_CONTENT).toBe(204);
  });
});
