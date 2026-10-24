import { GuardedLeadStatusesForm } from '../components/LeadStatusesForm';

interface LeadStatusesPageProps {
  readonly id: string | null;
}

export function LeadStatusesPage({ id }: LeadStatusesPageProps) {
  return <GuardedLeadStatusesForm id={id} />;
}
