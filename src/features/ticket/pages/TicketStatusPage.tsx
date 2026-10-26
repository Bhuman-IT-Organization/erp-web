import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactElement } from 'react';
import { GuardedTicketStatusesForm } from '@/features/ticket/components/TicketStatusForm';
import { SHELL_MESSAGE_NAMESPACES } from '@/features/shell';
import { pick } from '@/lib/i18n/pick';

interface TicketStatusPageProps {
  readonly id: string | null;
}

export async function TicketStatusPage({ id }: TicketStatusPageProps): Promise<ReactElement> {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pick(messages, [...SHELL_MESSAGE_NAMESPACES, 'ticket'])}>
      <GuardedTicketStatusesForm id={id} />
    </NextIntlClientProvider>
  );
}
