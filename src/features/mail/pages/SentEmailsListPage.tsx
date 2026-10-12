import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedSentEmailsList } from '@/features/mail/components/SentEmailsList';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'mail'] as const;

/** The `/setup/sent-emails` composition (a Server Component): the log under its message slice, behind its guards. */
export async function SentEmailsListPage() {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedSentEmailsList />
    </NextIntlClientProvider>
  );
}
