/**
 * Global "is the API reachable" state (ADR-0031 §5): a tiny external store compatible with
 * `useSyncExternalStore`, with no React import so `callApi` can update it from plain code.
 *
 * `callApi` marks the API unreachable on a 503 (breaker open), a timeout or a network failure,
 * and reachable on any other completed response. Exactly one component renders this state:
 * `src/components/organisms/ApiUnreachableBanner/`, mounted once in the root layout (on a shell page
 * `PageShell` shows it in its content column instead, so the sidebar never covers it).
 *
 * The snapshot object is replaced only when the state actually changes, so
 * `useSyncExternalStore` sees a stable reference and does not re-render in a loop.
 */
export type ApiStatus =
  | { readonly reachable: true }
  | { readonly reachable: false; readonly retryAfterS: number | null; readonly since: number };

export const REACHABLE: ApiStatus = Object.freeze({ reachable: true });

let snapshot: ApiStatus = REACHABLE;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getApiStatus(): ApiStatus {
  return snapshot;
}

export function subscribeApiStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function markUnreachable(retryAfterS: number | null, now: number = Date.now()): void {
  if (!snapshot.reachable && snapshot.retryAfterS === retryAfterS) return;
  snapshot = Object.freeze({ reachable: false, retryAfterS, since: now });
  emit();
}

export function markReachable(): void {
  if (snapshot.reachable) return;
  snapshot = REACHABLE;
  emit();
}

/** Tests only: back to the initial state without notifying anyone. */
export function resetApiStatus(): void {
  snapshot = REACHABLE;
  listeners.clear();
}
