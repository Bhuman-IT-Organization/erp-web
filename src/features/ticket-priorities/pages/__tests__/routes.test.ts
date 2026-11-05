import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { TicketPrioritiesListPage } from '../TicketPrioritiesListPage';
import { TicketPrioritiesPage } from '../TicketPrioritiesPage';

/**
 * The ticket priority routes under Setup: the list, a new priority, and one priority whose `[id]`
 * takes a positive integer or is `notFound()`. The list is titled with Perfex's menu key
 * `shell.acs_ticket_priority_submenu`; the form pages with `ticket_priority_add` / `_edit`.
 */
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('../TicketPrioritiesListPage', () => ({ TicketPrioritiesListPage: () => null }));
vi.mock('../TicketPrioritiesPage', () => ({ TicketPrioritiesPage: () => null }));

describe('/setup/ticket-priorities', () => {
  it('the list, titled with the shell menu key', async () => {
    const page = await import('../../../../../app/(shell)/setup/ticket-priorities/page');
    expect(page.default().type).toBe(TicketPrioritiesListPage);
    expect(await page.generateMetadata()).toEqual({
      title: 'shell.acs_ticket_priority_submenu',
    });
  });

  it('/new is the form with no id, titled ticket_priority_add', async () => {
    const page = await import('../../../../../app/(shell)/setup/ticket-priorities/new/page');
    const element = page.default();
    expect(element.type).toBe(TicketPrioritiesPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({
      title: 'ticket-priorities.ticket_priority_add',
    });
  });

  it('[id]: awaits params (Next.js 16) and a positive integer opens that priority, titled ticket_priority_edit', async () => {
    const page = await import('../../../../../app/(shell)/setup/ticket-priorities/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(TicketPrioritiesPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({
      title: 'ticket-priorities.ticket_priority_edit',
    });
  });

  it.each(NOT_IDS)('"%s" is not a ticket priority page', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/ticket-priorities/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
