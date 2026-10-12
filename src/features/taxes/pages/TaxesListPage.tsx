import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedTaxesList } from '@/features/taxes/components/TaxesList';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'taxes'] as const;

/**
 * The `/setup/taxes` composition (a Server Component): the list under its own message slice,
 * behind its guards. The list's state is the URL, read in the browser (FE-15), and
 * `ListPageTemplate` renders the page title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function TaxesListPage() {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedTaxesList />
    </NextIntlClientProvider>
  );
}
