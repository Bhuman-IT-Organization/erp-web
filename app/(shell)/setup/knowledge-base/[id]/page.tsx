import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { KnowledgeBasePage } from '@/features/knowledge-base/pages/KnowledgeBasePage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowledge-base');
  return { title: t('edit_knowledge_base') };
}

// Request-time render: one record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/knowledge-base/[id]'>) {
  const { id } = await props.params;
  const knowledgeBaseId = Number(id);
  // The api takes a positive integer; anything else is not a knowledge base page (it would 400 there).
  if (!Number.isInteger(knowledgeBaseId) || knowledgeBaseId <= 0) notFound();
  return <KnowledgeBasePage id={String(knowledgeBaseId)} />;
}
