import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { TaxesListPage } from '../TaxesListPage';
import { TaxesPage } from '../TaxesPage';

/**
 * The tax routes under Setup (plan 04.2-27): the list, a new tax, and one tax whose `[id]`
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
vi.mock('../TaxesListPage', () => ({ TaxesListPage: () => null }));
vi.mock('../TaxesPage', () => ({ TaxesPage: () => null }));

describe('/setup/taxes', () => {
  it('the list, titled taxes', async () => {
    const page = await import('../../../../../app/(shell)/setup/taxes/page');
    expect(page.default().type).toBe(TaxesListPage);
    expect(await page.generateMetadata()).toEqual({ title: 'taxes.taxes' });
  });

  it('/new is the form with no id, titled tax_add_title', async () => {
    const page = await import('../../../../../app/(shell)/setup/taxes/new/page');
    const element = page.default();
    expect(element.type).toBe(TaxesPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({ title: 'taxes.tax_add_title' });
  });

  it('[id]: a positive integer opens that tax, titled tax_edit_title', async () => {
    const page = await import('../../../../../app/(shell)/setup/taxes/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(TaxesPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({ title: 'taxes.tax_edit_title' });
  });

  it.each(NOT_IDS)('"%s" is not a tax page', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/taxes/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
