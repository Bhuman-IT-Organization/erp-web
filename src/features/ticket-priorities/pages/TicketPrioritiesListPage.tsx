import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedTicketPrioritiesList } from '@/features/ticket-priorities/components/TicketPrioritiesList';
import { pick } from '@/lib/i18n/pick';

/**
 * The namespaces the client subtree needs: a nested provider REPLACES the messages above it. The
 * list title is Perfex's menu key `shell.acs_ticket_priority_submenu`, so `shell` is in the slice.
 */
const SLICE = ['common', 'shell', 'ticket-priorities'] as const;

/**
 * The `/setup/ticket-priorities` composition (a Server Component): the list under its own message
 * slice, behind its guards. The list's state is the URL, read in the browser (FE-15). No `<main>`:
 * the shell's `PageShell` owns it.
 */
export async function TicketPrioritiesListPage() {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedTicketPrioritiesList />
    </NextIntlClientProvider>
  );
}
