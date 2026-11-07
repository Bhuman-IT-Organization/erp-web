import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { AnnouncementsListPage } from '../AnnouncementsListPage';
import { AnnouncementsPage } from '../AnnouncementsPage';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('../AnnouncementsListPage', () => ({ AnnouncementsListPage: () => null }));
vi.mock('../AnnouncementsPage', () => ({ AnnouncementsPage: () => null }));

describe('/setup/announcements', () => {
  it('renders the list and uses the Announcements title', async () => {
    const page = await import('../../../../../app/(shell)/setup/announcements/page');
    expect(page.default().type).toBe(AnnouncementsListPage);
    expect(await page.generateMetadata()).toEqual({ title: 'announcements.announcements' });
  });
  it('renders the new form with no id and the Perfex add heading', async () => {
    const page = await import('../../../../../app/(shell)/setup/announcements/new/page');
    const element = page.default();
    expect(element.type).toBe(AnnouncementsPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({
      title: 'announcements.announcement_add_heading',
    });
  });
  it('normalizes a positive integer edit id and uses the edit heading', async () => {
    const page = await import('../../../../../app/(shell)/setup/announcements/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(AnnouncementsPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({
      title: 'announcements.announcement_edit_heading',
    });
  });
  it.each(NOT_IDS)('rejects invalid id %s', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/announcements/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
