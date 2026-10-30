import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CustomerGroupsPage } from '@/features/customer-groups/pages/CustomerGroupsPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('customer-groups');
  return { title: t('customer_group_edit_heading') };
}

// Request-time render: one record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/customer-groups/[id]'>) {
  const { id } = await props.params;
  const customerGroupId = Number(id);
  // The api takes a positive integer; anything else is not a customer group page (it would 400 there).
  if (!Number.isInteger(customerGroupId) || customerGroupId <= 0) notFound();
  return <CustomerGroupsPage id={String(customerGroupId)} />;
}
