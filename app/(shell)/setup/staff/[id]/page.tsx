import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { StaffMemberPage } from '@/features/staff/pages/StaffMemberPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('staff');
  return { title: t('staff_member') };
}

// Request-time render: one member's record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/staff/[id]'>) {
  const { id } = await props.params;
  const staffId = Number(id);
  // The api takes a positive integer; anything else is not a member page (it would 404 there too).
  if (!Number.isInteger(staffId) || staffId <= 0) notFound();
  return <StaffMemberPage mode="edit" id={staffId} />;
}
