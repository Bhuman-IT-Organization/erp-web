// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { expenseCategoriesHooks } from '@/features/expense-categories/api/expense-categories.endpoints';
import type { ExpenseCategories } from '@/features/expense-categories/schemas/expense-categories.schema';
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
import { ExpenseCategoriesForm, GuardedExpenseCategoriesForm } from '../ExpenseCategoriesForm';

/**
 * The form on `SchemaForm` (UIK-06): the verb + noun labels, the save summary (D-25.4), where a
 * failure shows (D-29), the return to the list with no list request after an edit (D-28, D-36),
 * the discard question (D-25.3) and the generated `ADMIN_GATE`. One `it` per FE-27 state: Pending,
 * FieldErrors, ServerError. The transport is a fake axios adapter on the shared instance.
 */
const EN = en['expense-categories'];
const COMMON = commonEn.common;
const HTTP_OK = 200;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/expense-categories';
const RECORD = '/api/v1/expense-categories/a1';

const push = vi.fn<(href: string) => void>();
const pathname = vi.hoisted(() => ({ value: '/setup/expense-categories/new' }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const ALPHA: ExpenseCategories = { id: 'a1', name: 'Alpha', description: '' };
const TRAVEL: ExpenseCategories = {
  id: 't7',
  name: 'Travel',
  description: 'Flights and trains.\nHotels up to the agreed rate.',
};
/** Names Perfex accepts and Node therefore accepts too, rendered as text only (D-19, T-4.1-25). */
const XSS_NAMES = ['Fuel < 50 km', '<script>alert(1)</script>'] as const;
/** The list row the list seeds: the record plus its usage counts (D-35). */
const ALPHA_ROW = { ...ALPHA, expenseCount: 0, mappingCount: 0, pettyCashCount: 0 };
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
          ? { status: HTTP_OK, body: { data: [ALPHA], meta: { nextCursor: null } } }
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

/**
 * A list page mounted beside the form, as the list screen reads it. `replaceRowInLists` and
 * `revalidateLists` write through the app's ONE cache, so a test using this probe renders with
 * `GLOBAL` and a `q` no other test uses.
 */
function ListProbe({ q }: { readonly q: string }): ReactElement {
  const { data } = expenseCategoriesHooks.useList({ q, limit: 25 });
  return <output data-testid="list-probe">{data?.data.map((row) => row.name).join(',')}</output>;
}
const CREATE = COMMON.create_noun.replace('{noun}', EN.expense_category_lowercase);
const CREATING = COMMON.creating_noun.replace('{noun}', EN.expense_category_lowercase);
const SAVE = COMMON.save_noun.replace('{noun}', EN.expense_category_lowercase);

const ISOLATED = { provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 };
const GLOBAL = { shouldRetryOnError: false, dedupingInterval: 0 };

function show(ui: ReactElement, locale?: 'ar', swr: typeof GLOBAL = ISOLATED) {
  return renderWithProviders(
    <SWRConfig value={swr}>
      {ui}
      <Toaster />
    </SWRConfig>,
    { hasMemory: true, ...(locale === undefined ? {} : { locale }) },
  );
}

const nameBox = () => screen.findByRole('textbox', { name: EN.expense_add_edit_name });
const descriptionBox = () =>
  screen.findByRole('textbox', { name: EN.expense_add_edit_description });
/** Types a name, as a member does, and asks to save. */
async function typeAndSubmit(value: string, submit = CREATE) {
  const user = userEvent.setup();
  const box = await nameBox();
  await user.clear(box);
  await user.type(box, value);
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
    record: { status: HTTP_OK, body: ALPHA },
    save: { status: HTTP_OK, body: { ...ALPHA, name: 'Beta' } },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  pathname.value = '/setup/expense-categories/new';
  sessionStorage.clear();
});
afterEach(() => {
  // sonner keeps its toasts in a module store: one test's toast must not show in the next.
  toast.dismiss();
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('ExpenseCategoriesForm: create (D-25.4, D-28)', () => {
  it('Create: "New Category" as the title, Perfex\'s two fields in order (Category Name, then the Category Description textarea), the required legend, one Details section, and no delete', async () => {
    show(<ExpenseCategoriesForm id={null} />);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      EN.new_expense_category,
    );
    const boxes = screen.getAllByRole('textbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBe(await nameBox());
    expect(boxes[1]).toBe(await descriptionBox());
    expect(boxes[1]?.tagName).toBe('TEXTAREA');
    expect(boxes[1]?.getAttribute('aria-required')).not.toBe('true');
    expect(document.body.textContent).toContain(COMMON.required_legend);
    expect(screen.getByText(EN.section_details)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
    expect(screen.getByRole('button', { name: CREATE }).hasAttribute('disabled')).toBe(true);
  });

  it('Mobile: one column below md and two from md; the description spans the full width', async () => {
    show(<ExpenseCategoriesForm id={null} />);
    const box = await descriptionBox();
    const grid = box.closest('.grid');
    expect(grid?.className.split(' ')).toEqual(
      expect.arrayContaining(['grid-cols-1', 'md:grid-cols-2']),
    );
    const cell = [...(grid?.children ?? [])].find((child) => child.contains(box));
    expect(cell?.className).toContain('md:col-span-2');
  });

  it('a description with line breaks is sent as typed, the name trimmed, then "Expense category saved"', async () => {
    api.save = { status: HTTP_OK, body: TRAVEL };
    show(<ExpenseCategoriesForm id={null} />);
    const user = userEvent.setup();
    await user.type(await nameBox(), '  Travel ');
    await user.type(await descriptionBox(), 'Line one{Enter}line two');
    await user.click(screen.getByRole('button', { name: CREATE }));
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([
        {
          method: 'POST',
          path: LIST,
          body: { name: 'Travel', description: 'Line one\nline two' },
        },
      ]);
    });
    expect(await screen.findByText(EN.saved_toast)).toBeTruthy();
  });

  it('FieldErrors (client): Category Name is required: a blank name shows the field error and the focused summary, and nothing is sent', async () => {
    show(<ExpenseCategoriesForm id={null} />);
    expect((await nameBox()).getAttribute('aria-required')).toBe('true');
    // A clean form cannot be submitted (the save bar); spaces make it dirty and still blank.
    await typeAndSubmit('   ');
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.expense_add_edit_name}: ${EN.enter_name}`);
    await waitFor(() => {
      expect(document.activeElement).toBe(summary);
    });
    expect(saves()).toEqual([]);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('asks first, "Create expense category Alpha?", then sends one POST, revalidates the list pages and returns to the list URL it came from', async () => {
    sessionStorage.setItem(
      'erp.list.return:/setup/expense-categories',
      JSON.stringify({ url: '/setup/expense-categories?q=al' }),
    );
    api.save = { status: HTTP_OK, body: ALPHA };
    show(
      <>
        <ListProbe q="create-probe" />
        <ExpenseCategoriesForm id={null} />
      </>,
      undefined,
      GLOBAL,
    );
    await screen.findByText('Alpha', { selector: 'output' });
    const user = await typeAndSubmit('Alpha');
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByRole('heading').textContent).toBe(
      COMMON.create_summary_title
        .replace('{noun}', EN.expense_category_lowercase)
        .replace('{name}', 'Alpha'),
    );
    expect(within(open).getByTestId('confirm-dialog-dismiss').textContent).toBe(
      COMMON.back_to_form,
    );
    expect(saves()).toEqual([]);
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/expense-categories?q=al', { scroll: false });
    });
    expect(saves()).toEqual([
      { method: 'POST', path: LIST, body: { name: 'Alpha', description: '' } },
    ]);
    // A new record moves totals and positions: the mounted list page asks again.
    expect(listReads()).toHaveLength(2);
  });

  it('Pending: once confirmed, the submit reads "Creating expense category…" and is disabled', async () => {
    api.save = 'pending';
    show(<ExpenseCategoriesForm id={null} />);
    const user = await typeAndSubmit('Alpha');
    await confirmSave(user);
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: CREATING }).every((b) => b.hasAttribute('disabled')),
      ).toBe(true);
    });
  });
});

describe('ExpenseCategoriesForm: when a save fails (D-29)', () => {
  it('FieldErrors: a 400 with a name issue closes the dialog, shows the key under Name and in the focused summary, never the api text', async () => {
    api.save = {
      status: BAD_REQUEST,
      body: problem(BAD_REQUEST, 'ERP-VALIDATION-0001', [
        { path: ['name'], message: 'raw server text' },
      ]),
    };
    show(<ExpenseCategoriesForm id={null} />);
    const user = await typeAndSubmit('Alpha');
    await confirmSave(user);
    await closed();
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.expense_add_edit_name}: ${EN.enter_name}`);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(document.activeElement).toBe(summary);
    expect(document.body.textContent).not.toContain('raw server text');
    expect(push).not.toHaveBeenCalled();
  });

  it('ServerError: a 503 closes the dialog, the alert in the form keeps the edits and offers Retry, which re-sends without asking again', async () => {
    api.save = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<ExpenseCategoriesForm id={null} />);
    const user = await typeAndSubmit('Alpha');
    await confirmSave(user);
    await closed();
    const alert = await screen.findByTestId('form-server-error');
    expect(alert.textContent).toContain(COMMON.save_failed);
    expect(alert.textContent).not.toMatch(/ERP-|503/);
    expect(await nameBox()).toHaveProperty('value', 'Alpha');
    api.save = { status: HTTP_OK, body: ALPHA };
    await user.click(within(alert).getByRole('button', { name: COMMON.retry }));
    await waitFor(() => {
      expect(saves()).toHaveLength(2);
    });
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/expense-categories', { scroll: false });
    });
  });
});

