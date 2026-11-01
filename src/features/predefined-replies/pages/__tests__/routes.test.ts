import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { PredefinedRepliesListPage } from '../PredefinedRepliesListPage';
import { PredefinedRepliesPage } from '../PredefinedRepliesPage';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));

vi.mock('../PredefinedRepliesListPage', () => ({
  PredefinedRepliesListPage: () => null,
}));

vi.mock('../PredefinedRepliesPage', () => ({
  PredefinedRepliesPage: () => null,
}));

describe('/setup/predefined-replies', () => {
  it('renders the list page with the correct title', async () => {
    const page = await import('../../../../../app/(shell)/setup/predefined-replies/page');

    expect(page.default().type).toBe(PredefinedRepliesListPage);
    expect(await page.generateMetadata()).toEqual({
      title: 'predefined-replies.predefined_replies',
    });
  });

  it('renders the new reply form without an id and with the correct title', async () => {
    const page = await import('../../../../../app/(shell)/setup/predefined-replies/new/page');

    const element = page.default();

    expect(element.type).toBe(PredefinedRepliesPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({
      title: 'predefined-replies.new_predefined_reply',
    });
  });

  it('renders the edit form for a valid id with the correct title', async () => {
    const page = await import('../../../../../app/(shell)/setup/predefined-replies/[id]/page');

    const element = await page.default(routeProps({ id: '123' }));

    expect(element.type).toBe(PredefinedRepliesPage);
    expect(element.props).toEqual({ id: '123' });
    expect(await page.generateMetadata()).toEqual({
      title: 'predefined-replies.predefined_reply',
    });
  });

  it.each(NOT_IDS)('calls notFound for invalid id "%s"', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/predefined-replies/[id]/page');

    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
