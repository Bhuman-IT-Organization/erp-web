import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedContractTypesForm } from '@/features/contract-types/components/ContractTypesForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'contract-types'] as const;

interface ContractTypesPageProps {
  /** The record's id from `app/(shell)/contract-types/[id]/page.tsx`; `null` on the create route. */
  readonly id: string | null;
}

/**
 * The `/setup/contract-types/new` and `/setup/contract-types/:id` composition (a Server Component): the form under
 * its own message slice, behind its guards. The record is read in the browser, where the form
 * renders its own title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function ContractTypesPage({ id }: ContractTypesPageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedContractTypesForm id={id} />
    </NextIntlClientProvider>
  );
}
