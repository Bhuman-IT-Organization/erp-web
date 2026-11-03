import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { KnowledgeBasePage } from '@/features/knowledge-base/pages/KnowledgeBasePage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowledge-base');
  return { title: t('add_knowledge_base') };
}

export const dynamic = 'force-dynamic';

export default function Page() {
  return <KnowledgeBasePage id={null} />;
}
