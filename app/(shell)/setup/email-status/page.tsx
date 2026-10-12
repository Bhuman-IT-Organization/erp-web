import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmailStatusPage } from '@/features/mail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('mail');
  return { title: t('email_status') };
}

// Request-time render: the deployment's mail setup as the signed-in administrator sees it (FE-15).
export const dynamic = 'force-dynamic';

export default function Page() {
  return <EmailStatusPage />;
}
