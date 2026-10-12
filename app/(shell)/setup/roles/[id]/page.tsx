import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { RolePage } from '@/features/staff/pages/RolePage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('staff');
  return { title: t('roles_dt_name') };
}

// Request-time render: one role's template behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/roles/[id]'>) {
  const { id } = await props.params;
  const roleId = Number(id);
  // The api takes a positive integer; anything else is not a role page (it would 404 there too).
  if (!Number.isInteger(roleId) || roleId <= 0) notFound();
  return <RolePage mode="edit" id={roleId} />;
}
