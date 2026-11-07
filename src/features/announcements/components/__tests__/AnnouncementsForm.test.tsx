// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VALIDATION_CODE } from '@/features/announcements/api/announcements.endpoints';
import type { Locale } from '@/i18n/locales';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import {
  physicalClassesIn,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';
import { AnnouncementsForm, GuardedAnnouncementsForm } from '../AnnouncementsForm';

const push = vi.fn();
const crumb = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/setup/announcements/new',
}));
vi.mock('@/lib/hooks/use-breadcrumb-label', () => ({
  useBreadcrumbLabel: (label: string | null | undefined) => {
    crumb(label);
  },
}));

const L = en.announcements;
const RECORD = {
  id: '7',
  name: 'Downtime',
  message: 'The system is down tonight.',
  dateAdded: '2026-10-31T09:00:00.000Z',
  showToUsers: true,
  showToStaff: false,
  showName: true,
  hasOtherFormatting: false,
};
const ME = {
  staffId: 1,
  email: 'a@b.invalid',
  firstName: 'A',
  lastName: 'B',
  isAdmin: true,
  roleId: null,
  permissions: [],
  locale: null,
};
interface Reply {
  status: number;
  body?: unknown;
}
let me: typeof ME = ME;
let read: Reply = { status: 200, body: RECORD };
let save: Reply = { status: 201, body: RECORD };
let requests: { method: string; url: string; data?: unknown }[] = [];
const problem = (status: number, code: string, issues?: unknown) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
  ...(issues === undefined ? {} : { issues }),
});
function answer(config: InternalAxiosRequestConfig, reply: Reply) {
  const response = {
    data: reply.body,
    status: reply.status,
    statusText: 'ok',
    headers: new AxiosHeaders(),
    config,
  };
  return reply.status < 300
    ? Promise.resolve(response)
    : Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}
function adapter(config: InternalAxiosRequestConfig) {
  const method = (config.method ?? 'get').toUpperCase();
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  requests.push({
    method,
    url: url.pathname,
    data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
  });
  if (url.pathname === '/api/v1/auth/me') return answer(config, { status: 200, body: me });
  return answer(config, method === 'GET' ? read : save);
}
const tree = (node: React.ReactElement) => (
  <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{node}</SWRConfig>
);
const show = (id: string | null, locale: Locale = 'en') =>
  renderWithProviders(tree(<AnnouncementsForm id={id} />), { hasMemory: true, locale });
const showGuarded = (id: string | null) =>
  renderWithProviders(tree(<GuardedAnnouncementsForm id={id} />), { hasMemory: true });
const nameBox = (label: string = L.announcement_name) =>
  screen.findByRole('textbox', { name: label });
const isOn = (el: HTMLElement): boolean =>
  el.getAttribute('aria-checked') === 'true' || (el as HTMLInputElement).checked;
const writes = () =>
  requests.filter((r) => r.method !== 'GET' && r.url.startsWith('/api/v1/announcements'));

