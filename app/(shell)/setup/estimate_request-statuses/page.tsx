import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EstimateRequestStatusesListPage } from '@/features/estimate-request-statuses/pages/EstimateRequestStatusesListPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('estimate-request-statuses');
  return { title: t('statuses') };
  return { title: t('title') };
}

export const dynamic = 'force-dynamic';

export default function Page() {
  return <EstimateRequestStatusesListPage />;
}
