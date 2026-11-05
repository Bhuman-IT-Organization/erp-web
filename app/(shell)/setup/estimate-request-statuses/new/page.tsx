import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EstimateRequestStatusesPage } from '@/features/estimate-request-statuses/pages/EstimateRequestStatusesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('estimate-request-statuses');
  return { title: t('new_status') };
}

export const dynamic = 'force-dynamic';

export default function Page() {
  return <EstimateRequestStatusesPage id={null} />;
}
