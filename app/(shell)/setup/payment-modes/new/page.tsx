import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PaymentModesPage } from '@/features/payment-modes/pages/PaymentModesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('payment-modes');
  return { title: t('payment_mode_add_heading') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <PaymentModesPage id={null} />;
}
