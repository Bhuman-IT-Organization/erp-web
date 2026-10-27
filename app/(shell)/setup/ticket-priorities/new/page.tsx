import type { ReactElement } from 'react';
import { PrioritiesForm } from '@/features/ticket-priorities';

export default function NewTicketPriorityPage(): ReactElement {
  return (
    <div className="p-6">
      <PrioritiesForm />
    </div>
  );
}
