import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ContractTypesListPage } from '@/features/contract-types/pages/ContractTypesListPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contract-types');
  return { title: t('contract_types') };
}

// Request-time render: the list is the signed-in member's own view of the api, never baked in at
// build time. Its search, sort and page live in the URL and are read in the browser (FE-15).
export const dynamic = 'force-dynamic';

export default function Page() {
  return <ContractTypesListPage />;
}
