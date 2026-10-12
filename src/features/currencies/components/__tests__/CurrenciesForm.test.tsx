// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENCY_CODE_MAX } from '@/config/currency-code';
import { currenciesHooks } from '@/features/currencies/api/currencies.endpoints';
import type { Currencies } from '@/features/currencies/schemas/currencies.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { seedRow } from '@/lib/api/row-seed';
import { clearSession, setSession } from '@/lib/auth/session';
import { BreadcrumbLabelContext } from '@/lib/hooks/use-breadcrumb-label';
import { DEFAULT_FORMAT_SETTINGS } from '@/lib/i18n/format';
import { FormatSettingsProvider } from '@/lib/i18n/FormatSettingsProvider';
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
import { CurrenciesForm, GuardedCurrenciesForm } from '../CurrenciesForm';

/**
 * The form on `SchemaForm` (UIK-06): the verb + noun labels, the save summary (D-25.4), where a
 * failure shows (D-29), the return to the list with no list request after an edit (D-28, D-36),
 * the discard question (D-25.3) and the generated `ADMIN_GATE`. One `it` per FE-27 state: Pending,
 * FieldErrors, ServerError. The transport is a fake axios adapter on the shared instance.
 */
const EN = en.currencies;
const COMMON = commonEn.common;
const HTTP_OK = 200;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/currencies';
const RECORD = '/api/v1/currencies/a1';

