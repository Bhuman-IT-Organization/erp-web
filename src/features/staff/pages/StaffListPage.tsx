import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedStaffList } from '@/features/staff/components/StaffList';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'shell', 'staff'] as const;

/**
 * The `/setup/staff` composition (a Server Component): the list under its own message slice, behind its
 * guards. The list's state is the URL, read in the browser (FE-15), and `ListPageTemplate` renders
 * the page title. It renders no `<main>`: `PageShell` owns the page's one main landmark.
 */
export async function StaffListPage() {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <div className="pb-16">
      <NextIntlClientProvider messages={messages}>
        <GuardedStaffList />
      </NextIntlClientProvider>
    </div>
  );
}
