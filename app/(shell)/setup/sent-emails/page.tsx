import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SentEmailsListPage } from '@/features/mail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('mail');
  return { title: t('sent_emails') };
}

// Request-time render: the log is the signed-in administrator's view of the api (FE-15).
export const dynamic = 'force-dynamic';

export default function Page() {
  return <SentEmailsListPage />;
}