const push = vi.fn<(href: string) => void>();
const pathname = vi.hoisted(() => ({ value: '/setup/currencies/new' }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const NO_USE: Currencies['usage'] = {
  invoices: 0,
  expenses: 0,
  proposals: 0,
  estimates: 0,
  customers: 0,
  creditNotes: 0,
  subscriptions: 0,
  purchaseOrders: 0,
  purchaseRequests: 0,
  purchaseQuotations: 0,
  purchaseInvoices: 0,
  debitNotes: 0,
  fafRequests: 0,
  vendors: 0,
  goodsReceipts: 0,
  goodsDeliveries: 0,
  packingLists: 0,
  orderReturns: 0,
  fixedEquipmentCarts: 0,
  payslipsFrom: 0,
  payslipsTo: 0,
  purchaseConvertedFrom: 0,
  purchaseConvertedTo: 0,
  fixedEquipmentLocations: 0,
};
const NO_LOCK: Currencies['lockUsage'] = { exchangeRates: 0, exchangeRateLogs: 0, payslipCodes: 0 };
const ALPHA: Currencies = {
  id: 'a1',
  name: 'ABC',
  symbol: 'A$',
  decimalSeparator: '.',
  thousandSeparator: ',',
  placement: 'before',
  isBase: false,
  usage: NO_USE,
  lockUsage: NO_LOCK,
  registeredUsage: {},
  canMakeBase: true,
};
/** The five fields of ALPHA as the form sends them. */
const ALPHA_BODY = {
  name: 'ABC',
  symbol: 'A$',
  decimalSeparator: '.',
  thousandSeparator: ',',
  placement: 'before',
};
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
  const { data } = currenciesHooks.useList({ q, limit: 25 });
  return <output data-testid="list-probe">{data?.data.map((row) => row.name).join(',')}</output>;
}
const CREATE = COMMON.create_noun.replace('{noun}', EN.currency_lowercase);
const CREATING = COMMON.creating_noun.replace('{noun}', EN.currency_lowercase);
const SAVE = COMMON.save_noun.replace('{noun}', EN.currency_lowercase);

const ISOLATED = { provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 };
const GLOBAL = { shouldRetryOnError: false, dedupingInterval: 0 };

function show(ui: ReactElement, locale?: 'ar', swr: typeof GLOBAL = ISOLATED) {
  return renderWithProviders(<SWRConfig value={swr}>{ui}</SWRConfig>, {
    hasMemory: true,
    ...(locale === undefined ? {} : { locale }),
  });
}

const nameBox = () => screen.findByRole('textbox', { name: EN.currency_add_edit_description });
const symbolBox = () => screen.findByRole('textbox', { name: EN.currency_add_edit_rate });
/** Types a code (and, on /new, the symbol ALPHA has), as a member does, and asks to save. */
async function typeAndSubmit(value: string, submit = CREATE) {
  const user = userEvent.setup();
  const box = await nameBox();
  await user.clear(box);
  await user.type(box, value);
  if (submit === CREATE) await user.type(await symbolBox(), 'A$');
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
    save: { status: HTTP_OK, body: { ...ALPHA, name: 'XYZ' } },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  pathname.value = '/setup/currencies/new';
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('CurrenciesForm: create (D-25.4, D-28)', () => {
  it('marks Name required and refuses a blank name on the client: the field error, the focused summary, no request', async () => {
    show(<CurrenciesForm id={null} />);
    expect((await nameBox()).getAttribute('aria-required')).toBe('true');
    // A clean form cannot be submitted (the save bar); spaces make it dirty and still blank.
    await typeAndSubmit('   ');
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.currency_add_edit_description}: ${EN.enter_name}`);
    await waitFor(() => {
      expect(document.activeElement).toBe(summary);
    });
    expect(saves()).toEqual([]);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('asks first, "Create currency ABC?", then sends one POST, revalidates the list pages and returns to the list URL it came from', async () => {
    sessionStorage.setItem(
      'erp.list.return:/setup/currencies',
      JSON.stringify({ url: '/setup/currencies?q=al' }),
    );
    api.save = { status: HTTP_OK, body: ALPHA };
    show(
      <>
        <ListProbe q="create-probe" />
        <CurrenciesForm id={null} />
      </>,
      undefined,
      GLOBAL,
    );
    await screen.findByText('ABC', { selector: 'output' });
    const user = await typeAndSubmit('ABC');
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByRole('heading').textContent).toBe(
      COMMON.create_summary_title.replace('{noun}', EN.currency_lowercase).replace('{name}', 'ABC'),
    );
    expect(within(open).getByTestId('confirm-dialog-dismiss').textContent).toBe(
      COMMON.back_to_form,
    );
    expect(saves()).toEqual([]);
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/currencies?q=al', { scroll: false });
    });
    expect(saves()).toEqual([{ method: 'POST', path: LIST, body: ALPHA_BODY }]);
    // A new record moves totals and positions: the mounted list page asks again.
    expect(listReads()).toHaveLength(2);
  });

  it('Pending: once confirmed, the submit reads "Creating currency…" and is disabled', async () => {
    api.save = 'pending';
    show(<CurrenciesForm id={null} />);
    const user = await typeAndSubmit('ABC');
    await confirmSave(user);
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: CREATING }).every((b) => b.hasAttribute('disabled')),
      ).toBe(true);
    });
  });
});

describe('CurrenciesForm: when a save fails (D-29)', () => {
  it('FieldErrors: a 400 with a name issue closes the dialog, shows the key under Name and in the focused summary, never the api text', async () => {
    api.save = {
      status: BAD_REQUEST,
      body: problem(BAD_REQUEST, 'ERP-VALIDATION-0001', [
        { path: ['name'], message: 'raw server text' },
      ]),
    };
    show(<CurrenciesForm id={null} />);
    const user = await typeAndSubmit('ABC');
    await confirmSave(user);
    await closed();
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.currency_add_edit_description}: ${EN.enter_name}`);
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
    show(<CurrenciesForm id={null} />);
    const user = await typeAndSubmit('ABC');
    await confirmSave(user);
    await closed();
    const alert = await screen.findByTestId('form-server-error');
    expect(alert.textContent).toContain(COMMON.save_failed);
    expect(alert.textContent).not.toMatch(/ERP-|503/);
    expect(await nameBox()).toHaveProperty('value', 'ABC');
    api.save = { status: HTTP_OK, body: ALPHA };
    await user.click(within(alert).getByRole('button', { name: COMMON.retry }));
    await waitFor(() => {
      expect(saves()).toHaveLength(2);
    });
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/currencies', { scroll: false });
    });
  });
});

