import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedPaymentModesList } from '@/features/payment-modes/components/PaymentModesList';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'payment-modes'] as const;

/**
 * The `/setup/payment-modes` composition (a Server Component): the list under its own message slice,
 * behind its guards. The list's state is the URL, read in the browser (FE-15), and
 * `ListPageTemplate` renders the page title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function PaymentModesListPage() {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedPaymentModesList />
    </NextIntlClientProvider>
  );
}
