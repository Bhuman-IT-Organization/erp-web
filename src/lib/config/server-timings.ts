/**
 * The server twin of `CLIENT_TIMINGS` (ADR-0031 §5): every server-side fetch budget, the only
 * place a server-side duration literal is allowed. No `server-only` here — these are numbers,
 * harmless in a client bundle, and `server-only` would make the module untestable (`env.ts` has
 * no unit test for exactly that reason).
 *
 * `health.fetchMs` (review WR-04): the status page is `force-dynamic`, so an unbounded fetch would
 * block every render while the API or Nginx is stalled. Kept above the API's own probe budget
 * (`HEALTH_PROBE_TIMEOUT_MS = 3000` in erp-api) so a degraded report arrives before this cut-off;
 * only a dead upstream trips it. `branding.fetchMs`: the login page is `force-dynamic` too, and a
 * failed fetch degrades to the name-only `FALLBACK_BRANDING`.
 */
export const SERVER_TIMINGS = Object.freeze({
  health: Object.freeze({ fetchMs: 5000 }),
  branding: Object.freeze({ fetchMs: 3000 }),
});

export type ServerTimings = typeof SERVER_TIMINGS;
