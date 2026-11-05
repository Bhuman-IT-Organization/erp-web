import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactElement } from 'react';
import { GuardedEstimateRequestStatusesForm } from '@/features/estimate-request-statuses/components/EstimateRequestStatusesForm';
import { SHELL_MESSAGE_NAMESPACES } from '@/features/shell';
import { pick } from '@/lib/i18n/pick';

interface EstimateRequestStatusesPageProps {
  readonly id: string | null;
}

export async function EstimateRequestStatusesPage({
  id,
}: EstimateRequestStatusesPageProps): Promise<ReactElement> {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      messages={pick(messages, [...SHELL_MESSAGE_NAMESPACES, 'estimate-request-statuses'])}
    >
      <GuardedEstimateRequestStatusesForm id={id} />
    </NextIntlClientProvider>
  );
}
