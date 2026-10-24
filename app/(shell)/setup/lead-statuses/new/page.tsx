import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LeadStatusesPage } from '@/features/lead-statuses/pages/LeadStatusesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('lead-statuses');
  return { title: t('add_lead_status') };
}

export const dynamic = 'force-dynamic';

export default function Page() {
  return <LeadStatusesPage id={null} />;
}
