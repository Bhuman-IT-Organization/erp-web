import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

import { GuardedLeadStatusesForm } from '../components/LeadStatusesForm';
import { pick } from '@/lib/i18n/pick';

const SLICE = ['common', 'lead-statuses'] as const;

interface LeadStatusesPageProps {
  readonly id: string | null;
}

export async function LeadStatusesPage({ id }: LeadStatusesPageProps) {
  const messages = pick(await getMessages(), [...SLICE]);

  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedLeadStatusesForm id={id} />
    </NextIntlClientProvider>
  );
}
