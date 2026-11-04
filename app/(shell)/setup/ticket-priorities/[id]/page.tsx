import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { TicketPrioritiesPage } from '@/features/ticket-priorities/pages/TicketPrioritiesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ticket-priorities');
  return { title: t('ticket_priority_edit') };
}

// Request-time render: one record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/ticket-priorities/[id]'>) {
  // Next.js 16: `params` is a Promise.
  const { id } = await props.params;
  const priorityId = Number(id);
  // The api takes a positive integer; anything else is not a ticket priority page (it would 400).
  if (!Number.isInteger(priorityId) || priorityId <= 0) notFound();
  return <TicketPrioritiesPage id={String(priorityId)} />;
}
