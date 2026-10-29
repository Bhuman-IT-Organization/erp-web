import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedTicketPrioritiesForm } from '@/features/ticket-priorities/components/TicketPrioritiesForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'ticket-priorities'] as const;

interface TicketPrioritiesPageProps {
  /** The record's id from `app/(shell)/setup/ticket-priorities/[id]/page.tsx`; `null` on `/new`. */
  readonly id: string | null;
}

/**
 * The `/setup/ticket-priorities/new` and `/setup/ticket-priorities/:id` composition (a Server
 * Component): the form under its own message slice, behind its guards. The record is read in the
 * browser, where the form renders its own title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function TicketPrioritiesPage({ id }: TicketPrioritiesPageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedTicketPrioritiesForm id={id} />
    </NextIntlClientProvider>
  );
}
