import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedEmailTemplatesList } from '@/features/mail/components/EmailTemplatesList';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'mail'] as const;

/** The `/setup/email-templates` composition (a Server Component): the list under its message slice, behind its guards. */
export async function EmailTemplatesListPage() {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedEmailTemplatesList />
    </NextIntlClientProvider>
  );
}
