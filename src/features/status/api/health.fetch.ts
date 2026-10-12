import { z } from 'zod';
import { serverFetchJson, serverUrl } from '@/lib/api/server-fetch';
import { SERVER_TIMINGS } from '@/lib/config/server-timings';

const HEALTH_PATH = '/api/v1/health';
const INVALID_PAYLOAD = 'invalid health payload';

// ADR-0031 §3: a circuit breaker's state is exposed as `checks.breakers.<name>`.
export const breakerStateSchema = z.enum(['closed', 'open', 'half-open']);

// The API returns the same shape on 200 (ok) and 503 (degraded). A check is either a probe
// result ('ok' | 'error') or, for `breakers`, a record of breaker states.
export const healthReportSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.record(
    z.string(),
    z.union([z.enum(['ok', 'error']), z.record(z.string(), breakerStateSchema)]),
  ),
});

export type HealthReport = z.infer<typeof healthReportSchema>;

export interface FetchHealthResult {
  readonly url: string;
  readonly httpStatus: number;
  readonly report: HealthReport | null;
  readonly error: string | null;
}

/**
 * Fetches `${baseUrl}/api/v1/health` at request time through `serverFetchJson` with the
 * `SERVER_TIMINGS.health` budget (WR-04). Never throws: a network failure or timeout becomes
 * `error` with `httpStatus: 0`, an unparseable body becomes `error: 'invalid health payload'`, and a
 * degraded report on a 503 is still a report.
 */
export async function fetchHealth(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = SERVER_TIMINGS.health.fetchMs,
): Promise<FetchHealthResult> {
  const url = serverUrl(baseUrl, HEALTH_PATH);
  const result = await serverFetchJson(
    baseUrl,
    HEALTH_PATH,
    healthReportSchema,
    timeoutMs,
    fetchImpl,
  );
  if (result.ok) return { url, httpStatus: result.status, report: result.data, error: null };
  if (result.status === 0) return { url, httpStatus: 0, report: null, error: result.error };
  return {
    url,
    httpStatus: result.status,
    report: result.data ?? null,
    error: result.data === undefined ? INVALID_PAYLOAD : null,
  };
}
