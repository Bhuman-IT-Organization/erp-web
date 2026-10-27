import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactElement } from 'react';
import { GuardedServicesForm } from '@/features/services/components/ServicesForm';
import { SHELL_MESSAGE_NAMESPACES } from '@/features/shell';
import { pick } from '@/lib/i18n/pick';

interface ServicesPageProps {
  readonly id: string | null;
}

export async function ServicesPage({ id }: ServicesPageProps): Promise<ReactElement> {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pick(messages, [...SHELL_MESSAGE_NAMESPACES, 'services'])}>
      <GuardedServicesForm id={id} />
    </NextIntlClientProvider>
  );
}
