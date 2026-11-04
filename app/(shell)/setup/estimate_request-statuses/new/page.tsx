import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EstimateRequestStatusFormPage } from '@/features/estimate-request-statuses/pages/EstimateRequestStatusFormPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('estimate-request-statuses');
  return { title: t('new_status') };
}

export const dynamic = 'force-dynamic';

export default function Page() {
  return <EstimateRequestStatusFormPage id={null} />;
}
