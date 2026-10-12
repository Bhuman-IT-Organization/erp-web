import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ApiUnreachableBanner } from '@/components/organisms/ApiUnreachableBanner';
import { Toaster } from '@/components/ui/sonner';
import { themeCss } from '@/features/branding';
import { getBranding } from '@/features/branding/api/branding.server';
import { direction } from '@/i18n/direction';
import { toSupportedLocale } from '@/i18n/locales';
import { SwrProvider } from '@/lib/api/SwrProvider';
import { DirectionProvider } from '@/lib/i18n/DirectionProvider';
import { FormatSettingsProvider } from '@/lib/i18n/FormatSettingsProvider';
import { pick } from '@/lib/i18n/pick';
import { UrlStateProvider } from '@/lib/url/UrlStateProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'erp-web',
  description: 'ERP web client (Next.js App Router)',
};

// `lang` and `dir` are set here, ONCE, from the locale `src/i18n/request.ts` resolved (FE-08).
// The customer's theme (SC-6) is the same request's `getBranding()` (cached: the login page and
// the request config share it) reduced to allowlisted `:root` token values by `themeCss`; it is
// the TEXT child of a `<style>`, never `dangerouslySetInnerHTML` (T-3-11). No `<style>` at all
// when nothing survives, so the defaults in globals.css apply.
// The SWR policy provider and the one global "API unreachable" banner are mounted here, once
// (ADR-0031 §5). The root client provider carries the `common` slice; each feature page adds its
// own slice around its client subtree.
// Beside `<html dir>`, the ONE Radix direction provider takes the same `direction(locale)`, so every
// Radix menu, select and sub-menu mirrors in Arabic (FE-20); and the ONE URL-state adapter serves
// every list's `useListQueryState` (FE-15). The same branding's `formats` feed the ONE
// `FormatSettingsProvider`, so every `useFormat()` renders the customer's Perfex formats (D-33).
export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const locale = toSupportedLocale(await getLocale());
  const messages = await getMessages();
  const branding = await getBranding();
  const css = themeCss(branding.theme);
  return (
    <html lang={locale} dir={direction(locale)} className="h-full font-sans antialiased">
      <head>{css !== null ? <style data-testid="brand-theme">{css}</style> : null}</head>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale} messages={pick(messages, ['common'])}>
          <DirectionProvider dir={direction(locale)}>
            <UrlStateProvider>
              <SwrProvider>
                <FormatSettingsProvider settings={branding.formats}>
                  <ApiUnreachableBanner />
                  {children}
                  <Toaster />
                </FormatSettingsProvider>
              </SwrProvider>
            </UrlStateProvider>
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
