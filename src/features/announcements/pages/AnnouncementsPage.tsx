import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedAnnouncementsForm } from '@/features/announcements/components/AnnouncementsForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'announcements'] as const;

/**
 * The `/setup/announcements/new` and `/setup/announcements/:id` composition (a Server Component):
 * the form under its own message slice, behind its guards. No `<main>`: the shell's `PageShell`
 * owns it.
 */
export async function AnnouncementsPage({ id }: { readonly id: string | null }) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedAnnouncementsForm id={id} />
    </NextIntlClientProvider>
  );
}
