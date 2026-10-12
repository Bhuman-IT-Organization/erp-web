import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { INVALID_PAYLOAD, serverFetchJson, serverUrl } from '../server-fetch';

const schema = z.object({ id: z.number() });
const BASE = 'http://nginx';
const TIMEOUT_MS = 500;

function jsonResponse(status: number, body: unknown) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

describe('serverUrl', () => {
  it('strips one trailing slash from the base and appends the path', () => {
    expect(serverUrl('http://nginx/', '/api/v1/x')).toBe('http://nginx/api/v1/x');
    expect(serverUrl('http://nginx', '/api/v1/x')).toBe('http://nginx/api/v1/x');
  });
});

describe('serverFetchJson (the one server-side fetch helper, ADR-0031 §5)', () => {
  it('a 200 parsed by the schema is ok; the request is no-store, accept json, with a timeout signal', async () => {
    const impl = jsonResponse(200, { id: 3 });
    const result = await serverFetchJson(`${BASE}/`, '/api/v1/x', schema, TIMEOUT_MS, impl);
    expect(result).toEqual({ ok: true, status: 200, data: { id: 3 } });
    const [url, init] = impl.mock.calls[0] ?? [];
    expect(url).toBe('http://nginx/api/v1/x');
    expect(init).toMatchObject({ cache: 'no-store', headers: { accept: 'application/json' } });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('a non-2xx is a failure carrying the status; its body is data only when it parses', async () => {
    await expect(
      serverFetchJson(BASE, '/api/v1/x', schema, TIMEOUT_MS, jsonResponse(503, { nope: 1 })),
    ).resolves.toEqual({ ok: false, status: 503, error: 'HTTP 503' });
    await expect(
      serverFetchJson(BASE, '/api/v1/x', schema, TIMEOUT_MS, jsonResponse(503, { id: 9 })),
    ).resolves.toEqual({ ok: false, status: 503, error: 'HTTP 503', data: { id: 9 } });
  });

  it('a 2xx body failing the schema or not JSON at all is "invalid payload"', async () => {
    await expect(
      serverFetchJson(BASE, '/api/v1/x', schema, TIMEOUT_MS, jsonResponse(200, { nope: 1 })),
    ).resolves.toEqual({ ok: false, status: 200, error: INVALID_PAYLOAD });
    const notJson: typeof fetch = () => Promise.resolve(new Response('<html>', { status: 200 }));
    await expect(serverFetchJson(BASE, '/api/v1/x', schema, TIMEOUT_MS, notJson)).resolves.toEqual({
      ok: false,
      status: 200,
      error: INVALID_PAYLOAD,
    });
  });

  it('a thrown fetch never throws out: status 0 with the message', async () => {
    const failing: typeof fetch = () => Promise.reject(new Error('ECONNREFUSED'));
    await expect(serverFetchJson(BASE, '/api/v1/x', schema, TIMEOUT_MS, failing)).resolves.toEqual({
      ok: false,
      status: 0,
      error: 'ECONNREFUSED',
    });
  });

  it('a hung fetch is aborted at timeoutMs (T-3-10)', async () => {
    vi.useFakeTimers();
    try {
      // Behaves like undici: settles only when the signal fires, with the signal's reason.
      const hung: typeof fetch = (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(
              init.signal?.reason instanceof Error ? init.signal.reason : new Error('aborted'),
            );
          });
        });
      const pending = serverFetchJson(BASE, '/api/v1/x', schema, 50, hung);
      await vi.advanceTimersByTimeAsync(60);
      const result = await pending;
      expect(result.ok).toBe(false);
      expect(result.status).toBe(0);
      expect(result.ok ? '' : result.error).toMatch(/timeout|timed out/i);
    } finally {
      vi.useRealTimers();
    }
  });
});
