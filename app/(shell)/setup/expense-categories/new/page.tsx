import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ExpenseCategoriesPage } from '@/features/expense-categories/pages/ExpenseCategoriesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('expense-categories');
  return { title: t('new_expense_category') };
}

// Request-time render: the form is behind a session, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <ExpenseCategoriesPage id={null} />;
}
