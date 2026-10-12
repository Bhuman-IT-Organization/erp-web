/**
 * The browser twin of erp-api's `TIMINGS` (ADR-0031 §5): the only place a client-side duration
 * literal is allowed. Never scatter `10_000` in a component.
 *
 * `swr` feeds `SWR_GLOBAL_CONFIG` (swr-config.ts); `apiTimeoutMs` bounds every `callApi` request;
 * `legacyTimeoutMs` bounds the one non-api fetch, the `/erp_sso/handoff` POST.
 */
export const CLIENT_TIMINGS = Object.freeze({
  apiTimeoutMs: 10_000, // AbortSignal.timeout on every callApi request
  legacyTimeoutMs: 10_000, // the one non-api fetch: /erp_sso/handoff
  swr: Object.freeze({
    errorRetryCount: 3,
    errorRetryBaseMs: 1_000, // full-jitter exponential: random() * min(max, base * 2 ** retryCount)
    errorRetryMaxMs: 8_000,
    dedupingIntervalMs: 2_000,
    focusThrottleIntervalMs: 5_000,
  }),
  list: Object.freeze({ searchDebounceMs: 300 }), // 03.2 UI-SPEC § Search: `q` hits the URL 300 ms after the last keystroke
  toast: Object.freeze({ durationMs: 4_000 }), // 03.2 UI-SPEC § Toasts: a success toast stays 4 s
  // P-12: tus retries a dropped chunk after 1, 3 and 5 s before the tile reads "Paused, connection lost"
  uploads: Object.freeze({ retryDelaysMs: Object.freeze([1_000, 3_000, 5_000] as const) }),
  // L-02: the camera scanner reads one frame every 250 ms (four a second: quick enough, light on a phone)
  scanner: Object.freeze({ frameIntervalMs: 250 }),
  // The access token is renewed at 80% of the lifetime the login or refresh response states (`expiresIn`), never at a fixed age
  // 04.3 UI-SPEC § Send a test to me: re-read a queued test or log entry every 2 s while queued or retrying
  mail: Object.freeze({ pollMs: 2_000 }),
  // 4.2 UI-SPEC § Imports (D-08): the result page re-reads a queued or running import every 2 s, and stops once it ends
  imports: Object.freeze({ pollMs: 2_000 }),
  session: Object.freeze({ renewAtPercent: 80 }),
  login: Object.freeze({
    resumeLoopGuardMs: 30_000, // ADR-0038: a second automatic /login resume within 30 s in one tab shows the handoff-failed state instead (legacy sent the member straight back)
    signedOutGuardMs: 30_000, // ADR-0038: within 30 s of a sign-out in this tab, /login shows the form even if the api logout failed and the refresh still succeeds
  }),
});

export type ClientTimings = typeof CLIENT_TIMINGS;
