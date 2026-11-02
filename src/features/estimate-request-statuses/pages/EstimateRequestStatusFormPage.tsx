import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactElement } from 'react';
import { GuardedEstimateRequestStatusForm } from '@/features/estimate-request-statuses/components/EstimateRequestStatusForm';
import { SHELL_MESSAGE_NAMESPACES } from '@/features/shell';
import { pick } from '@/lib/i18n/pick';

interface EstimateRequestStatusFormPageProps {
  readonly id: string | null;
}

export async function EstimateRequestStatusFormPage({
  id,
}: EstimateRequestStatusFormPageProps): Promise<ReactElement> {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      messages={pick(messages, [...SHELL_MESSAGE_NAMESPACES, 'estimate-request-statuses'])}
    >
      <GuardedEstimateRequestStatusForm id={id} />
    </NextIntlClientProvider>
  );
}
