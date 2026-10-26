import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedCustomerGroupsForm } from '@/features/customer-groups/components/CustomerGroupsForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'customer-groups'] as const;

interface CustomerGroupsPageProps {
  /** The record's id from `app/(shell)/setup/customer-groups/[id]/page.tsx`; `null` on the create route. */
  readonly id: string | null;
}

/**
 * The `/setup/customer-groups/new` and `/setup/customer-groups/:id` composition (a Server
 * Component): the form under its own message slice, behind its guards. The record is read in the
 * browser, where the form renders its own title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function CustomerGroupsPage({ id }: CustomerGroupsPageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedCustomerGroupsForm id={id} />
    </NextIntlClientProvider>
  );
}
