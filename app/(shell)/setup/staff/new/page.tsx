import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { StaffMemberPage } from '@/features/staff/pages/StaffMemberPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('staff');
  return { title: t('new_staff') };
}

// Request-time render: the form's lookups (roles, departments, the permission catalogue) are the
// api's data behind a session, so this page must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <StaffMemberPage mode="create" />;
}
