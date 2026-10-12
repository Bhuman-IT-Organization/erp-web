import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RolePage } from '@/features/staff/pages/RolePage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('staff');
  return { title: t('new_role') };
}

// Request-time render: the form's permission catalogue is the api's data behind a session, so this
// page must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <RolePage mode="create" />;
}
