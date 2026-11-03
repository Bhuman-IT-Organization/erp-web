import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { KnowledgeBaseGroupsPage } from '@/features/knowledge-base/pages/KnowledgeBaseGroupsPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowledge-base');
  return { title: t('groups') };
}

export const dynamic = 'force-dynamic';

export default function Page() {
  return <KnowledgeBaseGroupsPage />;
}
