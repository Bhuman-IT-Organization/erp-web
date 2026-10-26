import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedPredefinedRepliesForm } from '@/features/predefined-replies/components/PredefinedRepliesForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'predefined-replies'] as const;

interface PredefinedRepliesPageProps {
  /** The record's id from `app/(shell)/predefined-replies/[id]/page.tsx`; `null` on the create route. */
  readonly id: string | null;
}

/**
 * The `/predefined-replies/new` and `/predefined-replies/:id` composition (a Server Component): the form under
 * its own message slice, behind its guards. The record is read in the browser, where the form
 * renders its own title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function PredefinedRepliesPage({ id }: PredefinedRepliesPageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedPredefinedRepliesForm id={id} />
    </NextIntlClientProvider>
  );
}
