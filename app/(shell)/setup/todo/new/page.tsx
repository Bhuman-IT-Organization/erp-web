import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TodosPage } from '@/features/todo/pages/TodoPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('todo');
  return { title: t('new_todo') };
}

export const dynamic = 'force-dynamic';

export default function Page() {
  return <TodosPage id={null} />;
}