/** Edits the loaded record's name, presses Save and confirms the summary; returns the dialog. */
async function sendEdit(): Promise<HTMLElement> {
  show('7');
  const box = await nameBox();
  await userEvent.clear(box);
  await userEvent.type(box, 'Maintenance');
  await userEvent.click(screen.getByRole('button', { name: /save announcement/i }));
  const dialog = await screen.findByTestId('confirm-dialog');
  await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
  return dialog;
}

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  me = ME;
  read = { status: 200, body: RECORD };
  save = { status: 201, body: RECORD };
  requests = [];
  push.mockClear();
  crumb.mockClear();
  http.defaults.adapter = adapter;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('AnnouncementsForm', () => {
  it('renders one required Name field and rejects blank input', async () => {
    show(null);
    const box = await nameBox();
    expect(box.getAttribute('aria-required')).toBe('true');
    await userEvent.type(box, '   ');
    await userEvent.click(screen.getByRole('button', { name: /create announcement/i }));
    expect((await screen.findByTestId('error-summary')).textContent).toContain(L.enter_name);
  });
  it('confirms and POSTs a trimmed name, then returns to the list', async () => {
    show(null);
    const box = await nameBox();
    await userEvent.type(box, '  Downtime  ');
    await userEvent.click(screen.getByRole('button', { name: /create announcement/i }));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(within(dialog).getByRole('heading').textContent).toContain('Downtime');
    await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/announcements', { scroll: false });
    });
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({
      method: 'POST',
      url: '/api/v1/announcements',
      data: { name: 'Downtime', showToUsers: false, showToStaff: true, showName: false },
    });
  });
  it('loads an edit record and PATCHes the changed name without replacing its message', async () => {
    show('7');
    expect(await screen.findByRole('heading', { name: 'Downtime' })).toBeTruthy();
    const box = await nameBox();
    await userEvent.clear(box);
    await userEvent.type(box, 'Maintenance');
    await userEvent.click(screen.getByRole('button', { name: /save announcement/i }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(push).toHaveBeenCalled();
    });
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({
      method: 'PATCH',
      url: '/api/v1/announcements/7',
      data: { name: 'Maintenance', showToUsers: true, showToStaff: false, showName: true },
    });
    expect(writes()[0]?.data).not.toHaveProperty('message');
  });

  it('sends the edited message when only its text changes', async () => {
    show('7');
    const message = await screen.findByRole('textbox', { name: L.announcement_message });
    await userEvent.clear(message);
    await userEvent.type(message, 'Back at noon.');
    await userEvent.click(screen.getByRole('button', { name: /save announcement/i }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(writes()).toHaveLength(1);
    });
    expect(writes()[0]).toMatchObject({
      method: 'PATCH',
      url: '/api/v1/announcements/7',
      data: { name: 'Downtime', message: 'Back at noon.' },
    });
  });

  it('warns only when the stored message has Perfex formatting', async () => {
    read = { status: 200, body: { ...RECORD, hasOtherFormatting: true } };
    show('7');
    expect(await screen.findByText(L.announcement_formatting_warning)).toBeTruthy();
    cleanup();
    read = { status: 200, body: RECORD };
    show('7');
    await screen.findByRole('textbox', { name: L.announcement_message });
    expect(screen.queryByText(L.announcement_formatting_warning)).toBeNull();
  });

  it('keeps a 404 save refusal in the confirmation dialog', async () => {
    save = { status: 404, body: problem(404, 'ERP-CORE-0004') };
    const dialog = await sendEdit();
    expect((await within(dialog).findByTestId('confirm-dialog-error')).textContent).toContain(
      'no longer exists',
    );
  });

  it('shows the message field and the three switches, with Show to staff ticked on /new', async () => {
    show(null);
    await nameBox();
    expect(await screen.findByRole('textbox', { name: L.announcement_message })).toBeTruthy();
    expect(isOn(screen.getByRole('checkbox', { name: L.show_to_staff }))).toBe(true);
    expect(screen.getByRole('checkbox', { name: L.show_to_users })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: L.show_name })).toBeTruthy();
  });
  it('names each change in the save summary', async () => {
    show('7');
    const box = await nameBox();
    await userEvent.clear(box);
    await userEvent.type(box, 'Maintenance');
    const message = await screen.findByRole('textbox', { name: L.announcement_message });
    await userEvent.clear(message);
    await userEvent.type(message, 'Back at noon.');
    await userEvent.click(screen.getByRole('checkbox', { name: L.show_to_users }));
    await userEvent.click(screen.getByRole('checkbox', { name: L.show_to_staff }));
    await userEvent.click(screen.getByRole('checkbox', { name: L.show_name }));
    await userEvent.click(screen.getByRole('button', { name: /save announcement/i }));
    const dialog = await screen.findByTestId('confirm-dialog');
    const text = dialog.textContent.replace(/\s+/g, ' ');
    expect(text).toContain(L.announcement_name);
    expect(text).toContain(`${L.show_to_users}: ${L.settings_yes} \u2192 ${L.settings_no}`);
    expect(text).toContain(`${L.show_to_staff}: ${L.settings_no} \u2192 ${L.settings_yes}`);
    expect(text).toContain(`${L.show_name}: ${L.settings_yes} \u2192 ${L.settings_no}`);
    expect(text).not.toMatch(/\b(true|false)\b/);
    // The message line says only that it changed: neither the old nor the new text is printed.
    expect(text).toContain(L.announcement_message);
    expect(text).not.toContain(RECORD.message);
    expect(text).not.toContain('Back at noon.');
  });

  it('reads Yes and No from the Arabic messages in the save summary', async () => {
    const A = ar.announcements;
    show('7', 'ar');
    await userEvent.click(await screen.findByRole('checkbox', { name: A.show_to_users }));
    // Under Arabic the button reads "Save <noun>" with the Arabic noun, so match its start only.
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    const dialog = await screen.findByTestId('confirm-dialog');
    const text = dialog.textContent.replace(/\s+/g, ' ');
    expect(text).toContain(`${A.show_to_users}: ${A.settings_yes} \u2190 ${A.settings_no}`);
    // The summary reads the Arabic words: never the English ones, never the raw booleans.
    expect(A.settings_yes).not.toBe('Yes');
    expect(A.settings_no).not.toBe('No');
    expect(text).not.toContain('Yes');
    expect(text).not.toMatch(/\b(true|false)\b/);
  });

  it('puts a 400 field problem under the field and leaves the form open', async () => {
    save = {
      status: 400,
      body: problem(400, VALIDATION_CODE, [{ path: ['name'], code: 'too_big', message: 'x' }]),
    };
    await sendEdit();
    expect(await screen.findByTestId('error-summary')).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
  it('keeps a 403 refusal inside the dialog, in plain words and without the code', async () => {
    save = { status: 403, body: problem(403, 'ERP-AUTH-0005') };
    const dialog = await sendEdit();
    const error = await within(dialog).findByTestId('confirm-dialog-error');
    expect(error.textContent.length).toBeGreaterThan(0);
    expect(error.textContent).not.toContain('ERP-AUTH-0005');
    expect(push).not.toHaveBeenCalled();
  });
  it('shows a 503 as the form alert, and Retry sends the same values again', async () => {
    save = { status: 503, body: problem(503, 'ERP-UPSTREAM-0001') };
    await sendEdit();
    const retry = await screen.findByRole('button', { name: /retry/i });
    expect(writes()).toHaveLength(1);
    save = { status: 200, body: RECORD };
    await userEvent.click(retry);
    await waitFor(() => {
      expect(push).toHaveBeenCalled();
    });
    expect(writes()).toHaveLength(2);
  });

  it('asks before discarding unsaved changes', async () => {
    show('7');
    const box = await nameBox();
    await userEvent.type(box, ' more');
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(push).toHaveBeenCalled();
    });
    expect(push).toHaveBeenCalledWith('/setup/announcements');
    expect(push).toHaveBeenCalledTimes(1);
  });
  it('puts a 400 message problem under the message field and leaves the form open', async () => {
    save = {
      status: 400,
      body: problem(400, VALIDATION_CODE, [{ path: ['message'], code: 'too_big', message: 'x' }]),
    };

    await sendEdit();

    const message = screen.getByRole('textbox', {
      name: L.announcement_message,
    });

    expect(message.getAttribute('aria-invalid')).toBe('true');
    expect(message.getAttribute('aria-describedby')).toContain('error');
    expect(screen.getByTestId('error-summary').textContent).toContain(L.announcement_message);
    expect(push).not.toHaveBeenCalled();
  });
  it('shows why a record that is gone cannot be edited, and no form', async () => {
    read = { status: 404, body: problem(404, 'ERP-CORE-0004') };
    show('7');
    expect(await screen.findByText(/no longer exists/i)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: L.announcement_name })).toBeNull();
    await waitFor(() => {
      expect(crumb).toHaveBeenLastCalledWith(null);
    });
  });

  it('gives the shell no record crumb on /new and the name on an edit', async () => {
    show(null);
    await nameBox();
    expect(crumb).toHaveBeenLastCalledWith(undefined);
    cleanup();
    show('7');
    expect(await screen.findByRole('heading', { name: 'Downtime' })).toBeTruthy();
    await waitFor(() => {
      expect(crumb).toHaveBeenLastCalledWith('Downtime');
    });
  });

  it('opens the form for an administrator behind the guards', async () => {
    showGuarded(null);
    expect(await nameBox()).toBeTruthy();
  });
  it('shows a non-administrator no form and asks the api for nothing', async () => {
    me = { ...ME, isAdmin: false };
    showGuarded(null);
    await waitFor(() => {
      expect(requests.map((r) => r.url)).toContain('/api/v1/auth/me');
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByRole('textbox', { name: L.announcement_name })).toBeNull();
    expect(requests.filter((r) => r.url.startsWith('/api/v1/announcements'))).toEqual([]);
  });

  it('renders in Arabic with the Arabic labels and no physical-direction classes', async () => {
    show(null, 'ar');
    expect(await nameBox(ar.announcements.announcement_name)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: ar.announcements.show_to_staff })).toBeTruthy();
    expect(physicalClassesIn(document.body)).toEqual([]);
  });
});
