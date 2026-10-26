import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TicketStatusPage } from '@/features/ticket/pages/TicketStatusPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ticket-statuses');
  return { title: t('add_ticket_status') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <TicketStatusPage id={null} />;
}
