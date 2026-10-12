import type { z } from 'zod';
import type { ApiPath } from './call-api';

/**
 * The one server-side fetch helper (FE-03, ADR-0031 §5): a Server Component asks the api through
 * the Nginx origin in `API_BASE_URL` with a budget from `SERVER_TIMINGS`, gets a JSON body parsed
 * by a zod schema, and never sees an exception — a stalled upstream, a non-2xx, an unparseable
 * body and a thrown fetch are all a `{ ok: false }` result the caller degrades on.
 *
 * A non-2xx whose body still parses under the schema carries it as `data` on the failure branch:
 * the api answers a degraded health report with a 503 and the same shape as its 200.
 *
 * Besides `legacy-handoff.ts` (a different upstream, browser side) this is the only raw `fetch`
 * in the tree; feature files call it, never `fetch`. The path is an `ApiPath` constant appended
 * server-side, so `baseUrl` cannot inject a different route.
 */
export type ServerFetchResult<T> =
  { ok: true; status: number; data: T } | { ok: false; status: number; error: string; data?: T };

export const INVALID_PAYLOAD = 'invalid payload';

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** `baseUrl` without its trailing slash + `path`. */
export function serverUrl(baseUrl: string, path: ApiPath): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

async function parseJson<T>(response: Response, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function serverFetchJson<T>(
  baseUrl: string,
  path: ApiPath,
  schema: z.ZodType<T>,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ServerFetchResult<T>> {
  const url = serverUrl(baseUrl, path);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e: unknown) {
    return { ok: false, status: 0, error: errorMessage(e) };
  }
  const { status } = response;
  const data = await parseJson(response, schema);
  if (!response.ok) {
    return {
      ok: false,
      status,
      error: `HTTP ${String(status)}`,
      ...(data === null ? {} : { data }),
    };
  }
  return data === null ? { ok: false, status, error: INVALID_PAYLOAD } : { ok: true, status, data };
}
