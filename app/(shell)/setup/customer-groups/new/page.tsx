import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomerGroupsPage } from '@/features/customer-groups/pages/CustomerGroupsPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('customer-groups');
  return { title: t('customer_group_add_heading') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <CustomerGroupsPage id={null} />;
}
