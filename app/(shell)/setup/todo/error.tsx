'use client';

import type { ReactElement } from 'react';
import { useTranslations } from 'next-intl';

interface TodoErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function TodoError({ reset }: TodoErrorProps): ReactElement {
  const t = useTranslations('common');

  return (
    <div
      role="alert"
      className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h2 className="text-xl font-semibold">{t('something_went_wrong')}</h2>

      <p className="text-sm text-muted-foreground">{t('try_again')}</p>

      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {t('try_again')}
      </button>
    </div>
  );
}
