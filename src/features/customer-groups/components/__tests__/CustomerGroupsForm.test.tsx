// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test/render';
import { CustomerGroupsForm } from '../CustomerGroupsForm';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/setup/customer-groups/new',
}));
const RECORD = { id: 'a1', name: 'Retail' };
let save: { status: number; body?: unknown } = { status: 201, body: RECORD };
const problem = (status: number, code: string, issues?: unknown) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
  ...(issues === undefined ? {} : { issues }),
});
function adapter(config: InternalAxiosRequestConfig) {
  const method = (config.method ?? 'get').toUpperCase();
  const response = {
    data: method === 'GET' ? RECORD : save.body,
    status: method === 'GET' ? 200 : save.status,
    statusText: 'ok',
    headers: new AxiosHeaders(),
    config,
  };
  return response.status < 300
    ? Promise.resolve(response)
    : Promise.reject(
        new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, {
          ...response,
          data: save.body,
        }),
      );
}
const show = (id: string | null) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <CustomerGroupsForm id={id} />
    </SWRConfig>,
    { hasMemory: true },
  );
const nameBox = () => screen.findByRole('textbox', { name: 'Name' });
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  save = { status: 201, body: RECORD };
  push.mockClear();
  http.defaults.adapter = adapter;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('CustomerGroupsForm', () => {
  it('renders one required Name field and rejects blank input', async () => {
    show(null);
    const box = await nameBox();
    expect(box.getAttribute('aria-required')).toBe('true');
    await userEvent.type(box, '   ');
    await userEvent.click(screen.getByRole('button', { name: /create customer group/i }));
    expect((await screen.findByTestId('error-summary')).textContent).toContain(
      'Enter the customer group name.',
    );
  });
  it('confirms and POSTs a trimmed name, then returns to the list', async () => {
    show(null);
    const box = await nameBox();
    await userEvent.type(box, '  Retail  ');
    await userEvent.click(screen.getByRole('button', { name: /create customer group/i }));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(within(dialog).getByRole('heading').textContent).toContain('Retail');
    await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/customer-groups', { scroll: false });
    });
  });
  it('loads an edit record and PATCHes the changed name', async () => {
    show('a1');
    expect(await screen.findByRole('heading', { name: 'Retail' })).toBeTruthy();
    const box = await nameBox();
    await userEvent.clear(box);
    await userEvent.type(box, 'Wholesale');
    await userEvent.click(screen.getByRole('button', { name: /save customer group/i }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(push).toHaveBeenCalled();
    });
  });
  it('keeps a 404 save refusal in the confirmation dialog', async () => {
    save = { status: 404, body: problem(404, 'ERP-CORE-0004') };
    show('a1');
    const box = await nameBox();
    await userEvent.clear(box);
    await userEvent.type(box, 'Wholesale');
    await userEvent.click(screen.getByRole('button', { name: /save customer group/i }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    expect((await screen.findByTestId('confirm-dialog-error')).textContent).toContain(
      'no longer exists',
    );
  });
});