describe('ExpenseCategoriesForm: edit (D-25.4, D-36, D-25.3)', () => {
  it('Edit: opened from the list, shows the record, names the change in the summary, sends one PATCH, and the list page on screen shows the saved row with no list request (D-36)', async () => {
    pathname.value = '/setup/expense-categories/a1';
    seedRow(RECORD, ALPHA_ROW);
    show(
      <>
        <ListProbe q="edit-probe" />
        <ExpenseCategoriesForm id="a1" />
      </>,
      undefined,
      GLOBAL,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Alpha' })).toBeTruthy();
    await screen.findByText('Alpha', { selector: 'output' });
    const user = await typeAndSubmit('Beta', SAVE);
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByTestId('confirm-dialog-changes').textContent).toBe(
      COMMON.change_from_to
        .replace('{label}', EN.expense_add_edit_name)
        .replace('{from}', 'Alpha')
        .replace('{to}', 'Beta'),
    );
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/expense-categories', { scroll: false });
    });
    expect(saves()).toEqual([
      { method: 'PATCH', path: RECORD, body: { name: 'Beta', description: '' } },
    ]);
    expect(screen.getByTestId('list-probe').textContent).toBe('Beta');
    expect(listReads()).toHaveLength(1);
  });

  it('SaveSummary: a changed description is one "Category Description updated" line that never echoes the value, after the name line', async () => {
    pathname.value = '/setup/expense-categories/t7';
    api.record = { status: HTTP_OK, body: TRAVEL };
    show(<ExpenseCategoriesForm id="t7" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Travel' })).toBeTruthy();
    const user = userEvent.setup();
    await waitFor(async () => {
      expect(await descriptionBox()).toHaveProperty('value', TRAVEL.description);
    });
    await user.clear(await nameBox());
    await user.type(await nameBox(), 'Trips');
    await user.type(await descriptionBox(), ' Secret remark.');
    await user.click(screen.getByRole('button', { name: SAVE }));
    const open = await screen.findByTestId('confirm-dialog');
    const lines = within(within(open).getByTestId('confirm-dialog-changes'))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(lines).toEqual([
      COMMON.change_from_to
        .replace('{label}', EN.expense_add_edit_name)
        .replace('{from}', 'Travel')
        .replace('{to}', 'Trips'),
      COMMON.field_updated.replace('{label}', EN.expense_add_edit_description),
    ]);
    expect(open.textContent).not.toContain('Secret remark');
  });

  it('only the description changed: the summary has the one "updated" line and the PATCH carries both fields', async () => {
    pathname.value = '/setup/expense-categories/t7';
    api.record = { status: HTTP_OK, body: TRAVEL };
    api.save = { status: HTTP_OK, body: { ...TRAVEL, description: 'New text' } };
    show(<ExpenseCategoriesForm id="t7" />);
    await screen.findByRole('heading', { level: 1, name: 'Travel' });
    const user = userEvent.setup();
    const description = await descriptionBox();
    await waitFor(() => {
      expect(description).toHaveProperty('value', TRAVEL.description);
    });
    await user.clear(description);
    await user.type(description, 'New text');
    await user.click(screen.getByRole('button', { name: SAVE }));
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByTestId('confirm-dialog-changes').textContent).toBe(
      COMMON.field_updated.replace('{label}', EN.expense_add_edit_description),
    );
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([
        {
          method: 'PATCH',
          path: '/api/v1/expense-categories/t7',
          body: { name: 'Travel', description: 'New text' },
        },
      ]);
    });
  });

  it('a permalink edit knows no usage counts, so after the save the list pages ask again rather than lose them', async () => {
    // An id no other test seeds: the app's one cache holds no row for it.
    pathname.value = '/setup/expense-categories/p9';
    api.record = { status: HTTP_OK, body: { ...ALPHA, id: 'p9' } };
    api.save = { status: HTTP_OK, body: { ...ALPHA, id: 'p9', name: 'Beta' } };
    show(
      <>
        <ListProbe q="permalink-probe" />
        <ExpenseCategoriesForm id="p9" />
      </>,
      undefined,
      GLOBAL,
    );
    await screen.findByText('Alpha', { selector: 'output' });
    const user = await typeAndSubmit('Beta', SAVE);
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/expense-categories', { scroll: false });
    });
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(1);
    });
  });

  it('a dirty form asks "Discard changes?" before Back to list leaves', async () => {
    pathname.value = '/setup/expense-categories/a1';
    show(<ExpenseCategoriesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Alpha' });
    const user = userEvent.setup();
    await user.type(await nameBox(), ' 2');
    await user.click(screen.getByRole('button', { name: COMMON.back_to_list }));
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByRole('heading').textContent).toBe(COMMON.discard_title);
    expect(push).not.toHaveBeenCalled();
    // "Keep editing" stays on the form with the edit kept.
    await user.click(within(open).getByRole('button', { name: COMMON.keep_editing }));
    await closed();
    expect(push).not.toHaveBeenCalled();
    expect(await nameBox()).toHaveProperty('value', 'Alpha 2');
    // Asked again, "Discard changes" leaves for the list.
    await user.click(screen.getByRole('button', { name: COMMON.back_to_list }));
    const again = await screen.findByTestId('confirm-dialog');
    await user.click(within(again).getByRole('button', { name: COMMON.discard_changes }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/expense-categories');
    });
  });

  it('a save answered 404 ERP-CORE-0004 (deleted meanwhile) stays inside the summary dialog with its confirm disabled, and the form keeps the edits', async () => {
    pathname.value = '/setup/expense-categories/a1';
    api.save = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    show(<ExpenseCategoriesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Alpha' });
    const user = await typeAndSubmit('Beta', SAVE);
    await confirmSave(user);
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors['ERP-CORE-0004']);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    expect(push).not.toHaveBeenCalled();
    // Behind the modal dialog (hidden from the accessibility tree while it is open), the edit is kept.
    expect(
      screen.getByRole('textbox', { name: EN.expense_add_edit_name, hidden: true }),
    ).toHaveProperty('value', 'Beta');
  });
});

