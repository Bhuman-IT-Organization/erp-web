'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface RouteErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function RouteError({ reset }: RouteErrorProps) {
  const t = useTranslations('common');

  return (
    <div
      role="alert"
      data-testid="lead-statuses-route-error"
      className="flex flex-col items-start gap-4"
    >
      <p>{t('something_went_wrong')}</p>
      <Button type="button" onClick={reset}>
        {t('try_again')}
      </Button>
    </div>
  );
}
