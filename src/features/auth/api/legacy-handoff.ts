import { HTTP_NO_CONTENT } from '@/lib/api/call-api';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';

/**
 * The one-time handoff after login: POST /erp_sso/handoff with the bearer token so the legacy
 * `erp_sso` module opens its own CodeIgniter session (`sp_session` cookie) for the same staff.
 *
 * This is the one raw `fetch` in the browser code: it targets a different upstream (legacy, not
 * the api), so it stays off the axios instance in `src/lib/api/http.ts` (whose interceptors would
 * mark the API unreachable and attach the bearer token automatically) and keeps its own one-line
 * `fetch` with `AbortSignal.timeout(CLIENT_TIMINGS.legacyTimeoutMs)`; it does NOT touch
 * `apiStatus` — legacy being down is not "the API is unreachable". The token travels in the
 * `Authorization` header,
 * never in the URL (T-1.3-21). Never throws.
 */
export const HANDOFF_PATH = '/erp_sso/handoff';

export async function handoffToLegacy(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(HANDOFF_PATH, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.timeout(CLIENT_TIMINGS.legacyTimeoutMs),
    });
    return response.status === HTTP_NO_CONTENT;
  } catch {
    return false;
  }
}
