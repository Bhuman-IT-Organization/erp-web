import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SentEmailPage } from '@/features/mail';

// Static (T-4.3-33): no recipient or template name in the browser history.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('mail');
  return { title: t('sent_email') };
}

// Request-time render: one entry behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/sent-emails/[id]'>) {
  const { id } = await props.params;
  const entryId = Number(id);
  // The api takes a positive integer; anything else is not an entry page (it would 400 there).
  if (!Number.isInteger(entryId) || entryId <= 0) notFound();
  return <SentEmailPage id={String(entryId)} />;
}
