import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PredefinedRepliesPage } from '@/features/predefined-replies/pages/PredefinedRepliesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('predefined-replies');
  return { title: t('new_title') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <PredefinedRepliesPage id={null} />;
}
