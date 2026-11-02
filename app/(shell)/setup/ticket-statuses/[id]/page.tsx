import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { TicketStatusesPage } from '@/features/ticket-statuses/pages/TicketStatusesPage';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ticket-statuses');
  return { title: t('ticket_status_edit') };
}

// Request-time render: one record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/ticket-statuses/[id]'>) {
  const { id } = await props.params;
  const ticketStatusId = Number(id);
  // The api takes a positive integer; anything else is not a ticket status page (it would 400 there).
  if (!Number.isInteger(ticketStatusId) || ticketStatusId <= 0) notFound();
  return <TicketStatusesPage id={String(ticketStatusId)} />;
}
