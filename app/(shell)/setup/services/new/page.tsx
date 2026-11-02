import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ServicesPage } from '@/features/services/pages/ServicesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('services');
  return { title: t('new_service') };
}

// Request-time render: a form behind a session, never prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <ServicesPage id={null} />;
}
