import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LeadSourcesPage } from '@/features/lead-sources/pages/LeadSourcesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('lead-sources');
  return { title: t('lead_new_source') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <LeadSourcesPage id={null} />;
}
