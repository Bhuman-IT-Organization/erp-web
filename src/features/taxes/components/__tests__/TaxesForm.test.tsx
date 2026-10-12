// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { taxesHooks } from '@/features/taxes/api/taxes.endpoints';
import type { Taxes } from '@/features/taxes/schemas/taxes.schema';
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
import en from '../../messages/en.json';
import { TaxesForm, GuardedTaxesForm } from '../TaxesForm';

/**
 * The form on `SchemaForm` (UIK-06): the verb + noun labels, the save summary (D-25.4), where a
 * failure shows (D-29), the return to the list with no list request after an edit (D-28, D-36),
 * the discard question (D-25.3) and the generated `ADMIN_GATE`. One `it` per FE-27 state: Pending,
 * FieldErrors, ServerError. The transport is a fake axios adapter on the shared instance.
 */
const EN = en.taxes;
const COMMON = commonEn.common;
const HTTP_OK = 200;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/taxes';
const RECORD = '/api/v1/taxes/a1';

const push = vi.fn<(href: string) => void>();
const pathname = vi.hoisted(() => ({ value: '/setup/taxes/new' }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const NO_USE = {
  items: 0,
  expenses: 0,
  subscriptions: 0,
  vendorItems: 0,
  purchaseLines: 0,
  warehouseLines: 0,
  fixedEquipmentLines: 0,
  salesReturnLines: 0,
  accounting: 0,
};
const ALPHA: Taxes = { id: 'a1', name: 'Alpha', rate: '5.00', usage: NO_USE, isDefault: false };
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
  const { data } = taxesHooks.useList({ q, limit: 25 });
  return <output data-testid="list-probe">{data?.data.map((row) => row.name).join(',')}</output>;
}
const CREATE = COMMON.create_noun.replace('{noun}', EN.tax_lowercase);
const CREATING = COMMON.creating_noun.replace('{noun}', EN.tax_lowercase);
const SAVE = COMMON.save_noun.replace('{noun}', EN.tax_lowercase);

const ISOLATED = { provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 };
const GLOBAL = { shouldRetryOnError: false, dedupingInterval: 0 };

function show(ui: ReactElement, locale?: 'ar', swr: typeof GLOBAL = ISOLATED) {
  return renderWithProviders(<SWRConfig value={swr}>{ui}</SWRConfig>, {
    hasMemory: true,
    ...(locale === undefined ? {} : { locale }),
  });
}

const nameBox = () => screen.findByRole('textbox', { name: EN.tax_add_edit_name });
const rateBox = () => screen.findByRole('textbox', { name: EN.tax_add_edit_rate });
/** Types a name (and a rate when the rate is still empty), as a member does, and asks to save. */
async function typeAndSubmit(value: string, submit = CREATE) {
  const user = userEvent.setup();
  const box = await nameBox();
  await user.clear(box);
  await user.type(box, value);
  const rate = await rateBox();
  if ((rate as HTMLInputElement).value === '') await user.type(rate, '5');
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
  pathname.value = '/setup/taxes/new';
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('TaxesForm: create (D-25.4, D-28)', () => {
  it('marks Name required and refuses a blank name on the client: the field error, the focused summary, no request', async () => {
    show(<TaxesForm id={null} />);
    expect((await nameBox()).getAttribute('aria-required')).toBe('true');
    // A clean form cannot be submitted (the save bar); spaces make it dirty and still blank.
    await typeAndSubmit('   ');
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.tax_add_edit_name}: ${EN.enter_name}`);
    await waitFor(() => {
      expect(document.activeElement).toBe(summary);
    });
    expect(saves()).toEqual([]);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('asks first, "Create tax Alpha?", then sends one POST, revalidates the list pages and returns to the list URL it came from', async () => {
    sessionStorage.setItem(
      'erp.list.return:/setup/taxes',
      JSON.stringify({ url: '/setup/taxes?q=al' }),
    );
    api.save = { status: HTTP_OK, body: ALPHA };
    show(
      <>
        <ListProbe q="create-probe" />
        <TaxesForm id={null} />
      </>,
      undefined,
      GLOBAL,
    );
    await screen.findByText('Alpha', { selector: 'output' });
    const user = await typeAndSubmit('Alpha');
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByRole('heading').textContent).toBe(
      COMMON.create_summary_title.replace('{noun}', EN.tax_lowercase).replace('{name}', 'Alpha'),
    );
    expect(within(open).getByTestId('confirm-dialog-dismiss').textContent).toBe(
      COMMON.back_to_form,
    );
    expect(saves()).toEqual([]);
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/taxes?q=al', { scroll: false });
    });
    expect(saves()).toEqual([{ method: 'POST', path: LIST, body: { name: 'Alpha', rate: '5' } }]);
    // A new record moves totals and positions: the mounted list page asks again.
    expect(listReads()).toHaveLength(2);
  });

  it('Pending: once confirmed, the submit reads "Creating tax…" and is disabled', async () => {
    api.save = 'pending';
    show(<TaxesForm id={null} />);
    const user = await typeAndSubmit('Alpha');
    await confirmSave(user);
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: CREATING }).every((b) => b.hasAttribute('disabled')),
      ).toBe(true);
    });
  });
});

describe('TaxesForm: when a save fails (D-29)', () => {
  it('FieldErrors: a 400 with a name issue closes the dialog, shows the key under Name and in the focused summary, never the api text', async () => {
    api.save = {
      status: BAD_REQUEST,
      body: problem(BAD_REQUEST, 'ERP-VALIDATION-0001', [
        { path: ['name'], message: 'raw server text' },
      ]),
    };
    show(<TaxesForm id={null} />);
    const user = await typeAndSubmit('Alpha');
    await confirmSave(user);
    await closed();
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.tax_add_edit_name}: ${EN.enter_name}`);
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
    show(<TaxesForm id={null} />);
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
      expect(push).toHaveBeenCalledWith('/setup/taxes', { scroll: false });
    });
  });
});

