import type { AbstractIntlMessages } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { direction } from '../direction';
import { LOCALE_COOKIE } from '../locales';

/**
 * The server half of the RTL smoke test: the request config resolves the `erp_locale` cookie to
 * the locale and pack `app/layout.tsx` then renders (`lang`, `dir={direction(locale)}`). The
 * rendered `dir="rtl"` in real HTML is the manual curl row in 03-VALIDATION.md. Without a
 * cookie the deployment's `branding.defaultLocale` decides (plan 03-03), then `en`.
 */
const cookieJar = new Map<string, string>();
let defaultLocale: string | undefined = 'en';

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = cookieJar.get(name);
        return value === undefined ? undefined : { name, value };
      },
    }),
}));

// `branding.server.ts` is server-only (env.ts) and fetches; the config only reads `defaultLocale`.
vi.mock('@/features/branding/api/branding.server', () => ({
  getBranding: () =>
    Promise.resolve({
      companyName: 'ERP',
      logoUrl: null,
      logoDarkUrl: null,
      theme: {},
      ...(defaultLocale === undefined ? {} : { defaultLocale }),
    }),
}));

vi.mock('next-intl/server', () => ({
  // The real one wraps the callback for Next's request scope; the config's own behaviour is what
  // this test proves, so the mock hands the callback back unchanged.
  getRequestConfig: (fn: unknown) => fn,
}));

type RequestConfig = () => Promise<{ locale: string; messages: AbstractIntlMessages }>;

async function resolveConfig(): Promise<{ locale: string; messages: AbstractIntlMessages }> {
  const mod = await import('../request');
  return (mod.default as unknown as RequestConfig)();
}

describe('i18n request config', () => {
  beforeEach(() => {
    cookieJar.clear();
    defaultLocale = 'en';
  });

  it('no cookie → en with the English pack', async () => {
    const config = await resolveConfig();
    expect(config.locale).toBe('en');
    expect((config.messages.common as AbstractIntlMessages).retry).toBe('Retry');
  });

  it('erp_locale=ar → ar with the Arabic pack, and ar renders right to left', async () => {
    cookieJar.set(LOCALE_COOKIE, 'ar');
    const config = await resolveConfig();
    expect(config.locale).toBe('ar');
    expect((config.messages.common as AbstractIntlMessages).retry).toBe('إعادة المحاولة');
    expect(direction('ar')).toBe('rtl');
  });

  it('an unsupported cookie value → en (a tampered cookie changes nothing but the tamperer’s UI)', async () => {
    cookieJar.set(LOCALE_COOKIE, 'xx');
    const config = await resolveConfig();
    expect(config.locale).toBe('en');
    expect(direction('en')).toBe('ltr');
  });

  it('no cookie and branding.defaultLocale=ar → ar (the deployment’s language before sign-in)', async () => {
    defaultLocale = 'ar';
    const config = await resolveConfig();
    expect(config.locale).toBe('ar');
  });

  it('the cookie wins over branding.defaultLocale', async () => {
    defaultLocale = 'ar';
    cookieJar.set(LOCALE_COOKIE, 'en');
    expect((await resolveConfig()).locale).toBe('en');
  });

  it.each([
    ['unsupported', 'fr'],
    ['absent', undefined],
  ])('a branding.defaultLocale that is %s → en', async (_label, value) => {
    defaultLocale = value;
    expect((await resolveConfig()).locale).toBe('en');
  });
});
