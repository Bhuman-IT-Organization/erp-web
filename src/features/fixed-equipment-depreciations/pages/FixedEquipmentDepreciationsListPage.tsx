import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedFixedEquipmentDepreciationsList } from '@/features/fixed-equipment-depreciations/components/FixedEquipmentDepreciationsList';
import { pick } from '@/lib/i18n/pick';

/**
 * The namespaces the client subtree needs: a nested provider REPLACES the messages above it. The
 * list title is Perfex's `fe_depreciations`, in the feature's own namespace (the tab has no menu
 * item of its own), so `shell` is not in the slice.
 */
const SLICE = ['common', 'fixed-equipment-depreciations'] as const;

/**
 * The `/setup/fixed-equipment-depreciations` composition (a Server Component): the list under its
 * own message slice, behind its guards. The list's state is the URL, read in the browser (FE-15).
 * No `<main>`: the shell's `PageShell` owns it.
 */
export async function FixedEquipmentDepreciationsListPage() {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedFixedEquipmentDepreciationsList />
    </NextIntlClientProvider>
  );
}
