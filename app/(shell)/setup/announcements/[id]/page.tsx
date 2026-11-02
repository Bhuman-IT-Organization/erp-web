import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AnnouncementsPage } from '@/features/announcements/pages/AnnouncementsPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('announcements');
  return { title: t('announcement_edit_heading') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/announcements/[id]'>) {
  const { id } = await props.params;
  const announcementId = Number(id);
  // The api takes a positive integer; anything else is not an announcement page (it would 400 there).
  if (!Number.isInteger(announcementId) || announcementId <= 0) notFound();
  return <AnnouncementsPage id={String(announcementId)} />;
}
