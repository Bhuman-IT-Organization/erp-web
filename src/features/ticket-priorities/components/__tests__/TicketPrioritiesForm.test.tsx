// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ticketPrioritiesHooks } from '@/features/ticket-priorities/api/ticket-priorities.endpoints';
import type { TicketPriorities } from '@/features/ticket-priorities/schemas/ticket-priorities.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { seedRow } from '@/lib/api/row-seed';
import { clearSession, setSession } from '@/lib/auth/session';
import { BreadcrumbLabelContext } from '@/lib/hooks/use-breadcrumb-label';
import commonEn from '@/messages/common/en.json';
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
import { GuardedTicketPrioritiesForm, TicketPrioritiesForm } from '../TicketPrioritiesForm';

/**
 * The form on `SchemaForm`: the verb + noun labels, the save summary, where a failure shows, the
 * return to the list with no list request after an edit, the discard question, the name rules that
 * match Perfex (required, trimmed, at most 50, any character) and the guard. The transport is a
 * fake axios adapter on the shared instance.
 */
const EN = en['ticket-priorities'];
const AR = ar['ticket-priorities'];
const COMMON = commonEn.common;
const HTTP_OK = 200;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/ticket-priorities';
const RECORD = '/api/v1/ticket-priorities/a1';

const push = vi.fn<(href: string) => void>();
const pathname = vi.hoisted(() => ({ value: '/setup/ticket-priorities/new' }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const URGENT: TicketPriorities = { id: 'a1', name: 'Urgent' };
const me = (isAdmin: boolean) => ({
  staffId: 1,
  email: 'someone@example.invalid',
  firstName: 'Some',
  lastName: 'One',
  isAdmin,
  roleId: null,
  permissions: [],
  locale: null,
});
const problem = (status: number, code: string, issues?: unknown) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
  ...(issues === undefined ? {} : { issues }),
});

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';
let api: { me: Reply; record: Reply; save: Reply };
let requests: { readonly method: string; readonly path: string; readonly body: unknown }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
  const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  requests.push({ method, path: url.pathname, body });
  const reply =
    url.pathname === '/api/v1/auth/me'
      ? api.me
      : method !== 'GET'
        ? api.save
        : url.pathname === LIST
          ? { status: HTTP_OK, body: { data: [URGENT], meta: { nextCursor: null } } }
          : api.record;
  if (reply === 'pending') return new Promise<never>(() => undefined);
  const response = {
    data: reply.body,
    status: reply.status,
    statusText: String(reply.status),
    headers: new AxiosHeaders(),
    config,
  };
  if (reply.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

const saves = () => requests.filter((r) => r.method === 'POST' || r.method === 'PATCH');
const listReads = () => requests.filter((r) => r.method === 'GET' && r.path === LIST);

/** A list page mounted beside the form, as the list screen reads it (renders with `GLOBAL`). */
function ListProbe({ q }: { readonly q: string }): ReactElement {
  const { data } = ticketPrioritiesHooks.useList({ q, limit: 25 });
  return <output data-testid="list-probe">{data?.data.map((row) => row.name).join(',')}</output>;
}

const noun = EN.ticket_priority_lowercase;
const CREATE = COMMON.create_noun.replace('{noun}', noun);
const CREATING = COMMON.creating_noun.replace('{noun}', noun);
const SAVE = COMMON.save_noun.replace('{noun}', noun);

const ISOLATED = { provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 };
const GLOBAL = { shouldRetryOnError: false, dedupingInterval: 0 };

function show(ui: ReactElement, locale?: 'ar', swr: typeof GLOBAL = ISOLATED) {
  return renderWithProviders(<SWRConfig value={swr}>{ui}</SWRConfig>, {
    hasMemory: true,
    ...(locale === undefined ? {} : { locale }),
  });
}

const nameBox = () => screen.findByRole('textbox', { name: EN.ticket_priority_add_edit_name });
/** Types a name, as a member does, and asks to save. */
async function typeAndSubmit(value: string, submit = CREATE) {
  const user = userEvent.setup();
  const box = await nameBox();
  await user.clear(box);
  await user.click(box);
  await user.paste(value);
  await user.click(screen.getByRole('button', { name: submit }));
  return user;
}
async function confirmSave(user: ReturnType<typeof userEvent.setup>) {
  const open = await screen.findByTestId('confirm-dialog');
  await user.click(within(open).getByTestId('confirm-dialog-confirm'));
}
const closed = () =>
  waitFor(() => {
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  api = {
    me: { status: HTTP_OK, body: me(true) },
    record: { status: HTTP_OK, body: URGENT },
    save: { status: HTTP_OK, body: { ...URGENT, name: 'Critical' } },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  pathname.value = '/setup/ticket-priorities/new';
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('TicketPrioritiesForm: /new', () => {
  it('is titled with ticket_priority_add, one required field "Priority Name" in one Details section', async () => {
    show(<TicketPrioritiesForm id={null} />);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      EN.ticket_priority_add,
    );
    const name = await nameBox();
    expect(name).toHaveProperty('value', '');
    expect(name.getAttribute('aria-required')).toBe('true');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(EN.section_details);
  });

  it('refuses a blank name on the client: the field error, the focused summary, no request', async () => {
    show(<TicketPrioritiesForm id={null} />);
    await nameBox();
    await typeAndSubmit('   ');
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.ticket_priority_add_edit_name}: ${EN.enter_name}`);
    await waitFor(() => {
      expect(document.activeElement).toBe(summary);
    });
    expect(saves()).toEqual([]);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('asks first, "Create ticket priority Urgent?", then sends one POST, revalidates the list pages and returns to the list URL it came from', async () => {
    sessionStorage.setItem(
      'erp.list.return:/setup/ticket-priorities',
      JSON.stringify({ url: '/setup/ticket-priorities?q=ur' }),
    );
    api.save = { status: HTTP_OK, body: URGENT };
    show(
      <>
        <ListProbe q="create-probe" />
        <TicketPrioritiesForm id={null} />
      </>,
      undefined,
      GLOBAL,
    );
    await screen.findByText('Urgent', { selector: 'output' });
    const user = await typeAndSubmit('Urgent');
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByRole('heading').textContent).toBe(
      COMMON.create_summary_title.replace('{noun}', noun).replace('{name}', 'Urgent'),
    );
    expect(saves()).toEqual([]);
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/ticket-priorities?q=ur', { scroll: false });
    });
    expect(saves()).toEqual([{ method: 'POST', path: LIST, body: { name: 'Urgent' } }]);
    expect(listReads()).toHaveLength(2);
  });

  it('Pending: once confirmed, the submit reads "Creating ticket priority…" and is disabled', async () => {
    api.save = 'pending';
    show(<TicketPrioritiesForm id={null} />);
    const user = await typeAndSubmit('Urgent');
    await confirmSave(user);
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: CREATING }).every((b) => b.hasAttribute('disabled')),
      ).toBe(true);
    });
  });
});

describe('TicketPrioritiesForm: the name rules match Perfex (required, trimmed, at most 50)', () => {
  it('an Arabic name is accepted and sent as typed (the old Latin-only rule is gone)', async () => {
    api.save = { status: HTTP_OK, body: { id: 'a2', name: 'عاجل' } };
    show(<TicketPrioritiesForm id={null} />);
    const user = await typeAndSubmit('عاجل');
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([{ method: 'POST', path: LIST, body: { name: 'عاجل' } }]);
    });
  });

  it('a one-character name and punctuation are accepted: Perfex has no minimum and no character rule', async () => {
    api.save = { status: HTTP_OK, body: { id: 'a3', name: 'P1!' } };
    show(<TicketPrioritiesForm id={null} />);
    const user = await typeAndSubmit('P1!');
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([{ method: 'POST', path: LIST, body: { name: 'P1!' } }]);
    });
  });

  it('the name is trimmed before it is sent: "  Urgent  " sends "Urgent"', async () => {
    api.save = { status: HTTP_OK, body: URGENT };
    show(<TicketPrioritiesForm id={null} />);
    const user = await typeAndSubmit('  Urgent  ');
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([{ method: 'POST', path: LIST, body: { name: 'Urgent' } }]);
    });
  });

  it('51 characters are refused on the client with name_too_long (max 50), and nothing is sent', async () => {
    show(<TicketPrioritiesForm id={null} />);
    await nameBox();
    await typeAndSubmit('x'.repeat(51));
    const expected = EN.name_too_long.replace('{max}', '50');
    expect((await screen.findAllByText(expected)).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(saves()).toEqual([]);
  });

  it('exactly 50 characters are accepted', async () => {
    api.save = { status: HTTP_OK, body: { id: 'a4', name: 'x'.repeat(50) } };
    show(<TicketPrioritiesForm id={null} />);
    await nameBox();
    await typeAndSubmit('x'.repeat(50));
    expect(await screen.findByTestId('confirm-dialog')).toBeTruthy();
  });

  it('a name another priority already holds is saved, as in Perfex: one POST, back to the list', async () => {
    api.save = { status: HTTP_OK, body: { ...URGENT, id: 'a9' } };
    show(<TicketPrioritiesForm id={null} />);
    const user = await typeAndSubmit('Urgent');
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/ticket-priorities', { scroll: false });
    });
    expect(saves()).toHaveLength(1);
  });

  it('a record whose name holds markup is shown as text in the title and the field', async () => {
    pathname.value = '/setup/ticket-priorities/a1';
    api.record = { status: HTTP_OK, body: { ...URGENT, name: '<b>x</b>' } };
    show(<TicketPrioritiesForm id="a1" />);
    expect(await screen.findByRole('heading', { level: 1, name: '<b>x</b>' })).toBeTruthy();
    expect(await nameBox()).toHaveProperty('value', '<b>x</b>');
    expect(document.querySelector('b')).toBeNull();
  });
});

describe('TicketPrioritiesForm: when a save fails', () => {
  it('FieldErrors: a 400 with a name issue closes the dialog, shows the key under the field and in the focused summary, never the api text', async () => {
    api.save = {
      status: BAD_REQUEST,
      body: problem(BAD_REQUEST, 'ERP-VALIDATION-0001', [
        { path: ['name'], message: 'raw server text' },
      ]),
    };
    show(<TicketPrioritiesForm id={null} />);
    const user = await typeAndSubmit('Urgent');
    await confirmSave(user);
    await closed();
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.ticket_priority_add_edit_name}: ${EN.enter_name}`);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(document.activeElement).toBe(summary);
    expect(document.body.textContent).not.toContain('raw server text');
    expect(push).not.toHaveBeenCalled();
  });

  it('ServerError: a 503 closes the dialog, the alert keeps the edits and offers Retry, which re-sends without asking again', async () => {
    api.save = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<TicketPrioritiesForm id={null} />);
    const user = await typeAndSubmit('Urgent');
    await confirmSave(user);
    await closed();
    const alert = await screen.findByTestId('form-server-error');
    expect(alert.textContent).toContain(COMMON.save_failed);
    expect(alert.textContent).not.toMatch(/ERP-|503/);
    expect(await nameBox()).toHaveProperty('value', 'Urgent');
    api.save = { status: HTTP_OK, body: URGENT };
    await user.click(within(alert).getByRole('button', { name: COMMON.retry }));
    await waitFor(() => {
      expect(saves()).toHaveLength(2);
    });
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/ticket-priorities', { scroll: false });
    });
  });
});

