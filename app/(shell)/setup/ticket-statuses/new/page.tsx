import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TicketStatusesPage } from '@/features/ticket-statuses/pages/TicketStatusesPage';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ticket-statuses');
  return { title: t('new_ticket_status') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <TicketStatusesPage id={null} />;
}
