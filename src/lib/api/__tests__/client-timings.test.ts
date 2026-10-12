import { describe, expect, it } from 'vitest';
import { CLIENT_TIMINGS } from '../client-timings';

function leaves(value: unknown, path = ''): [string, unknown][] {
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  }
  return [[path, value]];
}

describe('CLIENT_TIMINGS', () => {
  it('is frozen at the root and in the swr block', () => {
    expect(Object.isFrozen(CLIENT_TIMINGS)).toBe(true);
    expect(Object.isFrozen(CLIENT_TIMINGS.swr)).toBe(true);
  });

  it('holds only positive integers', () => {
    const all = leaves(CLIENT_TIMINGS);
    expect(all.length).toBeGreaterThan(0);
    for (const [name, value] of all) {
      expect(Number.isInteger(value), name).toBe(true);
      expect(value as number, name).toBeGreaterThan(0);
    }
  });

  it('debounces list search by 300 ms (03.2 UI-SPEC § Search) in a frozen block', () => {
    expect(CLIENT_TIMINGS.list.searchDebounceMs).toBe(300);
    expect(Object.isFrozen(CLIENT_TIMINGS.list)).toBe(true);
  });

  it('shows a toast for 4 s (03.2 UI-SPEC § Toasts) in a frozen block', () => {
    expect(CLIENT_TIMINGS.toast.durationMs).toBe(4000);
    expect(Object.isFrozen(CLIENT_TIMINGS.toast)).toBe(true);
  });

  it('the /login guards last 30 s, a second automatic resume and a resume right after a sign-out (ADR-0038), in a frozen block', () => {
    expect(CLIENT_TIMINGS.login.resumeLoopGuardMs).toBe(30000);
    expect(CLIENT_TIMINGS.login.signedOutGuardMs).toBe(30000);
    expect(Object.isFrozen(CLIENT_TIMINGS.login)).toBe(true);
  });

  it('retries a dropped upload chunk after 1, 3 and 5 s (tus retryDelays, P-12), in frozen blocks', () => {
    expect(CLIENT_TIMINGS.uploads.retryDelaysMs).toEqual([1_000, 3_000, 5_000]);
    expect(Object.isFrozen(CLIENT_TIMINGS.uploads)).toBe(true);
    expect(Object.isFrozen(CLIENT_TIMINGS.uploads.retryDelaysMs)).toBe(true);
  });

  it('reads a camera frame every 250 ms for the scanner (L-02), in a frozen block', () => {
    expect(CLIENT_TIMINGS.scanner.frameIntervalMs).toBe(250);
    expect(Object.isFrozen(CLIENT_TIMINGS.scanner)).toBe(true);
  });

  it('re-reads a queued test or log entry every 2 s (4.3 UI-SPEC § Send a test to me, G5), in a frozen block', () => {
    expect(CLIENT_TIMINGS.mail.pollMs).toBe(2000);
    expect(Object.isFrozen(CLIENT_TIMINGS.mail)).toBe(true);
  });

  it('re-reads a queued or running import every 2 s (4.2 UI-SPEC § Imports, D-08), a frozen positive integer', () => {
    expect(CLIENT_TIMINGS.imports.pollMs).toBe(2000);
    expect(Number.isInteger(CLIENT_TIMINGS.imports.pollMs)).toBe(true);
    expect(Object.isFrozen(CLIENT_TIMINGS.imports)).toBe(true);
  });

  it('caps the retry delay at or above its base', () => {
    expect(CLIENT_TIMINGS.swr.errorRetryMaxMs).toBeGreaterThanOrEqual(
      CLIENT_TIMINGS.swr.errorRetryBaseMs,
    );
  });
});