describe('TicketPrioritiesForm: edit', () => {
  it('opened from the list: shows the record, names the change in the summary, sends one PATCH, and the list on screen shows the saved row with no list request', async () => {
    pathname.value = '/setup/ticket-priorities/a1';
    seedRow(RECORD, URGENT);
    show(
      <>
        <ListProbe q="edit-probe" />
        <TicketPrioritiesForm id="a1" />
      </>,
      undefined,
      GLOBAL,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Urgent' })).toBeTruthy();
    await screen.findByText('Urgent', { selector: 'output' });
    const user = await typeAndSubmit('Critical', SAVE);
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByTestId('confirm-dialog-changes').textContent).toBe(
      COMMON.change_from_to
        .replace('{label}', EN.ticket_priority_add_edit_name)
        .replace('{from}', 'Urgent')
        .replace('{to}', 'Critical'),
    );
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/ticket-priorities', { scroll: false });
    });
    expect(saves()).toEqual([{ method: 'PATCH', path: RECORD, body: { name: 'Critical' } }]);
    expect(screen.getByTestId('list-probe').textContent).toBe('Critical');
    expect(listReads()).toHaveLength(1);
  });

  it('a save answered 404 ERP-CORE-0004 (deleted meanwhile) stays inside the summary dialog in the feature words, confirm disabled, edits kept', async () => {
    pathname.value = '/setup/ticket-priorities/a1';
    api.save = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    show(<TicketPrioritiesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Urgent' });
    const user = await typeAndSubmit('Critical', SAVE);
    await confirmSave(user);
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors['ERP-CORE-0004']);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByRole('textbox', { name: EN.ticket_priority_add_edit_name, hidden: true }),
    ).toHaveProperty('value', 'Critical');
  });

  it('a dirty form asks "Discard changes?" before Back to list leaves', async () => {
    pathname.value = '/setup/ticket-priorities/a1';
    show(<TicketPrioritiesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Urgent' });
    const user = userEvent.setup();
    await user.type(await nameBox(), ' 2');
    await user.click(screen.getByRole('button', { name: COMMON.back_to_list }));
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByRole('heading').textContent).toBe(COMMON.discard_title);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('TicketPrioritiesForm: a record that is not there', () => {
  const backLink = () => screen.getByRole('link', { name: COMMON.back_to_list });

  it('a permalink answered 404 ERP-CORE-0004 says so in plain words with no Retry, and Back to list to the recorded list URL', async () => {
    sessionStorage.setItem(
      'erp.list.return:/setup/ticket-priorities',
      JSON.stringify({ url: '/setup/ticket-priorities?q=ur' }),
    );
    pathname.value = '/setup/ticket-priorities/gone';
    api.record = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    show(<TicketPrioritiesForm id="gone" />);
    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain(EN.errors['ERP-CORE-0004']);
    expect(error.textContent).not.toContain(COMMON.errors.unknown);
    expect(within(error).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(backLink().getAttribute('href')).toBe('/setup/ticket-priorities?q=ur');
  });

  it('a permalink whose read fails retryably (503): Retry AND Back to list (the list base when nothing is recorded)', async () => {
    pathname.value = '/setup/ticket-priorities/gone';
    api.record = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<TicketPrioritiesForm id="gone" />);
    await screen.findByTestId('inline-error');
    expect(screen.getByRole('button', { name: COMMON.retry })).toBeTruthy();
    expect(backLink().getAttribute('href')).toBe('/setup/ticket-priorities');
  });

  it('Loading: only the form skeleton while a permalink record is unknown', async () => {
    pathname.value = '/setup/ticket-priorities/a1';
    api.record = 'pending';
    show(<TicketPrioritiesForm id="a1" />);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(screen.getByRole('status').getAttribute('data-variant')).toBe('form');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('TicketPrioritiesForm: the breadcrumb label', () => {
  const published = vi.fn<(label: string | null | undefined) => void>();
  const inShell = (ui: ReactElement) => (
    <BreadcrumbLabelContext.Provider value={published}>{ui}</BreadcrumbLabelContext.Provider>
  );
  beforeEach(() => {
    published.mockClear();
  });

  it('a row opened from the list publishes its name before the record answers', async () => {
    pathname.value = '/setup/ticket-priorities/b5';
    api.record = 'pending';
    seedRow('/api/v1/ticket-priorities/b5', { id: 'b5', name: 'Seeded' });
    show(inShell(<TicketPrioritiesForm id="b5" />), undefined, GLOBAL);
    await waitFor(() => {
      expect(published).toHaveBeenLastCalledWith('Seeded');
    });
  });

  it('a permalink answered 404 publishes null once the not-found message shows, never a name', async () => {
    pathname.value = '/setup/ticket-priorities/gone';
    api.record = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    show(inShell(<TicketPrioritiesForm id="gone" />));
    await screen.findByTestId('inline-error');
    await waitFor(() => {
      expect(published).toHaveBeenLastCalledWith(null);
    });
  });
});

describe('GuardedTicketPrioritiesForm and Arabic', () => {
  it('anyone but an administrator is refused on /setup/ticket-priorities/new', async () => {
    api.me = { status: HTTP_OK, body: me(false) };
    show(<GuardedTicketPrioritiesForm id={null} />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders under ar with the Arabic title and field label and no physical-direction class', async () => {
    const { container } = show(<TicketPrioritiesForm id={null} />, 'ar');
    expect(
      await screen.findByRole('textbox', { name: AR.ticket_priority_add_edit_name }),
    ).toBeTruthy();
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      AR.ticket_priority_add,
    );
    expect(document.documentElement.dir).toBe('rtl');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
