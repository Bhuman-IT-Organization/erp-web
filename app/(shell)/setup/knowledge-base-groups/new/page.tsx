import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { KnowledgeBaseGroupsPage } from '@/features/knowledge-base-groups/pages/KnowledgeBaseGroupsPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowledge-base-groups');
  return { title: t('new_group') };
}

export const dynamic = 'force-dynamic';

export default function Page() {
  return <KnowledgeBaseGroupsPage id={null} />;
}
