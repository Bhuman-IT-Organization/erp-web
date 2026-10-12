import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { CurrenciesListPage } from '../CurrenciesListPage';
import { CurrenciesPage } from '../CurrenciesPage';

/**
 * The currency routes under Setup (plan 04.2-27): the list, a new currency, and one currency whose `[id]`
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
vi.mock('../CurrenciesListPage', () => ({ CurrenciesListPage: () => null }));
vi.mock('../CurrenciesPage', () => ({ CurrenciesPage: () => null }));

describe('/setup/currencies', () => {
  it('the list, titled currencies', async () => {
    const page = await import('../../../../../app/(shell)/setup/currencies/page');
    expect(page.default().type).toBe(CurrenciesListPage);
    expect(await page.generateMetadata()).toEqual({ title: 'currencies.currencies' });
  });

  it('/new is the form with no id, titled currency_add_heading', async () => {
    const page = await import('../../../../../app/(shell)/setup/currencies/new/page');
    const element = page.default();
    expect(element.type).toBe(CurrenciesPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({ title: 'currencies.currency_add_heading' });
  });

  it('[id]: a positive integer opens that currency, titled currency_edit_heading', async () => {
    const page = await import('../../../../../app/(shell)/setup/currencies/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(CurrenciesPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({ title: 'currencies.currency_edit_heading' });
  });

  it.each(NOT_IDS)('"%s" is not a currency page', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/currencies/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
