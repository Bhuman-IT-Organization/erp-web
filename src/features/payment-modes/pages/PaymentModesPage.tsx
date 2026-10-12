import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedPaymentModesForm } from '@/features/payment-modes/components/PaymentModesForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'payment-modes'] as const;

interface PaymentModesPageProps {
  /** The record's id from `app/(shell)/setup/payment-modes/[id]/page.tsx`; `null` on the create route. */
  readonly id: string | null;
}

/**
 * The `/setup/payment-modes/new` and `/setup/payment-modes/:id` composition (a Server Component): the form under
 * its own message slice, behind its guards. The record is read in the browser, where the form
 * renders its own title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function PaymentModesPage({ id }: PaymentModesPageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedPaymentModesForm id={id} />
    </NextIntlClientProvider>
  );
}
