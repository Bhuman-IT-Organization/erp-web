import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedExpenseCategoriesForm } from '@/features/expense-categories/components/ExpenseCategoriesForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'expense-categories'] as const;

interface ExpenseCategoriesPageProps {
  /** The record's id from `app/(shell)/setup/expense-categories/[id]/page.tsx`; `null` on the create route. */
  readonly id: string | null;
}

/**
 * The `/setup/expense-categories/new` and `/setup/expense-categories/:id` composition (a Server Component): the form under
 * its own message slice, behind its guards. The record is read in the browser, where the form
 * renders its own title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function ExpenseCategoriesPage({ id }: ExpenseCategoriesPageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedExpenseCategoriesForm id={id} />
    </NextIntlClientProvider>
  );
}
