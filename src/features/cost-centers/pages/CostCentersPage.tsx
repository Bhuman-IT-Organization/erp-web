import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedCostCentersForm } from '@/features/cost-centers/components/CostCentersForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'cost-centers'] as const;

interface CostCentersPageProps {
  /** The record's id from `app/(shell)/setup/cost-centers/[id]/page.tsx`; `null` on the create route. */
  readonly id: string | null;
}

/**
 * The `/setup/cost-centers/new` and `/setup/cost-centers/:id` composition (a Server Component): the form under
 * its own message slice, behind its guards. The record is read in the browser, where the form
 * renders its own title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function CostCentersPage({ id }: CostCentersPageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedCostCentersForm id={id} />
    </NextIntlClientProvider>
  );
}
