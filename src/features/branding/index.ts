/**
 * The public surface of the branding feature — what other features import (auth renders the
 * logo). Client-safe on purpose: never re-export `api/branding.server.ts` here (it is
 * `server-only` through `env.ts`, and a client import of this index would become a build error);
 * server code imports `getBranding` from `@/features/branding/api/branding.server` directly.
 */
export { BrandLogo } from './components/BrandLogo';
export {
  fetchBranding,
  FALLBACK_BRANDING,
  brandingSchema,
  type Branding,
} from './api/branding.fetch';
export { THEME_TOKENS, themeCss, isSafeThemeValue } from './api/theme';
