import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LeadStatusesPage } from '@/features/lead-statuses';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('lead-statuses');
  return { title: t('lead_statuses') };
}

export const dynamic = 'force-dynamic';

export default async function Page({ params }: Props) {
  const { id } = await params;
  const statusId = Number(id);

  if (!Number.isSafeInteger(statusId) || statusId <= 0) {
    notFound();
  }

  return <LeadStatusesPage id={String(statusId)} />;
}
