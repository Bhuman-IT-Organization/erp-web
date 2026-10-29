import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TicketPrioritiesListPage } from '@/features/ticket-priorities/pages/TicketPrioritiesListPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell');
  return { title: t('acs_ticket_priority_submenu') };
}

// Request-time render: the list is the signed-in member's own view of the api, never baked in at
// build time. Its search, sort and page live in the URL and are read in the browser (FE-15).
export const dynamic = 'force-dynamic';

export default function Page() {
  return <TicketPrioritiesListPage />;
}
