import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmailTemplatePage } from '@/features/mail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('mail');
  return { title: t('email_template') };
}

// Request-time render: one template behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/email-templates/[id]'>) {
  const { id } = await props.params;
  const templateId = Number(id);
  // The api takes a positive integer; anything else is not a template page (it would 400 there).
  if (!Number.isInteger(templateId) || templateId <= 0) notFound();
  return <EmailTemplatePage id={String(templateId)} />;
}
