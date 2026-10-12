import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession, markSignedOut, setSession } from '@/lib/auth/session';
import { ApiError } from '../api-error';
import { CLIENT_TIMINGS } from '../client-timings';
import { SWR_GLOBAL_CONFIG, onErrorRetry, retryDelayMs, shouldRetry } from '../swr-config';

const { errorRetryBaseMs, errorRetryMaxMs, errorRetryCount } = CLIENT_TIMINGS.swr;

describe('shouldRetry', () => {
  it('never retries a 4xx', () => {
    expect(shouldRetry(new ApiError(404, 'x', null))).toBe(false);
    expect(shouldRetry(new ApiError(401, 'ERP-AUTH-0001', null))).toBe(false);
    expect(shouldRetry(new ApiError(429, 'ERP-AUTH-0006', 30))).toBe(false);
  });

  it('retries a 503 and a timeout', () => {
    expect(shouldRetry(new ApiError(503, 'ERP-UPSTREAM-0001', 10))).toBe(true);
    expect(shouldRetry(new ApiError(0, 'ERP-TIMEOUT-0001', null))).toBe(true);
    expect(shouldRetry(new ApiError(0, 'ERP-NETWORK-0001', null))).toBe(true);
  });

  it('does not retry an unknown error', () => {
    expect(shouldRetry(new Error('x'))).toBe(false);
    expect(shouldRetry('boom')).toBe(false);
  });
});

describe('retryDelayMs (full jitter)', () => {
  it('first retry is at most the base', () => {
    expect(retryDelayMs(0, () => 1)).toBe(errorRetryBaseMs);
  });

  it('is capped at errorRetryMaxMs', () => {
    expect(retryDelayMs(10, () => 1)).toBe(errorRetryMaxMs);
  });

  it('scales exponentially and multiplies by the random draw', () => {
    expect(retryDelayMs(2, () => 0.5)).toBe(0.5 * 4 * errorRetryBaseMs);
  });
});

describe('onErrorRetry', () => {
  function harness() {
    const scheduled: number[] = [];
    const setTimeout = vi.fn((fn: () => void, ms: number) => {
      scheduled.push(ms);
      fn();
      return 0;
    });
    const revalidate = vi.fn();
    return { scheduled, setTimeout, revalidate, random: () => 1 };
  }

  it('a 4xx never schedules anything', () => {
    const h = harness();
    onErrorRetry(new ApiError(401, 'x', null), 'k', {}, h.revalidate, { retryCount: 0 }, h);
    expect(h.setTimeout).not.toHaveBeenCalled();
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it('a 503 at retryCount 0 schedules revalidate({ retryCount: 1 }) after the computed delay', () => {
    const h = harness();
    onErrorRetry(new ApiError(503, 'x', 10), 'k', {}, h.revalidate, { retryCount: 0 }, h);
    expect(h.scheduled).toEqual([retryDelayMs(0, h.random)]);
    expect(h.revalidate).toHaveBeenCalledWith({ retryCount: 1 });
  });

  it('the delay grows with retryCount and stays under the cap', () => {
    const h = harness();
    onErrorRetry(new ApiError(503, 'x', null), 'k', {}, h.revalidate, { retryCount: 2 }, h);
    expect(h.scheduled).toEqual([Math.min(errorRetryMaxMs, 4 * errorRetryBaseMs)]);
  });

  it('stops at errorRetryCount', () => {
    const h = harness();
    onErrorRetry(
      new ApiError(503, 'x', null),
      'k',
      { errorRetryCount },
      h.revalidate,
      { retryCount: errorRetryCount },
      h,
    );
    expect(h.setTimeout).not.toHaveBeenCalled();
  });

  it('honours a smaller errorRetryCount from the hook config', () => {
    const h = harness();
    onErrorRetry(
      new ApiError(0, 'ERP-TIMEOUT-0001', null),
      'k',
      { errorRetryCount: 1 },
      h.revalidate,
      { retryCount: 1 },
      h,
    );
    expect(h.setTimeout).not.toHaveBeenCalled();
  });
});

describe('SWR_GLOBAL_CONFIG', () => {
  it('carries the CLIENT_TIMINGS values and the two decision functions', () => {
    expect(SWR_GLOBAL_CONFIG.errorRetryCount).toBe(3);
    expect(SWR_GLOBAL_CONFIG.dedupingInterval).toBe(2000);
    expect(SWR_GLOBAL_CONFIG.focusThrottleInterval).toBe(
      CLIENT_TIMINGS.swr.focusThrottleIntervalMs,
    );
    expect(SWR_GLOBAL_CONFIG.shouldRetryOnError).toBe(shouldRetry);
    expect(typeof SWR_GLOBAL_CONFIG.onErrorRetry).toBe('function');
    expect(SWR_GLOBAL_CONFIG.revalidateOnFocus).toBe(true);
  });
});

describe('a 401 after the transport renewed the session (quick task fix/quick-session-refresh)', () => {
  afterEach(() => {
    clearSession();
  });

  it('shouldRetry re-runs a 401 only while the tab is still signed in, i.e. the refresh succeeded', () => {
    const expired = new ApiError(401, 'ERP-AUTH-0004', null);
    expect(shouldRetry(expired)).toBe(false);
    setSession({ accessToken: 'at', csrfToken: 'ct' });
    expect(shouldRetry(expired)).toBe(true);
    expect(shouldRetry(new ApiError(403, 'ERP-AUTH-0005', null))).toBe(false);
    markSignedOut();
    expect(shouldRetry(expired)).toBe(false);
  });

  it('re-runs it at once (the session is already renewed) and still stops at errorRetryCount', () => {
    setSession({ accessToken: 'at', csrfToken: 'ct' });
    const h = { scheduled: [] as number[], revalidate: vi.fn() };
    const deps = {
      setTimeout: (fn: () => void, ms: number) => {
        h.scheduled.push(ms);
        fn();
        return 0;
      },
      random: () => 1,
    };
    const expired = new ApiError(401, 'ERP-AUTH-0004', null);
    onErrorRetry(expired, 'k', {}, h.revalidate, { retryCount: 0 }, deps);
    expect(h.scheduled).toEqual([0]);
    expect(h.revalidate).toHaveBeenCalledWith({ retryCount: 1 });
    onErrorRetry(expired, 'k', {}, h.revalidate, { retryCount: errorRetryCount }, deps);
    expect(h.revalidate).toHaveBeenCalledTimes(1);
  });
});
