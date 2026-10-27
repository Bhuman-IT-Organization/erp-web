import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { PrioritiesForm } from '@/features/ticket-priorities';

interface Props {
  params: { id: string };
}

export default function EditTicketPriorityPage({ params }: Props): ReactElement {
  const priorityId = Number(params.id);

  if (!Number.isInteger(priorityId) || priorityId <= 0) {
    notFound();
  }

  return (
    <div className="p-6">
      <PrioritiesForm priorityId={priorityId} />
    </div>
  );
}
