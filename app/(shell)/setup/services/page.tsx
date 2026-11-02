import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ServicesListPage } from '@/features/services/pages/ServicesListPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('services');
  return { title: t('services') };
}

export const dynamic = 'force-dynamic';

export default function Page() {
  return <ServicesListPage />;
}
