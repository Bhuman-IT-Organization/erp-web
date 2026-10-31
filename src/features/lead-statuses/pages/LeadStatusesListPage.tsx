import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

import { GuardedLeadStatusesList } from '../components/LeadStatusesList';
import { pick } from '@/lib/i18n/pick';

const SLICE = ['common', 'lead-statuses'] as const;

export async function LeadStatusesListPage() {
  const messages = pick(await getMessages(), [...SLICE]);

  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedLeadStatusesList />
    </NextIntlClientProvider>
  );
}