describe('ExpenseCategoriesForm: loading (D-39)', () => {
  it('Loading: a permalink before its record answers shows the form skeleton, and no error, no "not found", no fields', async () => {
    pathname.value = '/setup/expense-categories/a1';
    api.record = 'pending';
    show(<ExpenseCategoriesForm id="a1" />);
    const skeleton = await screen.findByRole('status');
    expect(skeleton.getAttribute('data-variant')).toBe('form');
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(screen.queryByTestId('inline-error')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.body.textContent).not.toContain(EN.errors['ERP-CORE-0004']);
  });

  it('Loading behind the guards: the form skeleton while /me is unknown, never "no access"', async () => {
    api.me = 'pending';
    show(<GuardedExpenseCategoriesForm id={null} />);
    expect((await screen.findByRole('status')).getAttribute('data-variant')).toBe('form');
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('ExpenseCategoriesForm: names are accepted as Perfex accepts them and shown as text (D-19, T-4.1-25)', () => {
  for (const name of XSS_NAMES) {
    it(`"${name}" is submitted with no field error, and the summary title shows it as typed`, async () => {
      api.save = { status: HTTP_OK, body: { ...ALPHA, name } };
      const scriptsBefore = document.querySelectorAll('script').length;
      show(<ExpenseCategoriesForm id={null} />);
      const user = userEvent.setup();
      await user.click(await nameBox());
      await user.paste(name);
      await user.click(screen.getByRole('button', { name: CREATE }));
      const open = await screen.findByTestId('confirm-dialog');
      expect(within(open).getByRole('heading').textContent).toBe(
        COMMON.create_summary_title
          .replace('{noun}', EN.expense_category_lowercase)
          .replace('{name}', name),
      );
      expect(screen.queryByTestId('error-summary')).toBeNull();
      await confirmSave(user);
      await waitFor(() => {
        expect(saves()).toEqual([{ method: 'POST', path: LIST, body: { name, description: '' } }]);
      });
      expect(document.querySelectorAll('script').length).toBe(scriptsBefore);
    });
  }

  it('a record named "<script>alert(1)</script>" is the page title and the breadcrumb label as typed, and no script element is added', async () => {
    const name = '<script>alert(1)</script>';
    const published = vi.fn<(label: string | null | undefined) => void>();
    pathname.value = '/setup/expense-categories/a1';
    api.record = { status: HTTP_OK, body: { ...ALPHA, name, description: '<b>bold</b>' } };
    const scriptsBefore = document.querySelectorAll('script').length;
    show(
      <BreadcrumbLabelContext.Provider value={published}>
        <ExpenseCategoriesForm id="a1" />
      </BreadcrumbLabelContext.Provider>,
    );
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(name);
    await waitFor(() => {
      expect(published).toHaveBeenLastCalledWith(name);
    });
    expect(await descriptionBox()).toHaveProperty('value', '<b>bold</b>');
    expect(document.querySelectorAll('script').length).toBe(scriptsBefore);
    expect(document.querySelector('b')).toBeNull();
  });
});

describe('ExpenseCategoriesForm: a record that is not there (D-32, D-39)', () => {
  const backLink = () => screen.getByRole('link', { name: COMMON.back_to_list });
  /** Opens record `id` from the list: its row seeded in the app's one cache (`GLOBAL`). */
  const openSeeded = (id: string) => {
    pathname.value = `/setup/expense-categories/${id}`;
    seedRow(`/api/v1/expense-categories/${id}`, { ...ALPHA_ROW, id });
    show(<ExpenseCategoriesForm id={id} />, undefined, GLOBAL);
  };

  it('NotFound: a permalink answered 404 ERP-CORE-0004 says so in plain words: never "Something went wrong": with no Retry, and Back to list to the recorded list URL', async () => {
    sessionStorage.setItem(
      'erp.list.return:/setup/expense-categories',
      JSON.stringify({ url: '/setup/expense-categories?q=al' }),
    );
    pathname.value = '/setup/expense-categories/gone';
    api.record = { status: 404, body: problem(404, 'ERP-CORE-0004') };
    show(<ExpenseCategoriesForm id="gone" />);
    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain(EN.errors['ERP-CORE-0004']);
    expect(error.textContent).not.toContain(COMMON.errors.unknown);
    expect(within(error).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(backLink().getAttribute('href')).toBe('/setup/expense-categories?q=al');
  });

  it('a permalink whose read fails retryably (503): Retry AND Back to list: the list base when nothing is recorded', async () => {
    pathname.value = '/setup/expense-categories/gone';
    api.record = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<ExpenseCategoriesForm id="gone" />);
    await screen.findByTestId('inline-error');
    expect(backLink().getAttribute('href')).toBe('/setup/expense-categories');
    // Retry asks again; the record answers this time and the form shows.
    api.record = { status: HTTP_OK, body: { ...ALPHA, id: 'gone' } };
    await userEvent.click(screen.getByRole('button', { name: COMMON.retry }));
    expect(await nameBox()).toHaveProperty('value', 'Alpha');
  });

  it('SeededNotFound: opened from the list, the record answers 404: the whole page is the not-found state with Back to list: never the seeded form', async () => {
    api.record = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    openSeeded('x3');
    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain(EN.errors['ERP-CORE-0004']);
    expect(backLink().getAttribute('href')).toBe('/setup/expense-categories');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opened from the list, the record read fails retryably (503): the seeded form stays usable: the row is the whole record', async () => {
    api.record = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    openSeeded('x4');
    await waitFor(() => {
      expect(requests.some((r) => r.path === '/api/v1/expense-categories/x4')).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const box = await nameBox();
    expect(box).toHaveProperty('value', 'Alpha');
    expect(box).toHaveProperty('disabled', false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a name over EXPENSE_CATEGORIES_NAME_MAX is refused on the client with name_too_long, and nothing is sent', async () => {
    show(<ExpenseCategoriesForm id={null} />);
    const user = userEvent.setup();
    const box = await nameBox();
    await user.click(box);
    await user.paste('x'.repeat(192));
    await user.click(screen.getByRole('button', { name: CREATE }));
    const expected = EN.name_too_long.replace('{max}', '191');
    expect((await screen.findAllByText(expected)).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(saves()).toEqual([]);
  });
});

describe('ExpenseCategoriesForm: the page title and the breadcrumb label (D-16, WR-10, D-39)', () => {
  /** The shell's setter, as `PageShell` provides it: every label the form publishes, in order. */
  const published = vi.fn<(label: string | null | undefined) => void>();
  const inShell = (ui: ReactElement) => (
    <BreadcrumbLabelContext.Provider value={published}>{ui}</BreadcrumbLabelContext.Provider>
  );
  const labels = () => published.mock.calls.map(([label]) => label);
  const names = () => labels().filter((label) => typeof label === 'string');
  /** Opens record `id` from the list: its row seeded in the app's one cache, under its own name. */
  const openSeededAs = (id: string, name: string) => {
    pathname.value = `/setup/expense-categories/${id}`;
    seedRow(`/api/v1/expense-categories/${id}`, { ...ALPHA_ROW, id, name });
    show(inShell(<ExpenseCategoriesForm id={id} />), undefined, GLOBAL);
  };

  beforeEach(() => {
    published.mockClear();
  });

  it('the title is the 24px page title: text-2xl font-semibold (D-16)', async () => {
    show(<ExpenseCategoriesForm id={null} />);
    const title = await screen.findByRole('heading', { level: 1 });
    expect(title.className).toContain('text-2xl');
    expect(title.className).toContain('font-semibold');
    expect(title.className).not.toContain('text-xl');
  });

  it('a row opened from the list publishes its name before the record answers', async () => {
    api.record = 'pending';
    openSeededAs('b5', 'Seeded');
    await waitFor(() => {
      expect(published).toHaveBeenLastCalledWith('Seeded');
    });
    expect(labels()).not.toContain(null);
  });

  it('a permalink answered 404 ERP-CORE-0004 publishes null once the not-found message shows, and never a name', async () => {
    pathname.value = '/setup/expense-categories/gone';
    api.record = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    show(inShell(<ExpenseCategoriesForm id="gone" />));
    expect((await screen.findByTestId('inline-error')).textContent).toContain(
      EN.errors['ERP-CORE-0004'],
    );
    await waitFor(() => {
      expect(published).toHaveBeenLastCalledWith(null);
    });
    // Loading first (the crumb's skeleton), then null: never a skeleton that never ends.
    expect(labels()[0]).toBeUndefined();
    expect(names()).toEqual([]);
  });

  it('a row opened from the list whose record answers 404 publishes null with the not-found page, not the seeded name', async () => {
    api.record = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    openSeededAs('b6', 'Seeded');
    await screen.findByTestId('inline-error');
    await waitFor(() => {
      expect(published).toHaveBeenLastCalledWith(null);
    });
  });

  it('the create route (id null) never publishes a string: its crumb is the static "New"', async () => {
    show(inShell(<ExpenseCategoriesForm id={null} />));
    const user = userEvent.setup();
    await user.type(await nameBox(), 'Alpha');
    expect(published).toHaveBeenCalledWith(undefined);
    expect(names()).toEqual([]);
  });
});

describe('GuardedExpenseCategoriesForm: the generated gate is ADMIN_GATE (fail closed)', () => {
  it('anyone but an administrator is refused on /setup/expense-categories/new', async () => {
    api.me = { status: HTTP_OK, body: me(false) };
    show(<GuardedExpenseCategoriesForm id={null} />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('ExpenseCategoriesForm: Arabic (FE-20)', () => {
  it('Rtl: renders under ar with the pack label and no physical-direction class', async () => {
    const { container } = show(<ExpenseCategoriesForm id={null} />, 'ar');
    expect(
      await screen.findByRole('textbox', { name: ar['expense-categories'].expense_add_edit_name }),
    ).toBeTruthy();
    expect(document.documentElement.dir).toBe('rtl');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
