import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TicketPrioritiesPage } from '@/features/ticket-priorities/pages/TicketPrioritiesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ticket-priorities');
  return { title: t('ticket_priority_add') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <TicketPrioritiesPage id={null} />;
}
