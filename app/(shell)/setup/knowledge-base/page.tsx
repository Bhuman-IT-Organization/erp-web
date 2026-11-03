import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { KnowledgeBaseListPage } from '@/features/knowledge-base/pages/KnowledgeBaseListPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowledge-base');
  return { title: t('knowledge_base') };
}

export const dynamic = 'force-dynamic';

export default function Page() {
  return <KnowledgeBaseListPage />;
}
