import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

import { SHELL_MESSAGE_NAMESPACES } from '@/features/shell';
import { pick } from '@/lib/i18n/pick';

interface Props {
  readonly children: ReactNode;
}

export default async function LeadStatusesLayout({ children }: Props) {
  const messages = await getMessages();

  return (
    <NextIntlClientProvider
      messages={pick(messages, [...SHELL_MESSAGE_NAMESPACES, 'lead-statuses'])}
    >
      {children}
    </NextIntlClientProvider>
  );
}
