import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ServicesPage } from '@/features/services/pages/ServicesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('services');
  return { title: t('ticket_service_edit') };
}

export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/services/[id]'>) {
  const { id } = await props.params;
  const serviceId = Number(id);
  if (!Number.isInteger(serviceId) || serviceId <= 0) notFound();
  return <ServicesPage id={String(serviceId)} />;
}
