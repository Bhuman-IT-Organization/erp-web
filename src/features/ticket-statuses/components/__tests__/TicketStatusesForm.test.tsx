// @vitest-environment happy-dom
import { cleanup, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { TicketStatusesForm } from '../TicketStatusesForm';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => '/setup/ticket-statuses/new',
}));

const VALUES = { name: 'Waiting', statuscolor: '', statusorder: null };
const STATUS = { ticketstatusid: '13', ...VALUES, ticket_count: 0, isdefault: 0 };

function show() {
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <TicketStatusesForm id={null} />
    </SWRConfig>,
  );
}

function showEdit() {
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <TicketStatusesForm id="13" />
    </SWRConfig>,
  );
}

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  navigation.push.mockReset();
});

afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('TicketStatusesForm', () => {
  it('validates the name before opening confirmation or sending a mutation', async () => {
    const writes = fakeAdapter(201, STATUS);
    http.defaults.adapter = writes.adapter;
    show();
    const name = screen.getByRole('textbox', { name: 'Ticket Status Name' });
    await userEvent.type(name, 'x'.repeat(51));
    await userEvent.click(screen.getByRole('button', { name: 'Create ticket status' }));
    expect(await screen.findByTestId('error-summary')).toBeTruthy();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(writes.calls).toEqual([]);
  });

  it('confirms a valid create, sends only form fields, and navigates back on success', async () => {
    const writes = fakeAdapter(201, STATUS);
    http.defaults.adapter = writes.adapter;
    show();
    await userEvent.type(screen.getByRole('textbox', { name: 'Ticket Status Name' }), 'Waiting');
    await userEvent.click(screen.getByRole('button', { name: 'Create ticket status' }));

    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create ticket status' }));

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith('/setup/ticket-statuses', { scroll: false });
    });
    expect(writes.calls.map(({ method, url, data }) => [method, url, data])).toEqual([
      ['POST', '/api/v1/ticket-statuses', VALUES],
    ]);
  });

  it('loads an existing status and confirms updates through its detail endpoint', async () => {
    const writes = fakeAdapter(200, STATUS);
    http.defaults.adapter = writes.adapter;
    showEdit();
    const name = await screen.findByRole('textbox', { name: 'Ticket Status Name' });
    await waitFor(() => {
      expect((name as HTMLInputElement).value).toBe('Waiting');
    });
    await userEvent.clear(name);
    await userEvent.type(name, 'In progress');
    await userEvent.click(screen.getByRole('button', { name: 'Save ticket status' }));

    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save ticket status' }));

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith('/setup/ticket-statuses', { scroll: false });
    });
    expect(writes.calls.map(({ method, url, data }) => [method, url, data])).toEqual([
      ['GET', '/api/v1/ticket-statuses/13', undefined],
      ['PATCH', '/api/v1/ticket-statuses/13', { ...VALUES, name: 'In progress' }],
    ]);
  });
});
