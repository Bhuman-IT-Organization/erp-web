import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EstimateRequestStatusesPage } from '@/features/estimate-request-statuses/pages/EstimateRequestStatusesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('estimate-request-statuses');
  return { title: t('edit_status') };
}

export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/estimate-request-statuses/[id]'>) {
  const { id } = await props.params;
  const statusId = Number(id);
  if (!Number.isInteger(statusId) || statusId <= 0) notFound();
  return <EstimateRequestStatusesPage id={String(statusId)} />;
}
