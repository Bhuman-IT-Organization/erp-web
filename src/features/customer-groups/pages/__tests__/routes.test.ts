import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { CustomerGroupsListPage } from '../CustomerGroupsListPage';
import { CustomerGroupsPage } from '../CustomerGroupsPage';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('../CustomerGroupsListPage', () => ({ CustomerGroupsListPage: () => null }));
vi.mock('../CustomerGroupsPage', () => ({ CustomerGroupsPage: () => null }));

describe('/setup/customer-groups', () => {
  it('renders the list and uses the Groups title', async () => {
    const page = await import('../../../../../app/(shell)/setup/customer-groups/page');
    expect(page.default().type).toBe(CustomerGroupsListPage);
    expect(await page.generateMetadata()).toEqual({ title: 'customer-groups.customer_groups' });
  });
  it('renders the new form with no id and the Perfex add heading', async () => {
    const page = await import('../../../../../app/(shell)/setup/customer-groups/new/page');
    const element = page.default();
    expect(element.type).toBe(CustomerGroupsPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({
      title: 'customer-groups.customer_group_add_heading',
    });
  });
  it('normalizes a positive integer edit id and uses the edit heading', async () => {
    const page = await import('../../../../../app/(shell)/setup/customer-groups/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(CustomerGroupsPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({
      title: 'customer-groups.customer_group_edit_heading',
    });
  });
  it.each(NOT_IDS)('rejects invalid id %s', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/customer-groups/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