describe('TaxesForm: edit (D-25.4, D-36, D-25.3)', () => {
  it('opened from the list: shows the record, names the change in the summary, sends one PATCH, and the list page on screen shows the saved row with no list request (D-36)', async () => {
    pathname.value = '/setup/taxes/a1';
    seedRow(RECORD, ALPHA);
    show(
      <>
        <ListProbe q="edit-probe" />
        <TaxesForm id="a1" />
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
        .replace('{label}', EN.tax_add_edit_name)
        .replace('{from}', 'Alpha')
        .replace('{to}', 'Beta'),
    );
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/taxes', { scroll: false });
    });
    expect(saves()).toEqual([
      { method: 'PATCH', path: RECORD, body: { name: 'Beta', rate: '5.00' } },
    ]);
    expect(screen.getByTestId('list-probe').textContent).toBe('Beta');
    expect(listReads()).toHaveLength(1);
  });

  it('a permalink edit (no row from the list) knows nothing the list row adds, so after the save the list pages ask again rather than lose it', async () => {
    // An id no other test seeds: the app's one cache holds no row for it.
    pathname.value = '/setup/taxes/p9';
    api.record = { status: HTTP_OK, body: { ...ALPHA, id: 'p9' } };
    api.save = { status: HTTP_OK, body: { ...ALPHA, id: 'p9', name: 'Beta' } };
    show(
      <>
        <ListProbe q="permalink-probe" />
        <TaxesForm id="p9" />
      </>,
      undefined,
      GLOBAL,
    );
    await screen.findByText('Alpha', { selector: 'output' });
    const user = await typeAndSubmit('Beta', SAVE);
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/taxes', { scroll: false });
    });
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(1);
    });
  });

  it("a save answered 404 ERP-CORE-0004 (deleted meanwhile) stays inside the summary dialog in the feature's words, with its confirm disabled, and the form keeps the edits (D-32)", async () => {
    pathname.value = '/setup/taxes/a1';
    api.save = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    show(<TaxesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Alpha' });
    const user = await typeAndSubmit('Beta', SAVE);
    await confirmSave(user);
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors['ERP-CORE-0004']);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    expect(push).not.toHaveBeenCalled();
    // Behind the modal dialog (hidden from the accessibility tree while it is open), the edit is kept.
    expect(
      screen.getByRole('textbox', { name: EN.tax_add_edit_name, hidden: true }),
    ).toHaveProperty('value', 'Beta');
  });

  it('a dirty form asks "Discard changes?" before Back to list leaves', async () => {
    pathname.value = '/setup/taxes/a1';
    show(<TaxesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Alpha' });
    const user = userEvent.setup();
    await user.type(await nameBox(), ' 2');
    await user.click(screen.getByRole('button', { name: COMMON.back_to_list }));
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByRole('heading').textContent).toBe(COMMON.discard_title);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('TaxesForm: a record that is not there (D-32, D-39)', () => {
  const backLink = () => screen.getByRole('link', { name: COMMON.back_to_list });
  /** Opens record `id` from the list: its row seeded in the app's one cache (`GLOBAL`). */
  const openSeeded = (id: string) => {
    pathname.value = `/setup/taxes/${id}`;
    seedRow(`/api/v1/taxes/${id}`, { ...ALPHA, id });
    show(<TaxesForm id={id} />, undefined, GLOBAL);
  };

  it('a permalink answered 404 ERP-CORE-0004 says so in plain words: never "Something went wrong": with no Retry, and Back to list to the recorded list URL', async () => {
    sessionStorage.setItem(
      'erp.list.return:/setup/taxes',
      JSON.stringify({ url: '/setup/taxes?q=al' }),
    );
    pathname.value = '/setup/taxes/gone';
    api.record = { status: 404, body: problem(404, 'ERP-CORE-0004') };
    show(<TaxesForm id="gone" />);
    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain(EN.errors['ERP-CORE-0004']);
    expect(error.textContent).not.toContain(COMMON.errors.unknown);
    expect(within(error).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(backLink().getAttribute('href')).toBe('/setup/taxes?q=al');
  });

  it('a permalink whose read fails retryably (503): Retry AND Back to list: the list base when nothing is recorded', async () => {
    pathname.value = '/setup/taxes/gone';
    api.record = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<TaxesForm id="gone" />);
    await screen.findByTestId('inline-error');
    expect(screen.getByRole('button', { name: COMMON.retry })).toBeTruthy();
    expect(backLink().getAttribute('href')).toBe('/setup/taxes');
  });

  it('opened from the list, the record answers 404: the whole page is the not-found state with Back to list: never the seeded form', async () => {
    api.record = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    openSeeded('x3');
    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain(EN.errors['ERP-CORE-0004']);
    expect(backLink().getAttribute('href')).toBe('/setup/taxes');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opened from the list, the record read fails retryably (503): the seeded form stays usable: the row is the whole record', async () => {
    api.record = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    openSeeded('x4');
    await waitFor(() => {
      expect(requests.some((r) => r.path === '/api/v1/taxes/x4')).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const box = await nameBox();
    expect(box).toHaveProperty('value', 'Alpha');
    expect(box).toHaveProperty('disabled', false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a name over TAXES_NAME_MAX is refused on the client with name_too_long, and nothing is sent', async () => {
    show(<TaxesForm id={null} />);
    const user = userEvent.setup();
    const box = await nameBox();
    await user.click(box);
    await user.paste('x'.repeat(101));
    await user.click(screen.getByRole('button', { name: CREATE }));
    const expected = EN.name_too_long.replace('{max}', '100');
    expect((await screen.findAllByText(expected)).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(saves()).toEqual([]);
  });
});

describe('TaxesForm: the page title and the breadcrumb label (D-16, WR-10, D-39)', () => {
  /** The shell's setter, as `PageShell` provides it: every label the form publishes, in order. */
  const published = vi.fn<(label: string | null | undefined) => void>();
  const inShell = (ui: ReactElement) => (
    <BreadcrumbLabelContext.Provider value={published}>{ui}</BreadcrumbLabelContext.Provider>
  );
  const labels = () => published.mock.calls.map(([label]) => label);
  const names = () => labels().filter((label) => typeof label === 'string');
  /** Opens record `id` from the list: its row seeded in the app's one cache, under its own name. */
  const openSeededAs = (id: string, name: string) => {
    pathname.value = `/setup/taxes/${id}`;
    seedRow(`/api/v1/taxes/${id}`, { ...ALPHA, id, name });
    show(inShell(<TaxesForm id={id} />), undefined, GLOBAL);
  };

  beforeEach(() => {
    published.mockClear();
  });

  it('the title is the 24px page title: text-2xl font-semibold (D-16)', async () => {
    show(<TaxesForm id={null} />);
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
    pathname.value = '/setup/taxes/gone';
    api.record = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    show(inShell(<TaxesForm id="gone" />));
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
    show(inShell(<TaxesForm id={null} />));
    const user = userEvent.setup();
    await user.type(await nameBox(), 'Alpha');
    expect(published).toHaveBeenCalledWith(undefined);
    expect(names()).toEqual([]);
  });
});

describe('GuardedTaxesForm: the generated gate is ADMIN_GATE (fail closed)', () => {
  it('anyone but an administrator is refused on /setup/taxes/new', async () => {
    api.me = { status: HTTP_OK, body: me(false) };
    show(<GuardedTaxesForm id={null} />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('TaxesForm: Arabic (FE-20)', () => {
  it("renders under ar with the legacy label (the pack's text until the reviewer translates it) and no physical-direction class", async () => {
    const { container } = show(<TaxesForm id={null} />, 'ar');
    expect(await screen.findByRole('textbox', { name: EN.tax_add_edit_name })).toBeTruthy();
    expect(document.documentElement.dir).toBe('rtl');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});

describe("TaxesForm: Perfex's two fields (W2A-02)", () => {
  it('/new is titled "Add New Tax" with Tax Name and Tax Rate (percent) empty, both required, in one Details section', async () => {
    show(<TaxesForm id={null} />);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(EN.tax_add_title);
    const name = await nameBox();
    const rate = await rateBox();
    expect(name).toHaveProperty('value', '');
    expect(rate).toHaveProperty('value', '');
    expect(name.getAttribute('aria-required')).toBe('true');
    expect(rate.getAttribute('aria-required')).toBe('true');
    expect(rate.getAttribute('inputmode')).toBe('decimal');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(EN.section_details);
    expect(screen.getByText(COMMON.required_legend)).toBeTruthy();
    expect(screen.queryByTestId('taxes-locked')).toBeNull();
  });

  it('typing "VAT | 5" leaves "VAT 5": every | is removed and the spaces collapse as it is typed', async () => {
    show(<TaxesForm id={null} />);
    const user = userEvent.setup();
    const box = await nameBox();
    await user.type(box, 'VAT | 5');
    expect(box).toHaveProperty('value', 'VAT 5');
    await user.clear(box);
    await user.paste('a|b||c');
    expect(box).toHaveProperty('value', 'abc');
  });

  it('a rate that is not a number ("abc", "1,000.5") is refused on the client with rate_invalid, and nothing is sent', async () => {
    show(<TaxesForm id={null} />);
    const user = userEvent.setup();
    await user.type(await nameBox(), 'VAT');
    for (const value of ['abc', '1,000.5']) {
      const rate = await rateBox();
      await user.clear(rate);
      await user.type(rate, value);
      await user.click(screen.getByRole('button', { name: CREATE }));
      const summary = await screen.findByTestId('error-summary');
      expect(summary.textContent).toContain(`${EN.tax_add_edit_rate}: ${EN.rate_invalid}`);
    }
    expect(saves()).toEqual([]);
  });

  it('an empty rate is refused with enter_rate and a rate too large for the column with rate_too_large', async () => {
    show(<TaxesForm id={null} />);
    const user = userEvent.setup();
    await user.type(await nameBox(), 'VAT');
    await user.click(screen.getByRole('button', { name: CREATE }));
    expect((await screen.findByTestId('error-summary')).textContent).toContain(
      `${EN.tax_add_edit_rate}: ${EN.enter_rate}`,
    );
    await user.type(await rateBox(), '10000000000000');
    await user.click(screen.getByRole('button', { name: CREATE }));
    await waitFor(() => {
      expect(screen.getByTestId('error-summary').textContent).toContain(
        `${EN.tax_add_edit_rate}: ${EN.rate_too_large}`,
      );
    });
    expect(saves()).toEqual([]);
  });

  it('a create sends the name and the rate as typed strings: "Fuel < 50 km" and "12.5"', async () => {
    api.save = { status: HTTP_OK, body: { ...ALPHA, name: 'Fuel < 50 km', rate: '12.50' } };
    show(<TaxesForm id={null} />);
    const user = userEvent.setup();
    await user.type(await nameBox(), 'Fuel < 50 km');
    await user.type(await rateBox(), '12.5');
    await user.click(screen.getByRole('button', { name: CREATE }));
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByRole('heading').textContent).toBe('Create tax Fuel < 50 km?');
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([
        { method: 'POST', path: LIST, body: { name: 'Fuel < 50 km', rate: '12.5' } },
      ]);
    });
  });

  it('an edit summary names each change: "Tax Name: VAT → GST" and "Tax Rate (percent): 5.00 → 7.50"', async () => {
    pathname.value = '/setup/taxes/a1';
    api.record = { status: HTTP_OK, body: { ...ALPHA, name: 'VAT' } };
    show(<TaxesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'VAT' });
    const user = userEvent.setup();
    const name = await nameBox();
    await user.clear(name);
    await user.type(name, 'GST');
    const rate = await rateBox();
    await user.clear(rate);
    await user.type(rate, '7.50');
    await user.click(screen.getByRole('button', { name: SAVE }));
    const open = await screen.findByTestId('confirm-dialog');
    const lines = within(open).getByTestId('confirm-dialog-changes').querySelectorAll('li');
    expect([...lines].map((li) => li.textContent)).toEqual([
      COMMON.change_from_to
        .replace('{label}', EN.tax_add_edit_name)
        .replace('{from}', 'VAT')
        .replace('{to}', 'GST'),
      COMMON.change_from_to
        .replace('{label}', EN.tax_add_edit_rate)
        .replace('{from}', '5.00')
        .replace('{to}', '7.50'),
    ]);
  });

  it('SaveRefused: a 409 ERP-TAXES-0003 (the name is taken) stays inside the summary dialog in plain words, confirm disabled, the edits kept', async () => {
    api.save = { status: CONFLICT, body: problem(CONFLICT, 'ERP-TAXES-0003') };
    show(<TaxesForm id={null} />);
    const user = await typeAndSubmit('VAT');
    await confirmSave(user);
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors['ERP-TAXES-0003']);
    expect(error.textContent).not.toMatch(/ERP-|409/);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it('a 409 ERP-TAXES-0002 or ERP-TAXES-0004 (put to use or made a default meanwhile) also stays inside the dialog in its own words', async () => {
    pathname.value = '/setup/taxes/a1';
    for (const code of ['ERP-TAXES-0002', 'ERP-TAXES-0004'] as const) {
      api.save = { status: CONFLICT, body: problem(CONFLICT, code) };
      const view = show(<TaxesForm id="a1" />);
      await screen.findByRole('heading', { level: 1, name: 'Alpha' });
      const user = await typeAndSubmit('Beta', SAVE);
      await confirmSave(user);
      expect((await screen.findByTestId('confirm-dialog-error')).textContent).toBe(EN.errors[code]);
      view.unmount();
    }
  });

  it('a 400 on the rate lands under Tax Rate (percent) in general words, never the api text', async () => {
    api.save = {
      status: BAD_REQUEST,
      body: problem(BAD_REQUEST, 'ERP-VALIDATION-0001', [
        { path: ['rate'], message: 'the rate is too large' },
      ]),
    };
    show(<TaxesForm id={null} />);
    const user = await typeAndSubmit('VAT');
    await confirmSave(user);
    await closed();
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.tax_add_edit_rate}: ${EN.rate_invalid}`);
    expect(document.body.textContent).not.toContain('the rate is too large');
  });
});

describe('TaxesForm: a tax Perfex would not let you change opens read-only (D-21)', () => {
  /** Opens record a1 with `patch` applied to it, from a permalink. */
  const openLocked = async (patch: Partial<Taxes>) => {
    pathname.value = '/setup/taxes/a1';
    api.record = { status: HTTP_OK, body: { ...ALPHA, ...patch } };
    show(<TaxesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Alpha' });
    return screen.findByTestId('taxes-locked');
  };
  const paragraphs = (notice: HTMLElement) =>
    [...notice.querySelectorAll('p')].map((p) => p.textContent);

  it('Locked: a tax expenses use shows tax_is_used_in_expenses_warning, both fields disabled, no submit, and Back to list stays', async () => {
    const notice = await openLocked({ usage: { ...NO_USE, expenses: 1 } });
    expect(paragraphs(notice)).toEqual([EN.tax_is_used_in_expenses_warning]);
    expect(await nameBox()).toHaveProperty('disabled', true);
    expect(await rateBox()).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: SAVE })).toBeNull();
    expect(screen.getByRole('button', { name: COMMON.back_to_list })).toBeTruthy();
  });

  it('a tax subscriptions use shows tax_is_used_in_subscriptions_warning', async () => {
    const notice = await openLocked({ usage: { ...NO_USE, subscriptions: 2 } });
    expect(paragraphs(notice)).toEqual([EN.tax_is_used_in_subscriptions_warning]);
    expect(screen.queryByRole('button', { name: SAVE })).toBeNull();
  });

  it('DefaultTax: a default tax in Settings shows default_tax_warning and no submit', async () => {
    const notice = await openLocked({ isDefault: true });
    expect(paragraphs(notice)).toEqual([EN.default_tax_warning]);
    expect(screen.queryByRole('button', { name: SAVE })).toBeNull();
  });

  it('all three at once show the three lines in order: expenses, subscriptions, then the default', async () => {
    const notice = await openLocked({
      usage: { ...NO_USE, expenses: 1, subscriptions: 1 },
      isDefault: true,
    });
    expect(paragraphs(notice)).toEqual([
      EN.tax_is_used_in_expenses_warning,
      EN.tax_is_used_in_subscriptions_warning,
      EN.default_tax_warning,
    ]);
  });

  it('a tax only items, lines or accounting use stays editable: those block a delete, never an edit (Perfex)', async () => {
    pathname.value = '/setup/taxes/a1';
    api.record = {
      status: HTTP_OK,
      body: { ...ALPHA, usage: { ...NO_USE, items: 4, purchaseLines: 2, accounting: 1 } },
    };
    show(<TaxesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Alpha' });
    expect(screen.queryByTestId('taxes-locked')).toBeNull();
    expect(await nameBox()).toHaveProperty('disabled', false);
  });

  it('a locked row opened from the list is read-only at once, from the seeded row, before the record answers', async () => {
    pathname.value = '/setup/taxes/l7';
    api.record = 'pending';
    seedRow('/api/v1/taxes/l7', { ...ALPHA, id: 'l7', isDefault: true });
    show(<TaxesForm id="l7" />, undefined, GLOBAL);
    const notice = await screen.findByTestId('taxes-locked');
    expect(notice.textContent).toContain(EN.default_tax_warning);
    expect(await nameBox()).toHaveProperty('disabled', true);
  });

  it('Loading: no warning, error or form while a permalink record is unknown (D-39)', async () => {
    pathname.value = '/setup/taxes/a1';
    api.record = 'pending';
    show(<TaxesForm id="a1" />);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(screen.queryByTestId('taxes-locked')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
