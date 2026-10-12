import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CostCentersListPage } from '@/features/cost-centers/pages/CostCentersListPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('cost-centers');
  return { title: t('cost_centers') };
}

// Request-time render: the list is the signed-in member's own view of the api, never baked in at
// build time. Its search, sort and page live in the URL and are read in the browser (FE-15).
export const dynamic = 'force-dynamic';

export default function Page() {
  return <CostCentersListPage />;
}
