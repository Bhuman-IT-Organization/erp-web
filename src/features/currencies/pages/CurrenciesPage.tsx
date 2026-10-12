import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedCurrenciesForm } from '@/features/currencies/components/CurrenciesForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'currencies'] as const;

interface CurrenciesPageProps {
  /** The record's id from `app/(shell)/setup/currencies/[id]/page.tsx`; `null` on the create route. */
  readonly id: string | null;
}

/**
 * The `/setup/currencies/new` and `/setup/currencies/:id` composition (a Server Component): the form under
 * its own message slice, behind its guards. The record is read in the browser, where the form
 * renders its own title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function CurrenciesPage({ id }: CurrenciesPageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedCurrenciesForm id={id} />
    </NextIntlClientProvider>
  );
}
