import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ContractTypesPage } from '@/features/contract-types/pages/ContractTypesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contract-types');
  return { title: t('contract_type_edit') };
}

// Request-time render: one record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/contract-types/[id]'>) {
  const { id } = await props.params;
  const contractTypeId = Number(id);
  // The api takes a positive integer; anything else is not a contract type page (it would 400 there).
  if (!Number.isInteger(contractTypeId) || contractTypeId <= 0) notFound();
  return <ContractTypesPage id={String(contractTypeId)} />;
}
