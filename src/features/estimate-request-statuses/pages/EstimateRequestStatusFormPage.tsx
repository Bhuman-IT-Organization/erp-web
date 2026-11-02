import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactElement } from 'react';
import { GuardedEstimateRequestStatusForm } from '@/features/estimate-request-statuses/components/EstimateRequestStatusForm';
import { ESTIMATE_REQUEST_STATUS_ID_MAX } from '@/features/estimate-request-statuses/schemas/estimate-request-status.schema';
import { SHELL_MESSAGE_NAMESPACES } from '@/features/shell';
import { pick } from '@/lib/i18n/pick';

export function isEstimateRequestStatusId(id: string): boolean {
  const numericId = Number(id);
  return (
    /^\d+$/.test(id) &&
    Number.isSafeInteger(numericId) &&
    numericId > 0 &&
    numericId <= ESTIMATE_REQUEST_STATUS_ID_MAX
  );
}

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
