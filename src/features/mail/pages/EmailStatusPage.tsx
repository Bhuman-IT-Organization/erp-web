import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedEmailStatus } from '@/features/mail/components/EmailStatus';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'mail'] as const;

/** The `/setup/email-status` composition (a Server Component): the status page under its message slice, behind its guards. */
export async function EmailStatusPage() {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedEmailStatus />
    </NextIntlClientProvider>
  );
}
