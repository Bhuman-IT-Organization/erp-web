import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CurrenciesPage } from '@/features/currencies/pages/CurrenciesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('currencies');
  return { title: t('currency_add_heading') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <CurrenciesPage id={null} />;
}
