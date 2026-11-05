import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TodosListPage } from '@/features/todo/pages/TodoListPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('todo');
  return { title: t('todos') };
}

export const dynamic = 'force-dynamic';

export default function Page() {
  return <TodosListPage />;
}
