import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TaxesPage } from '@/features/taxes/pages/TaxesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('taxes');
  return { title: t('tax_add_title') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <TaxesPage id={null} />;
}
