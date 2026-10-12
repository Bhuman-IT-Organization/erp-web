import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedEmailTemplateForm } from '@/features/mail/components/EmailTemplateForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'mail'] as const;

interface EmailTemplatePageProps {
  /** The template's id from `app/(shell)/setup/email-templates/[id]/page.tsx`. */
  readonly id: string;
}

/**
 * The `/setup/email-templates/:id` composition (a Server Component): the editor under its message
 * slice, behind its guards. The record is read in the browser, where the editor renders its own
 * title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function EmailTemplatePage({ id }: EmailTemplatePageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedEmailTemplateForm id={id} />
    </NextIntlClientProvider>
  );
}
