import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactElement } from 'react';
import { GuardedTicketStatusesForm } from '@/features/ticket-statuses/components/TicketStatusesForm';
import { SHELL_MESSAGE_NAMESPACES } from '@/features/shell';
import { pick } from '@/lib/i18n/pick';

interface TicketStatusesPageProps {
  readonly id: string | null;
}

export async function TicketStatusesPage({ id }: TicketStatusesPageProps): Promise<ReactElement> {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      messages={pick(messages, [...SHELL_MESSAGE_NAMESPACES, 'ticket-statuses'])}
    >
      {' '}
      <GuardedTicketStatusesForm id={id} />
    </NextIntlClientProvider>
  );
}
