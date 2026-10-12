import { describe, expect, it } from 'vitest';
import { SERVER_TIMINGS } from '@/lib/config/server-timings';
import { fetchHealth } from '../health.fetch';

function jsonResponse(status: number, body: unknown): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
}

const BASE = 'http://nginx';

describe('fetchHealth', () => {
  it('returns the parsed report on 200', async () => {
    const result = await fetchHealth(
      BASE,
      jsonResponse(200, { status: 'ok', checks: { db: 'ok' } }),
    );
    expect(result.httpStatus).toBe(200);
    expect(result.report?.status).toBe('ok');
    expect(result.error).toBeNull();
    expect(result.url.endsWith('/api/v1/health')).toBe(true);
  });

  it('parses a degraded report on 503', async () => {
    const result = await fetchHealth(
      BASE,
      jsonResponse(503, { status: 'degraded', checks: { db: 'error' } }),
    );
    expect(result.httpStatus).toBe(503);
    expect(result.report?.status).toBe('degraded');
    expect(result.report?.checks).toEqual({ db: 'error' });
    expect(result.error).toBeNull();
  });

  it('turns a network error into error without throwing', async () => {
    const failing: typeof fetch = () => Promise.reject(new Error('ECONNREFUSED'));
    const result = await fetchHealth(BASE, failing);
    expect(result.report).toBeNull();
    expect(result.error).toBe('ECONNREFUSED');
    expect(result.httpStatus).toBe(0);
  });

  it('flags a body that is not a health report', async () => {
    const result = await fetchHealth(BASE, jsonResponse(200, { nope: 1 }));
    expect(result.report).toBeNull();
    expect(result.error).toBe('invalid health payload');
  });

  it('aborts a fetch that never answers and reports error within the bound (WR-04)', async () => {
    // Behaves like undici: settles only when the signal fires, with the signal's reason.
    const hung: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return; // no signal -> hangs forever, and so does the test
        signal.addEventListener('abort', () => {
          reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
        });
      });
    const started = Date.now();
    const result = await fetchHealth(BASE, hung, 50);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.httpStatus).toBe(0);
    expect(result.report).toBeNull();
    expect(result.error).toMatch(/timeout|timed out/i);
  });

  it('passes a timeout signal derived from SERVER_TIMINGS.health.fetchMs by default', async () => {
    let seen: AbortSignal | null | undefined;
    const spy: typeof fetch = (_url, init) => {
      seen = init?.signal;
      return Promise.resolve(
        new Response(JSON.stringify({ status: 'ok', checks: {} }), { status: 200 }),
      );
    };
    await fetchHealth(BASE, spy);
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen?.aborted).toBe(false);
    expect(SERVER_TIMINGS.health.fetchMs).toBeGreaterThan(3000);
  });

  it('accepts checks.breakers with breaker states (ADR-0031)', async () => {
    const body = { status: 'ok', checks: { db: 'ok', redis: 'ok', breakers: { legacy: 'open' } } };
    const result = await fetchHealth(BASE, jsonResponse(200, body));
    expect(result.error).toBeNull();
    expect(result.report?.checks.breakers).toEqual({ legacy: 'open' });
    expect(result.report?.checks.db).toBe('ok');
  });

  it('rejects an unknown breaker state', async () => {
    const body = { status: 'ok', checks: { breakers: { legacy: 'melted' } } };
    const result = await fetchHealth(BASE, jsonResponse(200, body));
    expect(result.report).toBeNull();
    expect(result.error).toBe('invalid health payload');
  });

  it('does not double the slash when baseUrl has a trailing slash', async () => {
    const result = await fetchHealth(`${BASE}/`, jsonResponse(200, { status: 'ok', checks: {} }));
    expect(result.url).toBe('http://nginx/api/v1/health');
  });
});
