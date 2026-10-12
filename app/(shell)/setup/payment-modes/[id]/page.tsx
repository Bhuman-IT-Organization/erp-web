import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PaymentModesPage } from '@/features/payment-modes/pages/PaymentModesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('payment-modes');
  return { title: t('payment_mode_edit_heading') };
}

// Request-time render: one record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/payment-modes/[id]'>) {
  const { id } = await props.params;
  const paymentModeId = Number(id);
  // The api takes a positive integer; anything else is not a payment mode page (it would 400 there).
  if (!Number.isInteger(paymentModeId) || paymentModeId <= 0) notFound();
  return <PaymentModesPage id={String(paymentModeId)} />;
}
