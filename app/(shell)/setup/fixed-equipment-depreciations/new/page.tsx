import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FixedEquipmentDepreciationsPage } from '@/features/fixed-equipment-depreciations/pages/FixedEquipmentDepreciationsPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('fixed-equipment-depreciations');
  return { title: t('fe_add_depreciations') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <FixedEquipmentDepreciationsPage id={null} />;
}
