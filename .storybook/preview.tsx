import type { Decorator, Preview } from '@storybook/nextjs-vite';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { direction } from '@/i18n/direction';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, toSupportedLocale } from '@/i18n/locales';
import { SwrProvider } from '@/lib/api/SwrProvider';
import { DirectionProvider } from '@/lib/i18n/DirectionProvider';
import { messagesFor } from '@/messages';
import '../app/globals.css';

/**
 * Every story renders under the providers `app/layout.tsx` mounts, for the locale chosen in the
 * toolbar; the decorator does to `<html>` what the layout does (`lang`, `dir`), so an `ar` story
 * is the RTL mirror of the `en` one with no component setting `dir` itself (FE-08). The a11y
 * addon runs axe on every story and shows violations in the a11y panel (`a11y.test = 'error'`);
 * `storybook build --test` only compiles; `corepack yarn check:a11y` (`scripts/check-a11y.mjs`) executes every
 * story and axe in headless Chrome in `check` (FE-23, FE-25).
 */
export const globalTypes = {
  locale: {
    description: 'Locale (sets lang and dir)',
    toolbar: {
      icon: 'globe',
      items: SUPPORTED_LOCALES.map((locale) => ({ value: locale, title: locale })),
      dynamicTitle: true,
    },
  },
};

export const initialGlobals = { locale: DEFAULT_LOCALE };

/**
 * The same provider order as `app/layout.tsx` and `renderWithProviders`: the one Radix direction
 * provider from the locale (menus and selects mirror in `ar`), then nuqs's testing adapter as the
 * URL (FE-15). A list story seeds its URL with `parameters: { nuqs: { searchParams: '?q=abc' } }`.
 */
const decorators: Decorator[] = [
  (Story, { globals, parameters }) => {
    const locale = toSupportedLocale(globals.locale);
    const nuqs = parameters.nuqs as { readonly searchParams?: string } | undefined;
    document.documentElement.lang = locale;
    document.documentElement.dir = direction(locale);
    return (
      <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
        <DirectionProvider dir={direction(locale)}>
          <NuqsTestingAdapter searchParams={nuqs?.searchParams ?? ''} hasMemory>
            <SwrProvider>
              <Story />
            </SwrProvider>
          </NuqsTestingAdapter>
        </DirectionProvider>
      </NextIntlClientProvider>
    );
  },
];

const preview: Preview = {
  decorators,
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default preview;
