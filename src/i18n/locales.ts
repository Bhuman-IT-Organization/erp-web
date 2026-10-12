/**
 * The locales this build ships messages for (FE-08). The locale is a cookie + user setting, never
 * a URL prefix (research §8a: Nginx maps fixed paths). Adding a locale means: a message file per
 * registered feature (`src/messages/index.ts`) and, if it reads right to left, a `RTL_LOCALES`
 * entry in `direction.ts`.
 */
export const SUPPORTED_LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** The preference cookie `src/i18n/request.ts` reads (the only reader); written by `locale-cookie.ts`. */
export const LOCALE_COOKIE = 'erp_locale';

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** An unknown or tampered value falls back to English (T-3-01): it changes only the tamperer's UI. */
export function toSupportedLocale(value: unknown): Locale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}
