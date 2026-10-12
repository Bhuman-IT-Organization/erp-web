import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RolesListPage } from '@/features/staff/pages/RolesListPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('staff');
  return { title: t('staff_roles') };
}

// Request-time render: the roles list is the signed-in administrator's own view of the api and is
// never baked in at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <RolesListPage />;
}
