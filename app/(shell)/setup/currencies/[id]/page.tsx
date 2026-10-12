import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CurrenciesPage } from '@/features/currencies/pages/CurrenciesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('currencies');
  return { title: t('currency_edit_heading') };
}

// Request-time render: one record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/currencies/[id]'>) {
  const { id } = await props.params;
  const currencyId = Number(id);
  // The api takes a positive integer; anything else is not a currency page (it would 400 there).
  if (!Number.isInteger(currencyId) || currencyId <= 0) notFound();
  return <CurrenciesPage id={String(currencyId)} />;
}
