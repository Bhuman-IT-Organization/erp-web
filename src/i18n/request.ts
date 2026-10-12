import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { getBranding } from '@/features/branding/api/branding.server';
import { messagesFor } from '@/messages';
import { isSupportedLocale, LOCALE_COOKIE, toSupportedLocale } from './locales';

/**
 * next-intl request config (App Router without i18n routing; `createNextIntlPlugin()` in
 * `next.config.ts` resolves this file). The ONLY reader of the locale cookie: `erp_locale` → a
 * supported locale, else the deployment's `branding.defaultLocale` (the same cached request-time
 * fetch the layout and the login page use; it never throws and falls back to `en`), else `en`.
 * Reading `cookies()` here makes every route render at request time (no static prerender), which
 * is intended: brand and locale are per-request data.
 */
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isSupportedLocale(fromCookie)
    ? fromCookie
    : toSupportedLocale((await getBranding()).defaultLocale);
  return { locale, messages: messagesFor(locale) };
});
