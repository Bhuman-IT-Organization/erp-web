import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { LeadSourcesListPage } from '../LeadSourcesListPage';
import { LeadSourcesPage } from '../LeadSourcesPage';

/**
 * The lead source routes under Setup (plan 04.2-27): the list, a new lead source, and one lead source whose `[id]`
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
vi.mock('../LeadSourcesListPage', () => ({ LeadSourcesListPage: () => null }));
vi.mock('../LeadSourcesPage', () => ({ LeadSourcesPage: () => null }));

describe('/setup/lead-sources', () => {
  it('the list, titled lead_sources', async () => {
    const page = await import('../../../../../app/(shell)/setup/lead-sources/page');
    expect(page.default().type).toBe(LeadSourcesListPage);
    expect(await page.generateMetadata()).toEqual({ title: 'lead-sources.lead_sources' });
  });

  it('/new is the form with no id, titled lead_new_source', async () => {
    const page = await import('../../../../../app/(shell)/setup/lead-sources/new/page');
    const element = page.default();
    expect(element.type).toBe(LeadSourcesPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({ title: 'lead-sources.lead_new_source' });
  });

  it('[id]: a positive integer opens that lead source, titled edit_source', async () => {
    const page = await import('../../../../../app/(shell)/setup/lead-sources/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(LeadSourcesPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({ title: 'lead-sources.edit_source' });
  });

  it.each(NOT_IDS)('"%s" is not a lead source page', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/lead-sources/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
