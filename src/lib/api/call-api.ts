import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios';
import { z } from 'zod';
import { ApiError } from './api-error';
import { http, NETWORK_CODE, TIMEOUT_CODE } from './http';

/**
 * The ONLY place the browser calls the api (ADR-0002 axios, ADR-0031 §5): one request through
 * the shared axios instance in `http.ts`, a never-throwing result object. Generalises the
 * server-side `features/status/api/health.fetch.ts` (injected transport, bounded, never throws).
 *
 * - Paths are RELATIVE (`/api/v1/...`): the request goes to the Nginx origin the page was served
 *   from, so the browser exercises the same strangler routing as SSR (FE-03 is for server fetches).
 * - The timeout, the bearer header, the problem-details mapping and the reachability side effect
 *   live in the instance's interceptors (`http.ts`); `callApi` adds the schema check on 2xx.
 * - `callApi` NEVER retries. Reads that want the SWR retry policy go through `swrFetcher`;
 *   mutations are retried only by an explicit user action.
 * - `ifMatch` and `idempotencyKey` become `If-Match` and `Idempotency-Key` (ADR-0040, BE-15): a save
 *   names the fingerprint the api put in the record body (`etag`), a keyed POST names its key.
 * - A 400 `ERP-VALIDATION-0001` carries `issues` (the api's `ProblemDetailsFilter` puts them on
 *   the wire); they travel as `unknown` and a form zod-parses them before rendering (T-3-07).
 */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; retryAfterS: number | null; issues?: unknown };

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface CallApiOptions<T> {
  method?: ApiMethod;
  body?: unknown;
  headers?: Record<string, string>;
  /** Sent as `If-Match`: the record's `etag` from its read (ADR-0040; 412 when stale, 428 when absent). */
  ifMatch?: string;
  /** Sent as `Idempotency-Key`: minted once per submit, reused for its retry (BE-15). */
  idempotencyKey?: string;
  schema: z.ZodType<T>;
  /** Tests only: a fake adapter standing in for the network. */
  adapter?: ApiAdapter;
  timeoutMs?: number;
  expectNoContent?: boolean;
}

export type ApiPath = `/api/v1/${string}`;
/** The test seam: a fake axios adapter standing in for the network. Features never import axios. */
export type ApiAdapter = AxiosAdapter;

export { NETWORK_CODE, TIMEOUT_CODE };
export const CLIENT_CODE = 'ERP-CLIENT-0001';
/** The one success status without a body (`expectNoContent`): logout, delete, the legacy handoff. */
export const HTTP_NO_CONTENT = 204;

export async function callApi<T>(path: ApiPath, options: CallApiOptions<T>): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    ...options.headers,
    ...(options.ifMatch === undefined ? {} : { 'If-Match': options.ifMatch }),
    ...(options.idempotencyKey === undefined ? {} : { 'Idempotency-Key': options.idempotencyKey }),
  };
  const config: AxiosRequestConfig = {
    url: path,
    method: options.method ?? 'GET',
    ...(options.body !== undefined ? { data: options.body } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(options.adapter ? { adapter: options.adapter } : {}),
    ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
  };

  let response: AxiosResponse<unknown>;
  try {
    response = await http.request<unknown>(config);
  } catch (e: unknown) {
    const err = e instanceof ApiError ? e : new ApiError(0, NETWORK_CODE, null);
    return {
      ok: false,
      status: err.status,
      code: err.code,
      retryAfterS: err.retryAfterS,
      ...(err.issues !== undefined ? { issues: err.issues } : {}),
    };
  }

  const { status } = response;
  if (options.expectNoContent === true && status === HTTP_NO_CONTENT) {
    return { ok: true, status, data: null as T };
  }
  const parsed = options.schema.safeParse(response.data);
  return parsed.success
    ? { ok: true, status, data: parsed.data }
    : { ok: false, status, code: CLIENT_CODE, retryAfterS: null };
}

/**
 * `callApi` that THROWS an `ApiError` on failure, so SWR sees the status and applies the retry
 * policy. The argument is the SWR key from `keys.ts` — the path plus its canonical query — which
 * is exactly the URL to fetch. With `headers` (opt-in, 04.7-12) every request carries them, and the key is `[url, headers]` (`useCommonApi`), the URL first.
 */
export function swrFetcher<T>(
  schema: z.ZodType<T>,
  headers?: Readonly<Record<string, string>>,
): (key: string | readonly [string, unknown]) => Promise<T> {
  return async (key) => {
    const url = typeof key === 'string' ? key : key[0];
    const result = await callApi(url as ApiPath, {
      schema,
      ...(headers === undefined ? {} : { headers: { ...headers } }),
    });
    if (!result.ok) {
      throw new ApiError(result.status, result.code, result.retryAfterS, undefined, result.issues);
    }
    return result.data;
  };
}
