import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { KnowledgeBaseGroupsPage } from '@/features/knowledge-base-groups/pages/KnowledgeBaseGroupsPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowledge-base-groups');
  return { title: t('edit_kb_group') };
}

export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/knowledge-base-groups/[id]'>) {
  const { id } = await props.params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId) || groupId <= 0) notFound();
  return <KnowledgeBaseGroupsPage id={String(groupId)} />;
}
