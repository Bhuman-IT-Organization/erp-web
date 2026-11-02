import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AnnouncementsPage } from '@/features/announcements/pages/AnnouncementsPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('announcements');
  return { title: t('announcement_add_heading') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <AnnouncementsPage id={null} />;
}
