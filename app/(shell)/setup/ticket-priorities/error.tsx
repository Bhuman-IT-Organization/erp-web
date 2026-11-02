'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface RouteErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

/**
 * The route-segment error boundary for `/setup/ticket-priorities/**` (FE-05). It sits inside the
 * feature's route folder so it moves with the screens, inside the shell's one `<main>` (so it
 * renders none). Both strings are `common` message keys; `error.message` and `digest` are NEVER
 * rendered (T-3-12), and the prop is received only so the signature is Next's.
 */
export default function RouteError({ reset }: RouteErrorProps) {
  const t = useTranslations('common');
  return (
    <div
      role="alert"
      data-testid="ticket-priorities-route-error"
      className="flex flex-col items-start gap-4"
    >
      <p>{t('something_went_wrong')}</p>
      <Button type="button" onClick={reset}>
        {t('try_again')}
      </Button>
    </div>
  );
}
