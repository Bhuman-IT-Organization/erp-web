import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  EstimateRequestStatusFormPage,
  isEstimateRequestStatusId,
} from '@/features/estimate-request-statuses/pages/EstimateRequestStatusFormPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('estimate-request-statuses');
  return { title: t('edit_status') };
}

export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/estimate_request-statuses/[id]'>) {
  const { id } = await props.params;
  if (!isEstimateRequestStatusId(id)) notFound();
  return <EstimateRequestStatusFormPage id={String(Number(id))} />;
}
