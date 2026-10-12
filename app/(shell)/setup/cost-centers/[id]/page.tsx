import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CostCentersPage } from '@/features/cost-centers/pages/CostCentersPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('cost-centers');
  return { title: t('edit_cost_center') };
}

// Request-time render: one record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/cost-centers/[id]'>) {
  const { id } = await props.params;
  const costCenterId = Number(id);
  // The api takes a positive integer; anything else is not a cost center page (it would 400 there).
  if (!Number.isInteger(costCenterId) || costCenterId <= 0) notFound();
  return <CostCentersPage id={String(costCenterId)} />;
}
