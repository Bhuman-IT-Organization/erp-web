import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LeadSourcesPage } from '@/features/lead-sources/pages/LeadSourcesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('lead-sources');
  return { title: t('edit_source') };
}

// Request-time render: one record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/lead-sources/[id]'>) {
  const { id } = await props.params;
  const leadSourceId = Number(id);
  // The api takes a positive integer; anything else is not a lead source page (it would 400 there).
  if (!Number.isInteger(leadSourceId) || leadSourceId <= 0) notFound();
  return <LeadSourcesPage id={String(leadSourceId)} />;
}
