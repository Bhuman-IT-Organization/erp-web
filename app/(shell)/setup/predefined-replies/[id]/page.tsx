import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PredefinedRepliesPage } from '@/features/predefined-replies/pages/PredefinedRepliesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('predefined-replies');
  return { title: t('record_title') };
}

// Request-time render: one record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/predefined-replies/[id]'>) {
  const { id } = await props.params;
  return <PredefinedRepliesPage id={id} />;
}
