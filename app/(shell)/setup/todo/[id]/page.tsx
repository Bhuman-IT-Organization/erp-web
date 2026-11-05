import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { TodosPage } from '@/features/todo/pages/TodoPage';

interface TodoPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('todo');
  return { title: t('edit_todo') };
}

export const dynamic = 'force-dynamic';

export default async function Page({ params }: TodoPageProps) {
  const { id } = await params;
  const todoId = Number(id);
  if (!Number.isInteger(todoId) || todoId <= 0) notFound();
  return <TodosPage id={String(todoId)} />;
}
