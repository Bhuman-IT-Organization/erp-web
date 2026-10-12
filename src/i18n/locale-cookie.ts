import { LOCALE_COOKIE, type Locale } from './locales';

/**
 * Browser side of the locale preference: the form writes `erp_locale` from `user.locale` after a
 * successful login, before the legacy handoff. Written from `document.cookie` rather than a route
 * handler on purpose: the cookie carries no secret (a preference, not an authority — T-3-04), so
 * `HttpOnly` buys nothing, and a `POST /locale` handler would need a third raw `fetch` outside the
 * two lint exceptions. `request.ts` validates the value on every request and falls back to `en`.
 */
export const LOCALE_COOKIE_MAX_AGE_S = 31_536_000; // one year

export function localeCookieString(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${String(LOCALE_COOKIE_MAX_AGE_S)}; SameSite=Lax`;
}

export function writeLocaleCookie(locale: Locale, doc: { cookie: string } = document): void {
  doc.cookie = localeCookieString(locale);
}

/**
 * "System Default": expire `erp_locale` on the same path, so `request.ts` falls back to the
 * deployment's `branding.defaultLocale` instead of a locale written in its name.
 */
export function clearLocaleCookie(doc: { cookie: string } = document): void {
  doc.cookie = `${LOCALE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
