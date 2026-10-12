import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CostCentersPage } from '@/features/cost-centers/pages/CostCentersPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('cost-centers');
  return { title: t('add_cost_center') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <CostCentersPage id={null} />;
}
