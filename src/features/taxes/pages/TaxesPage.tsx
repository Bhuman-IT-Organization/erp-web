import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedTaxesForm } from '@/features/taxes/components/TaxesForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'taxes'] as const;

interface TaxesPageProps {
  /** The record's id from `app/(shell)/setup/taxes/[id]/page.tsx`; `null` on the create route. */
  readonly id: string | null;
}

/**
 * The `/setup/taxes/new` and `/setup/taxes/:id` composition (a Server Component): the form under
 * its own message slice, behind its guards. The record is read in the browser, where the form
 * renders its own title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function TaxesPage({ id }: TaxesPageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedTaxesForm id={id} />
    </NextIntlClientProvider>
  );
}
