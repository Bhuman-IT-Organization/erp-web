/**
 * The typed error `swrFetcher` throws so SWR (and `shouldRetry`) can see the HTTP status and the
 * problem-details code. `callApi` itself never throws; it returns an `ApiResult`.
 *
 * `status === 0` means the request never completed (network failure or client timeout).
 * `issues` is the api's `ERP-VALIDATION-0001` payload, typed `unknown` until a form parses it.
 */
/** The first server-error status: `>= 500` is retryable per ADR-0031 §5, anything below is not. */
export const HTTP_SERVER_ERROR_FLOOR = 500;
/** The api refused the bearer (expired, revoked or missing): the one status that may renew a session. */
export const HTTP_UNAUTHORIZED = 401;

export class ApiError extends Error {
  readonly issues?: unknown;

  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterS: number | null,
    message?: string,
    issues?: unknown,
  ) {
    super(message ?? `${code} (HTTP ${String(status)})`);
    this.name = 'ApiError';
    if (issues !== undefined) this.issues = issues;
  }

  /** Retryable per ADR-0031 §5: network/timeout and 5xx; never a 4xx. */
  get retryable(): boolean {
    return this.status === 0 || this.status >= HTTP_SERVER_ERROR_FLOOR;
  }
}
