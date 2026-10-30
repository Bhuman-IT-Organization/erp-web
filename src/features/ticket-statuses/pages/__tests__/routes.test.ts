import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { TicketStatusesListPage } from '../TicketStatusesListPage';
import { TicketStatusesPage } from '../TicketStatusesPage';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('../TicketStatusesListPage', () => ({ TicketStatusesListPage: () => null }));
vi.mock('../TicketStatusesPage', () => ({ TicketStatusesPage: () => null }));

describe('/setup/ticket-statuses', () => {
  it('the list, titled acs_ticket_statuses_submenu', async () => {
    const page = await import('../../../../../app/(shell)/setup/ticket-statuses/page');
    expect(page.default().type).toBe(TicketStatusesListPage);
    expect(await page.generateMetadata()).toEqual({
      title: 'ticket-statuses.acs_ticket_statuses_submenu',
    });
  });

  it('/new is the form with no id, titled new_ticket_status', async () => {
    const page = await import('../../../../../app/(shell)/setup/ticket-statuses/new/page');
    const element = page.default();
    expect(element.type).toBe(TicketStatusesPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({ title: 'ticket-statuses.new_ticket_status' });
  });

  it('[id]: a positive integer opens that status, titled ticket_status_edit', async () => {
    const page = await import('../../../../../app/(shell)/setup/ticket-statuses/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(TicketStatusesPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({ title: 'ticket-statuses.ticket_status_edit' });
  });

  it.each(NOT_IDS)('"%s" is not a ticket status page', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/ticket-statuses/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
