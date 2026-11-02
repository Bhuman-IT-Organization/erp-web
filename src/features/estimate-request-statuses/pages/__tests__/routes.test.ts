import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { EstimateRequestStatusesListPage } from '../EstimateRequestStatusesListPage';
import { EstimateRequestStatusFormPage } from '../EstimateRequestStatusFormPage';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('../EstimateRequestStatusesListPage', () => ({
  EstimateRequestStatusesListPage: () => null,
}));
vi.mock('../EstimateRequestStatusFormPage', () => ({ EstimateRequestStatusFormPage: () => null }));

describe('/setup/estimate_request-statuses', () => {
  it('renders the list page with the statuses title', async () => {
    const page = await import('../../../../../app/(shell)/setup/estimate_request-statuses/page');
    expect(page.default().type).toBe(EstimateRequestStatusesListPage);
    expect(await page.generateMetadata()).toEqual({
      title: 'estimate-request-statuses.statuses',
    });
  });

  it('/new opens an empty form', async () => {
    const page =
      await import('../../../../../app/(shell)/setup/estimate_request-statuses/new/page');
    expect(page.default().type).toBe(EstimateRequestStatusFormPage);
    expect(page.default().props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({
      title: 'estimate-request-statuses.new_status',
    });
  });

  it('[id] opens the normalized numeric status record', async () => {
    const page =
      await import('../../../../../app/(shell)/setup/estimate_request-statuses/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(EstimateRequestStatusFormPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({
      title: 'estimate-request-statuses.edit_status',
    });
  });

  it.each(NOT_IDS)('"%s" is not a status record route', async (id) => {
    const page =
      await import('../../../../../app/(shell)/setup/estimate_request-statuses/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
