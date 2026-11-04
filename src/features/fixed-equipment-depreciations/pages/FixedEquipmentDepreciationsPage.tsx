import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GuardedFixedEquipmentDepreciationsForm } from '@/features/fixed-equipment-depreciations/components/FixedEquipmentDepreciationsForm';
import { pick } from '@/lib/i18n/pick';

/** The namespaces the client subtree needs: a nested provider REPLACES the messages above it. */
const SLICE = ['common', 'fixed-equipment-depreciations'] as const;

interface FixedEquipmentDepreciationsPageProps {
  /** The record's id from `app/(shell)/setup/fixed-equipment-depreciations/[id]/page.tsx`; `null` on `/new`. */
  readonly id: string | null;
}

/**
 * The `/setup/fixed-equipment-depreciations/new` and `/setup/fixed-equipment-depreciations/:id` composition (a Server
 * Component): the form under its own message slice, behind its guards. The record is read in the
 * browser, where the form renders its own title. No `<main>`: the shell's `PageShell` owns it.
 */
export async function FixedEquipmentDepreciationsPage({
  id,
}: FixedEquipmentDepreciationsPageProps) {
  const messages = pick(await getMessages(), [...SLICE]);
  return (
    <NextIntlClientProvider messages={messages}>
      <GuardedFixedEquipmentDepreciationsForm id={id} />
    </NextIntlClientProvider>
  );
}
