import { describe, expect, it } from 'vitest';
import { SERVER_TIMINGS } from '../server-timings';

/** erp-api's own health probe budget; the page's fetch must outlast it (WR-04). */
const API_HEALTH_PROBE_TIMEOUT_MS = 3000;

describe('SERVER_TIMINGS (the server twin of CLIENT_TIMINGS, ADR-0031 §5)', () => {
  it('is frozen at every level', () => {
    expect(Object.isFrozen(SERVER_TIMINGS)).toBe(true);
    expect(Object.isFrozen(SERVER_TIMINGS.health)).toBe(true);
    expect(Object.isFrozen(SERVER_TIMINGS.branding)).toBe(true);
  });

  it('every budget is a positive integer number of milliseconds', () => {
    for (const group of Object.values(SERVER_TIMINGS)) {
      for (const value of Object.values(group)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
  });

  it("the health fetch outlasts the api's own probe budget so a degraded report arrives first", () => {
    expect(SERVER_TIMINGS.health.fetchMs).toBeGreaterThan(API_HEALTH_PROBE_TIMEOUT_MS);
  });
});
