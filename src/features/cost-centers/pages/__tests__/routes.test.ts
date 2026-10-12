import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { CostCentersListPage } from '../CostCentersListPage';
import { CostCentersPage } from '../CostCentersPage';

/**
 * The cost center routes under Setup (plan 04.2-27): the list, a new cost center, and one cost center whose `[id]`
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
vi.mock('../CostCentersListPage', () => ({ CostCentersListPage: () => null }));
vi.mock('../CostCentersPage', () => ({ CostCentersPage: () => null }));

describe('/setup/cost-centers', () => {
  it('the list, titled cost_centers', async () => {
    const page = await import('../../../../../app/(shell)/setup/cost-centers/page');
    expect(page.default().type).toBe(CostCentersListPage);
    expect(await page.generateMetadata()).toEqual({ title: 'cost-centers.cost_centers' });
  });

  it('/new is the form with no id, titled add_cost_center', async () => {
    const page = await import('../../../../../app/(shell)/setup/cost-centers/new/page');
    const element = page.default();
    expect(element.type).toBe(CostCentersPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({ title: 'cost-centers.add_cost_center' });
  });

  it('[id]: a positive integer opens that cost center, titled edit_cost_center', async () => {
    const page = await import('../../../../../app/(shell)/setup/cost-centers/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(CostCentersPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({ title: 'cost-centers.edit_cost_center' });
  });

  it.each(NOT_IDS)('"%s" is not a cost center page', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/cost-centers/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
