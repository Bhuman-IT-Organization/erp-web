import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedExpenseCategoriesList } from '@/features/expense-categories/components/ExpenseCategoriesList';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'expense-categories'] as const;

/**
 * The `/setup/expense-categories` composition (a Server Component): the list under its own message slice,
 * behind its guards. The list's state is the URL, read in the browser (FE-15), and
 * `ListPageTemplate` renders the page title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function ExpenseCategoriesListPage() {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedExpenseCategoriesList />
    </NextIntlClientProvider>
  );
}
