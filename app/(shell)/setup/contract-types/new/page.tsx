import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ContractTypesPage } from '@/features/contract-types/pages/ContractTypesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contract-types');
  return { title: t('new_contract_type') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <ContractTypesPage id={null} />;
}
