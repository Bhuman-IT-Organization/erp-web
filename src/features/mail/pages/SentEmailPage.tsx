import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedSentEmailDetail } from '@/features/mail/components/SentEmailDetail';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'mail'] as const;

interface SentEmailPageProps {
  /** The entry's id from `app/(shell)/setup/sent-emails/[id]/page.tsx`. */
  readonly id: string;
}

/**
 * The `/setup/sent-emails/:id` composition (a Server Component): one entry under its message slice,
 * behind its guards. The entry is read in the browser, where the page renders its own title.
 */
export async function SentEmailPage({ id }: SentEmailPageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedSentEmailDetail id={id} />
    </NextIntlClientProvider>
  );
}
