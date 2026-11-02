'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function Error({ reset }: { readonly error: Error; readonly reset: () => void }) {
  const t = useTranslations('common');
  return (
    <div role="alert" className="flex flex-col items-start gap-4">
      <p>{t('something_went_wrong')}</p>
      <Button type="button" onClick={reset}>
        {t('try_again')}
      </Button>
    </div>
  );
}
