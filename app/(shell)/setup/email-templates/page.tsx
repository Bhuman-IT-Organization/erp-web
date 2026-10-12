import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmailTemplatesListPage } from '@/features/mail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('mail');
  return { title: t('email_templates') };
}

// Request-time render: the list is the signed-in member's view of the api (FE-15).
export const dynamic = 'force-dynamic';

export default function Page() {
  return <EmailTemplatesListPage />;
}