describe('CurrenciesForm: edit (D-25.4, D-36, D-25.3)', () => {
  it('opened from the list: shows the record, names the change in the summary, sends one PATCH, and the list page on screen shows the saved row with no list request (D-36)', async () => {
    pathname.value = '/setup/currencies/a1';
    seedRow(RECORD, ALPHA);
    show(
      <>
        <ListProbe q="edit-probe" />
        <CurrenciesForm id="a1" />
      </>,
      undefined,
      GLOBAL,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'ABC' })).toBeTruthy();
    await screen.findByText('ABC', { selector: 'output' });
    const user = await typeAndSubmit('XYZ', SAVE);
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByTestId('confirm-dialog-changes').textContent).toBe(
      COMMON.change_from_to
        .replace('{label}', EN.currency_add_edit_description)
        .replace('{from}', 'ABC')
        .replace('{to}', 'XYZ'),
    );
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/currencies', { scroll: false });
    });
    expect(saves()).toEqual([
      { method: 'PATCH', path: RECORD, body: { ...ALPHA_BODY, name: 'XYZ' } },
    ]);
    expect(screen.getByTestId('list-probe').textContent).toBe('XYZ');
    expect(listReads()).toHaveLength(1);
  });

  it('a permalink edit (no row from the list) knows nothing the list row adds, so after the save the list pages ask again rather than lose it', async () => {
    // An id no other test seeds: the app's one cache holds no row for it.
    pathname.value = '/setup/currencies/p9';
    api.record = { status: HTTP_OK, body: { ...ALPHA, id: 'p9' } };
    api.save = { status: HTTP_OK, body: { ...ALPHA, id: 'p9', name: 'XYZ' } };
    show(
      <>
        <ListProbe q="permalink-probe" />
        <CurrenciesForm id="p9" />
      </>,
      undefined,
      GLOBAL,
    );
    await screen.findByText('ABC', { selector: 'output' });
    const user = await typeAndSubmit('XYZ', SAVE);
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/currencies', { scroll: false });
    });
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(1);
    });
  });

  it("a save answered 404 ERP-CORE-0004 (deleted meanwhile) stays inside the summary dialog in the feature's words, with its confirm disabled, and the form keeps the edits (D-32)", async () => {
    pathname.value = '/setup/currencies/a1';
    api.save = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    show(<CurrenciesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'ABC' });
    const user = await typeAndSubmit('XYZ', SAVE);
    await confirmSave(user);
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors['ERP-CORE-0004']);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    expect(push).not.toHaveBeenCalled();
    // Behind the modal dialog (hidden from the accessibility tree while it is open), the edit is kept.
    expect(
      screen.getByRole('textbox', { name: EN.currency_add_edit_description, hidden: true }),
    ).toHaveProperty('value', 'XYZ');
  });

  it('a dirty form asks "Discard changes?" before Back to list leaves', async () => {
    pathname.value = '/setup/currencies/a1';
    show(<CurrenciesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'ABC' });
    const user = userEvent.setup();
    await user.type(await nameBox(), ' 2');
    await user.click(screen.getByRole('button', { name: COMMON.back_to_list }));
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByRole('heading').textContent).toBe(COMMON.discard_title);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('CurrenciesForm: a record that is not there (D-32, D-39)', () => {
  const backLink = () => screen.getByRole('link', { name: COMMON.back_to_list });
  /** Opens record `id` from the list: its row seeded in the app's one cache (`GLOBAL`). */
  const openSeeded = (id: string) => {
    pathname.value = `/setup/currencies/${id}`;
    seedRow(`/api/v1/currencies/${id}`, { ...ALPHA, id });
    show(<CurrenciesForm id={id} />, undefined, GLOBAL);
  };

  it('a permalink answered 404 ERP-CORE-0004 says so in plain words: never "Something went wrong": with no Retry, and Back to list to the recorded list URL', async () => {
    sessionStorage.setItem(
      'erp.list.return:/setup/currencies',
      JSON.stringify({ url: '/setup/currencies?q=al' }),
    );
    pathname.value = '/setup/currencies/gone';
    api.record = { status: 404, body: problem(404, 'ERP-CORE-0004') };
    show(<CurrenciesForm id="gone" />);
    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain(EN.errors['ERP-CORE-0004']);
    expect(error.textContent).not.toContain(COMMON.errors.unknown);
    expect(within(error).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(backLink().getAttribute('href')).toBe('/setup/currencies?q=al');
  });

  it('a permalink whose read fails retryably (503): Retry AND Back to list: the list base when nothing is recorded', async () => {
    pathname.value = '/setup/currencies/gone';
    api.record = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<CurrenciesForm id="gone" />);
    await screen.findByTestId('inline-error');
    expect(screen.getByRole('button', { name: COMMON.retry })).toBeTruthy();
    expect(backLink().getAttribute('href')).toBe('/setup/currencies');
  });

  it('opened from the list, the record answers 404: the whole page is the not-found state with Back to list: never the seeded form', async () => {
    api.record = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    openSeeded('x3');
    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain(EN.errors['ERP-CORE-0004']);
    expect(backLink().getAttribute('href')).toBe('/setup/currencies');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opened from the list, the record read fails retryably (503): the seeded form stays usable: the row is the whole record', async () => {
    api.record = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    openSeeded('x4');
    await waitFor(() => {
      expect(requests.some((r) => r.path === '/api/v1/currencies/x4')).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const box = await nameBox();
    expect(box).toHaveProperty('value', 'ABC');
    expect(box).toHaveProperty('disabled', false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a code over the shared CURRENCY_CODE_MAX is refused on the client with name_too_long, and nothing is sent (row 228)', async () => {
    show(<CurrenciesForm id={null} />);
    const user = userEvent.setup();
    const box = await nameBox();
    await user.click(box);
    await user.paste('x'.repeat(CURRENCY_CODE_MAX + 1));
    await user.click(screen.getByRole('button', { name: CREATE }));
    const expected = EN.name_too_long.replace('{max}', String(CURRENCY_CODE_MAX));
    expect((await screen.findAllByText(expected)).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(saves()).toEqual([]);
  });
});

describe('CurrenciesForm: the page title and the breadcrumb label (D-16, WR-10, D-39)', () => {
  /** The shell's setter, as `PageShell` provides it: every label the form publishes, in order. */
  const published = vi.fn<(label: string | null | undefined) => void>();
  const inShell = (ui: ReactElement) => (
    <BreadcrumbLabelContext.Provider value={published}>{ui}</BreadcrumbLabelContext.Provider>
  );
  const labels = () => published.mock.calls.map(([label]) => label);
  const names = () => labels().filter((label) => typeof label === 'string');
  /** Opens record `id` from the list: its row seeded in the app's one cache, under its own name. */
  const openSeededAs = (id: string, name: string) => {
    pathname.value = `/setup/currencies/${id}`;
    seedRow(`/api/v1/currencies/${id}`, { ...ALPHA, id, name });
    show(inShell(<CurrenciesForm id={id} />), undefined, GLOBAL);
  };

  beforeEach(() => {
    published.mockClear();
  });

  it('the title is the 24px page title: text-2xl font-semibold (D-16)', async () => {
    show(<CurrenciesForm id={null} />);
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
    pathname.value = '/setup/currencies/gone';
    api.record = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    show(inShell(<CurrenciesForm id="gone" />));
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
    show(inShell(<CurrenciesForm id={null} />));
    const user = userEvent.setup();
    await user.type(await nameBox(), 'ABC');
    expect(published).toHaveBeenCalledWith(undefined);
    expect(names()).toEqual([]);
  });
});

describe('GuardedCurrenciesForm: the generated gate is ADMIN_GATE (fail closed)', () => {
  it('anyone but an administrator is refused on /setup/currencies/new', async () => {
    api.me = { status: HTTP_OK, body: me(false) };
    show(<GuardedCurrenciesForm id={null} />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('CurrenciesForm: Arabic (FE-20)', () => {
  it('renders under ar with the legacy label (English pack text until the reviewer signs it) and no physical-direction class', async () => {
    const { container } = show(<CurrenciesForm id={null} />, 'ar');
    expect(
      await screen.findByRole('textbox', { name: EN.currency_add_edit_description }),
    ).toBeTruthy();
    expect(document.documentElement.dir).toBe('rtl');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});

/** The deployment's number format, as the shell provides it from branding (D-33). */
const withFormat = (decimalSeparator: string, thousandSeparator: string, ui: ReactElement) => (
  <FormatSettingsProvider
    settings={{ ...DEFAULT_FORMAT_SETTINGS, decimalSeparator, thousandSeparator }}
  >
    {ui}
  </FormatSettingsProvider>
);
/** A radio group of the form by its label (the required mark is aria-hidden). */
const groupOf = (label: string) => screen.getByRole('radiogroup', { name: label });
/** The checked option's label of a radio group, or null while no choice is made. */
const checkedIn = (label: string): string | null => {
  const checked = within(groupOf(label))
    .getAllByRole('radio')
    .find((radio) => radio.getAttribute('aria-checked') === 'true');
  return checked === undefined ? null : (checked.closest('label')?.textContent ?? '');
};
const pick = async (user: ReturnType<typeof userEvent.setup>, label: string, option: string) => {
  await user.click(within(groupOf(label)).getByRole('radio', { name: option }));
};
const DECIMAL = EN.settings_sales_decimal_separator;
const THOUSAND = EN.settings_sales_thousand_separator;
const PLACEMENT = EN.settings_sales_currency_placement;

describe("CurrenciesForm: Perfex's five fields (D-38, manage.php)", () => {
  it('/new is titled "Add New Currency", shows Perfex\'s code note above the fields, and has the five fields: the code (required, ISO Code placeholder), the symbol (required) and three radio groups', async () => {
    show(<CurrenciesForm id={null} />);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      EN.currency_add_heading,
    );
    const help = screen.getByTestId('currencies-code-help');
    expect(help.getAttribute('role')).toBe('note');
    expect(help.textContent).toBe(EN.currency_valid_code_help);
    const code = await nameBox();
    expect(code.getAttribute('aria-required')).toBe('true');
    expect(code.getAttribute('placeholder')).toBe(EN.iso_code);
    expect(help.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((await symbolBox()).getAttribute('aria-required')).toBe('true');
    expect(
      within(groupOf(DECIMAL))
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual([EN.separator_comma, EN.separator_period]);
    expect(
      within(groupOf(THOUSAND))
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual([
      EN.separator_comma,
      EN.separator_period,
      EN.separator_apostrophe,
      EN.separator_none,
      EN.separator_space,
    ]);
    expect(
      within(groupOf(PLACEMENT))
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual([
      EN.settings_sales_currency_placement_before,
      EN.settings_sales_currency_placement_after,
    ]);
    expect(screen.queryByTestId('currencies-code-locked')).toBeNull();
  });

  it('/new seeds the placement Before Amount and both separators from the deployment\'s format ("," and "."), as Perfex\'s modal does', async () => {
    show(withFormat(',', '.', <CurrenciesForm id={null} />));
    await nameBox();
    expect(checkedIn(PLACEMENT)).toBe(EN.settings_sales_currency_placement_before);
    expect(checkedIn(DECIMAL)).toBe(EN.separator_comma);
    expect(checkedIn(THOUSAND)).toBe(EN.separator_period);
  });

  it('/new seeds the other way round too ("." and ","), and sends what it shows', async () => {
    api.save = { status: HTTP_OK, body: ALPHA };
    show(withFormat('.', ',', <CurrenciesForm id={null} />));
    await nameBox();
    expect(checkedIn(DECIMAL)).toBe(EN.separator_period);
    expect(checkedIn(THOUSAND)).toBe(EN.separator_comma);
    const user = await typeAndSubmit('ABC');
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([{ method: 'POST', path: LIST, body: ALPHA_BODY }]);
    });
  });

  it('an empty submit shows enter_name and enter_symbol in the focused summary and sends nothing', async () => {
    show(<CurrenciesForm id={null} />);
    const user = userEvent.setup();
    // A clean form cannot be submitted (the save bar); a space makes it dirty and still blank.
    await user.type(await nameBox(), ' ');
    await user.click(screen.getByRole('button', { name: CREATE }));
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.currency_add_edit_description}: ${EN.enter_name}`);
    expect(summary.textContent).toContain(`${EN.currency_add_edit_rate}: ${EN.enter_symbol}`);
    expect(saves()).toEqual([]);
  });

  it('a symbol over 10 characters is refused with symbol_too_long and its {max}', async () => {
    show(<CurrenciesForm id={null} />);
    const user = userEvent.setup();
    await user.type(await nameBox(), 'ABC');
    await user.click(await symbolBox());
    await user.paste('x'.repeat(11));
    await user.click(screen.getByRole('button', { name: CREATE }));
    expect(
      (await screen.findAllByText(EN.symbol_too_long.replace('{max}', '10'))).length,
    ).toBeGreaterThan(0);
    expect(saves()).toEqual([]);
  });

  it('the code is upper-cased as the api stores it, and a code another currency holds is accepted (sent, as Perfex allows)', async () => {
    api.save = { status: HTTP_OK, body: { ...ALPHA, id: 'b2', name: 'USD' } };
    show(<CurrenciesForm id={null} />);
    const user = await typeAndSubmit('usd');
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByRole('heading').textContent).toBe(
      COMMON.create_summary_title.replace('{noun}', EN.currency_lowercase).replace('{name}', 'USD'),
    );
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([
        { method: 'POST', path: LIST, body: { ...ALPHA_BODY, name: 'USD' } },
      ]);
    });
  });

  it("the thousand separator's None and Space round-trip as '' and ' ' (the kit's radios carry None privately)", async () => {
    pathname.value = '/setup/currencies/a1';
    api.record = { status: HTTP_OK, body: { ...ALPHA, thousandSeparator: '' } };
    api.save = { status: HTTP_OK, body: { ...ALPHA, thousandSeparator: ' ' } };
    show(<CurrenciesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'ABC' });
    expect(checkedIn(THOUSAND)).toBe(EN.separator_none);
    const user = userEvent.setup();
    await pick(user, THOUSAND, EN.separator_space);
    await user.click(screen.getByRole('button', { name: SAVE }));
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([
        { method: 'PATCH', path: RECORD, body: { ...ALPHA_BODY, thousandSeparator: ' ' } },
      ]);
    });
  });

  it("choosing None sends '' as the thousand separator", async () => {
    pathname.value = '/setup/currencies/a1';
    show(<CurrenciesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'ABC' });
    const user = userEvent.setup();
    await pick(user, THOUSAND, EN.separator_none);
    expect(checkedIn(THOUSAND)).toBe(EN.separator_none);
    await user.click(screen.getByRole('button', { name: SAVE }));
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([
        { method: 'PATCH', path: RECORD, body: { ...ALPHA_BODY, thousandSeparator: '' } },
      ]);
    });
  });

  it('a record with NULL separators and placement opens with no choice made and refuses to save until one is made (Perfex requires them)', async () => {
    pathname.value = '/setup/currencies/a1';
    api.record = {
      status: HTTP_OK,
      body: { ...ALPHA, decimalSeparator: null, thousandSeparator: null, placement: null },
    };
    show(<CurrenciesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'ABC' });
    expect(checkedIn(DECIMAL)).toBeNull();
    expect(checkedIn(THOUSAND)).toBeNull();
    expect(checkedIn(PLACEMENT)).toBeNull();
    const user = userEvent.setup();
    await user.type(await symbolBox(), '2');
    await user.click(screen.getByRole('button', { name: SAVE }));
    const summary = await screen.findByTestId('error-summary');
    for (const label of [DECIMAL, THOUSAND, PLACEMENT]) {
      expect(summary.textContent).toContain(`${label}: ${EN.choose_option}`);
    }
    expect(saves()).toEqual([]);
    await pick(user, DECIMAL, EN.separator_period);
    await pick(user, THOUSAND, EN.separator_comma);
    await pick(user, PLACEMENT, EN.settings_sales_currency_placement_after);
    await user.click(screen.getByRole('button', { name: SAVE }));
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([
        {
          method: 'PATCH',
          path: RECORD,
          body: { ...ALPHA_BODY, symbol: 'A$2', placement: 'after' },
        },
      ]);
    });
  });

  it('SaveSummary on /:id lists each changed field by its label, a choice by its option labels', async () => {
    pathname.value = '/setup/currencies/a1';
    show(<CurrenciesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'ABC' });
    const user = userEvent.setup();
    await user.clear(await symbolBox());
    await user.type(await symbolBox(), 'B$');
    await pick(user, PLACEMENT, EN.settings_sales_currency_placement_after);
    await user.click(screen.getByRole('button', { name: SAVE }));
    const open = await screen.findByTestId('confirm-dialog');
    const line = (label: string, from: string, to: string) =>
      COMMON.change_from_to.replace('{label}', label).replace('{from}', from).replace('{to}', to);
    expect(within(open).getByTestId('confirm-dialog-changes').textContent).toBe(
      line(EN.currency_add_edit_rate, 'A$', 'B$') +
        line(
          PLACEMENT,
          EN.settings_sales_currency_placement_before,
          EN.settings_sales_currency_placement_after,
        ),
    );
  });
});

describe('CurrenciesForm: the code locked while anything uses the currency (D-42 widened, answers 2 and 8 c)', () => {
  it.each([
    ['two invoices', { usage: { ...NO_USE, invoices: 2 } }, ['2 invoices use this currency.']],
    [
      'only four exchange rates',
      { lockUsage: { ...NO_LOCK, exchangeRates: 4 } },
      ['4 exchange rates refer to this currency.'],
    ],
    [
      'only three registered uses (answer 8 c)',
      { registeredUsage: { samples: 3 } },
      ['3 records elsewhere in the application use this currency.'],
    ],
  ])(
    'CodeLocked by %s: the code is read-only, the note names each use and says what stays editable; the symbol, the separators and the placement stay editable',
    async (_name, uses, lines) => {
      pathname.value = '/setup/currencies/a1';
      api.record = { status: HTTP_OK, body: { ...ALPHA, ...uses } };
      show(<CurrenciesForm id="a1" />);
      await screen.findByRole('heading', { level: 1, name: 'ABC' });
      expect(await nameBox()).toHaveProperty('disabled', true);
      const note = screen.getByTestId('currencies-code-locked');
      expect(note.getAttribute('role')).toBe('status');
      expect([...note.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
        EN.code_locked_warning,
        ...lines,
      ]);
      expect(await symbolBox()).toHaveProperty('disabled', false);
      for (const label of [DECIMAL, THOUSAND, PLACEMENT]) {
        expect(
          within(groupOf(label))
            .getAllByRole('radio')
            .every((radio) => !radio.hasAttribute('disabled')),
        ).toBe(true);
      }
    },
  );

  it('the note lists the delete groups, then the lock groups, then the registered uses, in the api order', async () => {
    pathname.value = '/setup/currencies/a1';
    api.record = {
      status: HTTP_OK,
      body: {
        ...ALPHA,
        usage: { ...NO_USE, vendors: 1, invoices: 3 },
        lockUsage: { exchangeRates: 0, exchangeRateLogs: 2, payslipCodes: 1 },
        registeredUsage: { samples: 5 },
      },
    };
    show(<CurrenciesForm id="a1" />);
    const note = await screen.findByTestId('currencies-code-locked');
    expect([...note.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      EN.code_locked_warning,
      '3 invoices use this currency.',
      '1 vendor uses this currency.',
      '2 exchange rate log entries refer to this currency.',
      "1 payslip shows this currency's code.",
      '5 records elsewhere in the application use this currency.',
    ]);
  });

  it('a locked currency still saves its symbol, sending the stored code unchanged', async () => {
    pathname.value = '/setup/currencies/a1';
    api.record = { status: HTTP_OK, body: { ...ALPHA, registeredUsage: { samples: 3 } } };
    show(<CurrenciesForm id="a1" />);
    await screen.findByTestId('currencies-code-locked');
    const user = userEvent.setup();
    await user.type(await symbolBox(), '2');
    await user.click(screen.getByRole('button', { name: SAVE }));
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([
        { method: 'PATCH', path: RECORD, body: { ...ALPHA_BODY, symbol: 'A$2' } },
      ]);
    });
  });

  it('a live 409 ERP-CURRENCIES-0005 (the currency was put to use meanwhile) shows inside the save summary in the feature words, and the form keeps the edit', async () => {
    pathname.value = '/setup/currencies/a1';
    api.save = { status: CONFLICT, body: problem(CONFLICT, 'ERP-CURRENCIES-0005') };
    show(<CurrenciesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'ABC' });
    const user = await typeAndSubmit('XYZ', SAVE);
    await confirmSave(user);
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors['ERP-CURRENCIES-0005']);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it('a seeded locked row is read-only before its record answers (the list row carries the counts)', async () => {
    pathname.value = '/setup/currencies/l7';
    api.record = 'pending';
    seedRow('/api/v1/currencies/l7', {
      ...ALPHA,
      id: 'l7',
      lockUsage: { ...NO_LOCK, payslipCodes: 1 },
    });
    show(<CurrenciesForm id="l7" />, undefined, GLOBAL);
    expect(await screen.findByTestId('currencies-code-locked')).toBeTruthy();
    expect(await nameBox()).toHaveProperty('disabled', true);
  });

  it('an unused currency keeps the code editable and shows no lock note', async () => {
    pathname.value = '/setup/currencies/a1';
    show(<CurrenciesForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'ABC' });
    expect(await nameBox()).toHaveProperty('disabled', false);
    expect(screen.queryByTestId('currencies-code-locked')).toBeNull();
  });
});
