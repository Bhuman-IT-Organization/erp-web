import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { LeadStatusesListPage } from '@/features/lead-statuses';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('lead-statuses');

  return {
    title: t('lead_statuses'),
  };
}

export const dynamic = 'force-dynamic';

export default function Page() {
  return <LeadStatusesListPage />;
}
