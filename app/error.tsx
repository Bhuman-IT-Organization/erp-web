'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface RouteErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

/**
 * The route-segment error boundary (FE-05): what renders when a page under the root layout
 * throws. The layout — and with it the root `NextIntlClientProvider` with the `common` slice —
 * is still mounted, so the two strings are message keys. `error.message` and `digest` are NEVER
 * rendered (T-3-12: a server detail could leak); nothing is logged here either — a client logger
 * is a trigger (03-RESEARCH §1.9). The prop is still received so the signature is Next's.
 */
export default function RouteError({ reset }: RouteErrorProps) {
  const t = useTranslations('common');
  return (
    <main
      role="alert"
      data-testid="route-error"
      className="flex flex-1 flex-col items-center gap-4 p-8"
    >
      <p>{t('something_went_wrong')}</p>
      <Button type="button" onClick={reset}>
        {t('try_again')}
      </Button>
    </main>
  );
}
