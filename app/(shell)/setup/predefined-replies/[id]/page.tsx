import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PredefinedRepliesPage } from '@/features/predefined-replies/pages/PredefinedRepliesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('predefined-replies');
  return { title: t('predefined_reply') };
}

// Request-time render: one record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/predefined-replies/[id]'>) {
  const { id } = await props.params;
  const replyId = Number(id);
  // The api takes a positive integer; anything else is not a predefined reply page.
  if (!Number.isInteger(replyId) || replyId <= 0) notFound();
  return <PredefinedRepliesPage id={String(replyId)} />;
}
