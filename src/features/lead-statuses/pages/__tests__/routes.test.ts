import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { LeadStatusesListPage, LeadStatusesPage } from '@/features/lead-statuses';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));

vi.mock('@/features/lead-statuses', () => ({
  LeadStatusesListPage: () => null,
  LeadStatusesPage: () => null,
}));

describe('/setup/lead-statuses', () => {
  it('renders the list page and its title', async () => {
    const page = await import('../../../../../app/(shell)/setup/lead-statuses/page');

    expect(page.default().type).toBe(LeadStatusesListPage);
    expect(await page.generateMetadata()).toEqual({
      title: 'lead-statuses.lead_statuses',
    });
  });

  it('renders the new-status form with no id', async () => {
    const page = await import('../../../../../app/(shell)/setup/lead-statuses/new/page');
    const element = page.default();

    expect(element.type).toBe(LeadStatusesPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({
      title: 'lead-statuses.lead_new_status',
    });
  });

  it('opens a status for a positive integer id', async () => {
    const page = await import('../../../../../app/(shell)/setup/lead-statuses/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));

    expect(element.type).toBe(LeadStatusesPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({
      title: 'lead-statuses.lead_statuses',
    });
  });

  it.each(NOT_IDS)('rejects invalid status id "%s"', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/lead-statuses/[id]/page');

    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
