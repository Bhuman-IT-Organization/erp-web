import { z } from 'zod';
import { serverFetchJson } from '@/lib/api/server-fetch';
import { SERVER_TIMINGS } from '@/lib/config/server-timings';
import { DEFAULT_FORMAT_SETTINGS, formatSettingsSchema } from '@/lib/i18n/format';

const BRANDING_PATH = '/api/v1/branding';

/** Mirrors erp-api `brandingResponseSchema`; logo paths are same-origin, never absolute. */
export const brandingSchema = z.object({
  companyName: z.string().min(1),
  logoUrl: z.string().startsWith('/').nullable(),
  logoDarkUrl: z.string().startsWith('/').nullable(),
  theme: z.record(z.string(), z.string()),
  // The deployment's locale before anyone is signed in (BCP-47); optional until every deployment
  // serves an api from plan 03-01. Read by the locale resolution (plan 03) between the cookie and `en`.
  defaultLocale: z.string().optional(),
  // The customer's Perfex date, number and currency formats (plan 03.2-02, D-33). Defaulted to the
  // Perfex install defaults so an api without `formats` still parses (either side deploys first).
  formats: formatSettingsSchema.default(DEFAULT_FORMAT_SETTINGS),
});

export type Branding = z.infer<typeof brandingSchema>;

/** What renders when the API cannot be asked: no logo, a neutral name. Never customer-specific. */
export const FALLBACK_BRANDING: Branding = Object.freeze({
  companyName: 'ERP',
  logoUrl: null,
  logoDarkUrl: null,
  theme: {},
  defaultLocale: 'en',
  formats: DEFAULT_FORMAT_SETTINGS,
});

/**
 * Fetches `${baseUrl}/api/v1/branding` at request time through `serverFetchJson` with the
 * `SERVER_TIMINGS.branding` budget. Never throws: any failure (network, non-2xx, unparseable
 * body, timeout) yields FALLBACK_BRANDING so the page still renders.
 */
export async function fetchBranding(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = SERVER_TIMINGS.branding.fetchMs,
): Promise<Branding> {
  const result = await serverFetchJson(
    baseUrl,
    BRANDING_PATH,
    brandingSchema,
    timeoutMs,
    fetchImpl,
  );
  return result.ok ? result.data : FALLBACK_BRANDING;
}
