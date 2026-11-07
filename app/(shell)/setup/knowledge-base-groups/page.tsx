import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { KnowledgeBaseGroupsListPage } from '@/features/knowledge-base-groups/pages/KnowledgeBaseGroupsListPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowledge-base-groups');
  return { title: t('groups') };
}

export const dynamic = 'force-dynamic';

export default function Page() {
  return <KnowledgeBaseGroupsListPage />;
}
