'use client';

import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { DEFAULT_LOCALE } from '@/i18n/locales';
import { pick } from '@/lib/i18n/pick';
import { messagesFor } from '@/messages';
import './globals.css';

interface GlobalErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

/**
 * The global error boundary (FE-05): it REPLACES the root layout when that layout itself throws,
 * so it renders `<html>` and `<body>` and has no provider above it. It mounts its own
 * `NextIntlClientProvider` with the `common` slice in `DEFAULT_LOCALE` — English by design: the
 * request's locale was resolved by the layout that just failed, and the failure must not depend
 * on anything that failed. `error.message`/`digest` are never rendered (T-3-12); nothing is logged
 * here (client logger: a trigger, 03-RESEARCH §1.9).
 */
function GlobalErrorBody({ reset }: Pick<GlobalErrorProps, 'reset'>) {
  const t = useTranslations('common');
  return (
    <main
      role="alert"
      data-testid="global-error"
      className="flex flex-1 flex-col items-center gap-4 p-8"
    >
      <p>{t('something_went_wrong')}</p>
      <Button type="button" onClick={reset}>
        {t('try_again')}
      </Button>
    </main>
  );
}

export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    // No `dir` here on purpose: it is set ONCE, in app/layout.tsx (FE-08); English reads `ltr`,
    // the browser default.
    <html lang={DEFAULT_LOCALE} className="h-full font-sans antialiased">
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider
          locale={DEFAULT_LOCALE}
          messages={pick(messagesFor(DEFAULT_LOCALE), ['common'])}
        >
          <GlobalErrorBody reset={reset} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
