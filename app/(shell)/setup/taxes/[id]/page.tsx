import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { TaxesPage } from '@/features/taxes/pages/TaxesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('taxes');
  return { title: t('tax_edit_title') };
}

// Request-time render: one record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/taxes/[id]'>) {
  const { id } = await props.params;
  const taxId = Number(id);
  // The api takes a positive integer; anything else is not a tax page (it would 400 there).
  if (!Number.isInteger(taxId) || taxId <= 0) notFound();
  return <TaxesPage id={String(taxId)} />;
}
