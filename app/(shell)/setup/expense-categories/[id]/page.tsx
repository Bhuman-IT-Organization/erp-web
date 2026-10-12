import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ExpenseCategoriesPage } from '@/features/expense-categories/pages/ExpenseCategoriesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('expense-categories');
  return { title: t('edit_expense_category') };
}

// Request-time render: one record behind a session; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/setup/expense-categories/[id]'>) {
  const { id } = await props.params;
  const categoryId = Number(id);
  // The api takes a positive integer; anything else is not a category page (it would 400 there).
  if (!Number.isInteger(categoryId) || categoryId <= 0) notFound();
  return <ExpenseCategoriesPage id={String(categoryId)} />;
}
