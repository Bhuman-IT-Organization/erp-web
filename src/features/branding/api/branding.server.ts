import { cache } from 'react';
import { loadServerEnv } from '@/lib/config/env';
import { fetchBranding, type Branding } from './branding.fetch';

/**
 * ONE branding fetch per request (SC-6, "one server helper"), shared by the root layout (theme
 * tokens), the login page (logo, company name) and the i18n request config (`defaultLocale`):
 * React's `cache` dedupes the calls within a server render. Server-only by transitivity
 * (`env.ts`): never re-exported from the feature index, no unit test — `next build` and the
 * callers prove it. Never throws (`fetchBranding` falls back), bounded by
 * `SERVER_TIMINGS.branding.fetchMs` (T-3-14).
 */
export const getBranding = cache(async (): Promise<Branding> =>
  fetchBranding(loadServerEnv().API_BASE_URL),
);
