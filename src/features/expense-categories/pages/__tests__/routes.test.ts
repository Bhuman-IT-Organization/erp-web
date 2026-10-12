import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { ExpenseCategoriesListPage } from '../ExpenseCategoriesListPage';
import { ExpenseCategoriesPage } from '../ExpenseCategoriesPage';

/**
 * The expense category routes under Setup (plan 04.2-27): the list, a new expense category, and one expense category whose `[id]`
 * takes a positive integer or is `notFound()` (T-4.2-60); each title is Perfex's key.
 */
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('../ExpenseCategoriesListPage', () => ({ ExpenseCategoriesListPage: () => null }));
vi.mock('../ExpenseCategoriesPage', () => ({ ExpenseCategoriesPage: () => null }));

describe('/setup/expense-categories', () => {
  it('the list, titled expense_categories', async () => {
    const page = await import('../../../../../app/(shell)/setup/expense-categories/page');
    expect(page.default().type).toBe(ExpenseCategoriesListPage);
    expect(await page.generateMetadata()).toEqual({
      title: 'expense-categories.expense_categories',
    });
  });

  it('/new is the form with no id, titled new_expense_category', async () => {
    const page = await import('../../../../../app/(shell)/setup/expense-categories/new/page');
    const element = page.default();
    expect(element.type).toBe(ExpenseCategoriesPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({
      title: 'expense-categories.new_expense_category',
    });
  });

  it('[id]: a positive integer opens that expense category, titled edit_expense_category', async () => {
    const page = await import('../../../../../app/(shell)/setup/expense-categories/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(ExpenseCategoriesPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({
      title: 'expense-categories.edit_expense_category',
    });
  });

  it.each(NOT_IDS)('"%s" is not a expense category page', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/expense-categories/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
