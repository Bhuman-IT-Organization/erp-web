import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactElement } from 'react';
import { GuardedEstimateRequestStatusesList } from '@/features/estimate-request-statuses/components/EstimateRequestStatusesList';
import { SHELL_MESSAGE_NAMESPACES } from '@/features/shell';
import { pick } from '@/lib/i18n/pick';

export async function EstimateRequestStatusesListPage(): Promise<ReactElement> {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      messages={pick(messages, [...SHELL_MESSAGE_NAMESPACES, 'estimate-request-statuses'])}
    >
      <GuardedEstimateRequestStatusesList />
    </NextIntlClientProvider>
  );
}
