import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { FixedEquipmentDepreciationsPage } from '@/features/fixed-equipment-depreciations/pages/FixedEquipmentDepreciationsPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('fixed-equipment-depreciations');
  return { title: t('fe_edit_depreciations') };
}

// Request-time render: one record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/fixed-equipment-depreciations/[id]'>) {
  // Next.js 16: `params` is a Promise.
  const { id } = await props.params;
  const depreciationId = Number(id);
  // The api takes a positive integer; anything else is not a depreciation page (it would 400).
  if (!Number.isInteger(depreciationId) || depreciationId <= 0) notFound();
  return <FixedEquipmentDepreciationsPage id={String(depreciationId)} />;
}
