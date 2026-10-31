import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactElement } from 'react';
import { GuardedLeadSourcesForm } from '@/features/lead-sources/components/LeadSourcesForm';
import { SHELL_MESSAGE_NAMESPACES } from '@/features/shell';
import { pick } from '@/lib/i18n/pick';

interface LeadSourcesPageProps {
  readonly id: string | null;
}

export async function LeadSourcesPage({ id }: LeadSourcesPageProps): Promise<ReactElement> {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      messages={pick(messages, [...SHELL_MESSAGE_NAMESPACES, 'lead-sources'])}
    >
      <GuardedLeadSourcesForm id={id} />
    </NextIntlClientProvider>
  );
}
