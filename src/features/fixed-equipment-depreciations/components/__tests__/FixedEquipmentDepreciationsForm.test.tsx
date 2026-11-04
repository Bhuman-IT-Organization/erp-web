// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@/config/permissions';
import { fixedEquipmentDepreciationsHooks } from '@/features/fixed-equipment-depreciations/api/fixed-equipment-depreciations.endpoints';
import type { FixedEquipmentDepreciations } from '@/features/fixed-equipment-depreciations/schemas/fixed-equipment-depreciations.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { seedRow } from '@/lib/api/row-seed';
import { clearSession, setSession } from '@/lib/auth/session';
import { BreadcrumbCrumbsContext, type PageCrumb } from '@/lib/hooks/use-breadcrumb-label';
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
import {
  FixedEquipmentDepreciationsForm,
  GuardedFixedEquipmentDepreciationsForm,
} from '../FixedEquipmentDepreciationsForm';

/**
 * The form on `SchemaForm`: the verb + noun labels, the save summary (only real changes; "None" for
 * a record with no term), where a failure shows, the return to the list (no list request after an
 * edit from the list, a re-read after a permalink edit), the discard question, Perfex's two fields
 * (Depreciation Name: required, trimmed, at most 200, any character; Number of Months: required, a
 * whole number greater than 0 the api can store, sent as a number), its own breadcrumb crumbs, the
 * read-only form without the code to save, and the guard on any view or view-own code of the tab's
 * five groups. The transport is a fake axios adapter on the shared instance.
 */
const EN = en['fixed-equipment-depreciations'];
const AR = ar['fixed-equipment-depreciations'];
const COMMON = commonEn.common;
const CODES = PERMISSIONS.fixedEquipment.settingDepreciation;
const HTTP_OK = 200;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/fixed-equipment-depreciations';
const RECORD = '/api/v1/fixed-equipment-depreciations/a1';
const LIST_PAGE = '/setup/fixed-equipment-depreciations';
const ASSETS = PERMISSIONS.fixedEquipment.assets;

const push = vi.fn<(href: string) => void>();
const pathname = vi.hoisted(() => ({ value: '/setup/fixed-equipment-depreciations/new' }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const LINE: FixedEquipmentDepreciations = { id: 'a1', name: 'Straight line', term: 60 };
const LEGACY: FixedEquipmentDepreciations = { id: 'a1', name: 'Legacy', term: null };
const me = (isAdmin: boolean, permissions: readonly string[] = []) => ({
  staffId: 1,
  email: 'someone@example.invalid',
  firstName: 'Some',
  lastName: 'One',
  isAdmin,
  roleId: null,
  permissions,
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
          ? { status: HTTP_OK, body: { data: [LINE], meta: { nextCursor: null } } }
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
  const { data } = fixedEquipmentDepreciationsHooks.useList({ q, limit: 25 });
  return <output data-testid="list-probe">{data?.data.map((row) => row.name).join(',')}</output>;
}

const noun = EN.depreciation_lowercase;
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

/** The name field; by default it waits until the field is editable (the member's codes are known). */
const nameBox = async (editable = true) => {
  const box = await screen.findByRole('textbox', { name: EN.fe_depreciation_name });
  if (editable) {
    await waitFor(() => {
      expect(box).toHaveProperty('disabled', false);
    });
  }
  return box;
};
/** Perfex's `type="number"` input: a spinbutton to assistive technology. */
const monthsBox = async (editable = true) => {
  const box = await screen.findByRole('spinbutton', { name: EN.fe_number_of_months });
  if (editable) {
    await waitFor(() => {
      expect(box).toHaveProperty('disabled', false);
    });
  }
  return box;
};
/** The read-only form: no Save button at all. */
const noSave = (label: string) => {
  expect(screen.queryByRole('button', { name: label })).toBeNull();
};
/** Fills both fields, as a member does, and asks to save. */
async function typeAndSubmit(name: string, months = '60', submit = CREATE) {
  const user = userEvent.setup();
  const box = await nameBox();
  await user.clear(box);
  await user.click(box);
  await user.paste(name);
  const term = await monthsBox();
  await user.clear(term);
  if (months !== '') await user.type(term, months);
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
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  api = {
    me: { status: HTTP_OK, body: me(true) },
    record: { status: HTTP_OK, body: LINE },
    save: { status: HTTP_OK, body: { ...LINE, name: 'Five years' } },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  pathname.value = '/setup/fixed-equipment-depreciations/new';
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('FixedEquipmentDepreciationsForm: /new', () => {
  it("is titled fe_add_depreciations, with Perfex's two required fields in one Details section", async () => {
    show(<FixedEquipmentDepreciationsForm id={null} />);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      EN.fe_add_depreciations,
    );
    const name = await nameBox();
    expect(name).toHaveProperty('value', '');
    expect(name.getAttribute('aria-required')).toBe('true');
    const months = await monthsBox();
    expect(months).toHaveProperty('value', '');
    expect(months.getAttribute('aria-required')).toBe('true');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(EN.section_details);
  });

  it('refuses a blank name on the client: the field error, the focused summary, no request', async () => {
    show(<FixedEquipmentDepreciationsForm id={null} />);
    await nameBox();
    await typeAndSubmit('   ');
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.fe_depreciation_name}: ${EN.enter_name}`);
    await waitFor(() => {
      expect(document.activeElement).toBe(summary);
    });
    expect(saves()).toEqual([]);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('asks first, then sends one POST with { name, term } (the months as a number), revalidates the list pages and returns to the list URL it came from', async () => {
    sessionStorage.setItem(
      'erp.list.return:/setup/fixed-equipment-depreciations',
      JSON.stringify({ url: '/setup/fixed-equipment-depreciations?q=line' }),
    );
    api.save = { status: HTTP_OK, body: LINE };
    show(
      <>
        <ListProbe q="create-probe" />
        <FixedEquipmentDepreciationsForm id={null} />
      </>,
      undefined,
      GLOBAL,
    );
    await screen.findByText('Straight line', { selector: 'output' });
    const user = await typeAndSubmit('Straight line', '60');
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByRole('heading').textContent).toBe(
      COMMON.create_summary_title.replace('{noun}', noun).replace('{name}', 'Straight line'),
    );
    expect(saves()).toEqual([]);
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/fixed-equipment-depreciations?q=line', {
        scroll: false,
      });
    });
    expect(saves()).toEqual([
      { method: 'POST', path: LIST, body: { name: 'Straight line', term: 60 } },
    ]);
    expect(listReads()).toHaveLength(2);
  });

  it('Pending: once confirmed, the submit reads the creating label and is disabled', async () => {
    api.save = 'pending';
    show(<FixedEquipmentDepreciationsForm id={null} />);
    const user = await typeAndSubmit('Straight line');
    await confirmSave(user);
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: CREATING }).every((b) => b.hasAttribute('disabled')),
      ).toBe(true);
    });
  });
});

describe('FixedEquipmentDepreciationsForm: the name rules match Perfex (required, trimmed, at most 200)', () => {
  it('an Arabic name is accepted and sent as typed', async () => {
    api.save = { status: HTTP_OK, body: { id: 'a2', name: 'إهلاك ثابت', term: 24 } };
    show(<FixedEquipmentDepreciationsForm id={null} />);
    const user = await typeAndSubmit('إهلاك ثابت', '24');
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([
        { method: 'POST', path: LIST, body: { name: 'إهلاك ثابت', term: 24 } },
      ]);
    });
  });

  it('a one-character name and punctuation are accepted: Perfex has no minimum and no character rule', async () => {
    api.save = { status: HTTP_OK, body: { id: 'a3', name: 'D1!', term: 12 } };
    show(<FixedEquipmentDepreciationsForm id={null} />);
    const user = await typeAndSubmit('D1!', '12');
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([{ method: 'POST', path: LIST, body: { name: 'D1!', term: 12 } }]);
    });
  });

  it('the name is trimmed before it is sent', async () => {
    api.save = { status: HTTP_OK, body: LINE };
    show(<FixedEquipmentDepreciationsForm id={null} />);
    const user = await typeAndSubmit('  Straight line  ');
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([
        { method: 'POST', path: LIST, body: { name: 'Straight line', term: 60 } },
      ]);
    });
  });

  it('201 characters are refused on the client with name_too_long (max 200), and nothing is sent', async () => {
    show(<FixedEquipmentDepreciationsForm id={null} />);
    await nameBox();
    await typeAndSubmit('x'.repeat(201));
    const expected = EN.name_too_long.replace('{maxN}', '200');
    expect((await screen.findAllByText(expected)).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(saves()).toEqual([]);
  });

  it('exactly 200 characters are accepted', async () => {
    show(<FixedEquipmentDepreciationsForm id={null} />);
    await nameBox();
    await typeAndSubmit('x'.repeat(200));
    expect(await screen.findByTestId('confirm-dialog')).toBeTruthy();
  });

  it('a name another depreciation already holds is saved, as in Perfex: one POST, back to the list', async () => {
    api.save = { status: HTTP_OK, body: { ...LINE, id: 'a9' } };
    show(<FixedEquipmentDepreciationsForm id={null} />);
    const user = await typeAndSubmit('Straight line');
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(LIST_PAGE, { scroll: false });
    });
    expect(saves()).toHaveLength(1);
  });

  it('a record whose name holds markup is shown as text in the title and the field', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/a1';
    api.record = { status: HTTP_OK, body: { ...LINE, name: '<b>x</b>' } };
    show(<FixedEquipmentDepreciationsForm id="a1" />);
    expect(await screen.findByRole('heading', { level: 1, name: '<b>x</b>' })).toBeTruthy();
    expect(await nameBox()).toHaveProperty('value', '<b>x</b>');
    expect(document.querySelector('b')).toBeNull();
  });
});

describe('FixedEquipmentDepreciationsForm: the number of months', () => {
  it('an empty number of months is refused on the client with enter_months, and nothing is sent', async () => {
    show(<FixedEquipmentDepreciationsForm id={null} />);
    await typeAndSubmit('Straight line', '');
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.fe_number_of_months}: ${EN.enter_months}`);
    expect(saves()).toEqual([]);
  });

  it.each(['0', '1.5'])(
    '"%s" is refused with months_whole, and nothing is sent',
    async (months) => {
      show(<FixedEquipmentDepreciationsForm id={null} />);
      await typeAndSubmit('Straight line', months);
      const summary = await screen.findByTestId('error-summary');
      expect(summary.textContent).toContain(`${EN.fe_number_of_months}: ${EN.months_whole}`);
      expect(saves()).toEqual([]);
    },
  );

  it('21 digits are refused with months_too_large on the client, and nothing is sent', async () => {
    show(<FixedEquipmentDepreciationsForm id={null} />);
    await typeAndSubmit('Straight line', '1'.repeat(21));
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.fe_number_of_months}: ${EN.months_too_large}`);
    expect(saves()).toEqual([]);
  });

  it('an old row with no term: saving another change shows enter_months under the months and sends nothing', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/a1';
    api.record = { status: HTTP_OK, body: LEGACY };
    show(<FixedEquipmentDepreciationsForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Legacy' });
    expect(await monthsBox()).toHaveProperty('value', '');
    await typeAndSubmit('Legacy renamed', '', SAVE);
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.fe_number_of_months}: ${EN.enter_months}`);
    expect(saves()).toEqual([]);
  });
});

describe('FixedEquipmentDepreciationsForm: when a save fails', () => {
  it('FieldErrors: a 400 with a term issue while the field holds a number shows months_whole, under the field and in the focused summary, never the api text', async () => {
    api.save = {
      status: BAD_REQUEST,
      body: problem(BAD_REQUEST, 'ERP-VALIDATION-0001', [
        { path: ['term'], message: 'raw server text' },
      ]),
    };
    show(<FixedEquipmentDepreciationsForm id={null} />);
    const user = await typeAndSubmit('Straight line');
    await confirmSave(user);
    await closed();
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.fe_number_of_months}: ${EN.months_whole}`);
    await settle();
    expect(document.activeElement).toBe(summary);
    expect(document.body.textContent).not.toContain('raw server text');
    expect(push).not.toHaveBeenCalled();
  });

  it('a 400 with a name issue shows enter_name under the name', async () => {
    api.save = {
      status: BAD_REQUEST,
      body: problem(BAD_REQUEST, 'ERP-VALIDATION-0001', [{ path: ['name'], message: 'x' }]),
    };
    show(<FixedEquipmentDepreciationsForm id={null} />);
    const user = await typeAndSubmit('Straight line');
    await confirmSave(user);
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.fe_depreciation_name}: ${EN.enter_name}`);
  });

  it.each([
    ['a malformed issues body', 'garbage'],
    ['an issue on a field the form does not have', [{ path: ['id'], message: 'x' }]],
  ])('a 400 with %s sets no field error', async (_label, issues) => {
    api.save = {
      status: BAD_REQUEST,
      body: problem(BAD_REQUEST, 'ERP-VALIDATION-0001', issues),
    };
    show(<FixedEquipmentDepreciationsForm id={null} />);
    const user = await typeAndSubmit('Straight line');
    await confirmSave(user);
    await closed();
    await settle();
    expect(document.body.textContent).not.toContain(EN.enter_name);
    expect(document.body.textContent).not.toContain(EN.enter_months);
    expect(document.body.textContent).not.toContain(EN.months_whole);
    expect(push).not.toHaveBeenCalled();
  });

  it('a save answered 403 ERP-AUTH-0005 (the member lost the code) stays inside the dialog: confirm disabled, nothing left', async () => {
    api.save = { status: FORBIDDEN, body: problem(FORBIDDEN, 'ERP-AUTH-0005') };
    show(<FixedEquipmentDepreciationsForm id={null} />);
    const user = await typeAndSubmit('Straight line');
    await confirmSave(user);
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).not.toBe('');
    expect(error.textContent).not.toMatch(/ERP-|403/);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByRole('textbox', { name: EN.fe_depreciation_name, hidden: true }),
    ).toHaveProperty('value', 'Straight line');
  });

  it('ServerError: a 503 closes the dialog, the alert keeps the edits and offers Retry, which re-sends without asking again', async () => {
    api.save = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<FixedEquipmentDepreciationsForm id={null} />);
    const user = await typeAndSubmit('Straight line');
    await confirmSave(user);
    await closed();
    const alert = await screen.findByTestId('form-server-error');
    expect(alert.textContent).toContain(COMMON.save_failed);
    expect(alert.textContent).not.toMatch(/ERP-|503/);
    expect(await nameBox()).toHaveProperty('value', 'Straight line');
    api.save = { status: HTTP_OK, body: LINE };
    await user.click(within(alert).getByRole('button', { name: COMMON.retry }));
    await waitFor(() => {
      expect(saves()).toHaveLength(2);
    });
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(LIST_PAGE, { scroll: false });
    });
  });
});

describe('FixedEquipmentDepreciationsForm: edit', () => {
  it('opened from the list: shows the record, names the change in the summary, sends one PATCH, and the list on screen shows the saved row with no list request', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/a1';
    seedRow(RECORD, LINE);
    show(
      <>
        <ListProbe q="edit-probe" />
        <FixedEquipmentDepreciationsForm id="a1" />
      </>,
      undefined,
      GLOBAL,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Straight line' })).toBeTruthy();
    await screen.findByText('Straight line', { selector: 'output' });
    const user = await typeAndSubmit('Five years', '60', SAVE);
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByTestId('confirm-dialog-changes').textContent).toBe(
      COMMON.change_from_to
        .replace('{label}', EN.fe_depreciation_name)
        .replace('{from}', 'Straight line')
        .replace('{to}', 'Five years'),
    );
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(LIST_PAGE, { scroll: false });
    });
    expect(saves()).toEqual([
      { method: 'PATCH', path: RECORD, body: { name: 'Five years', term: 60 } },
    ]);
    expect(screen.getByTestId('list-probe').textContent).toBe('Five years');
    expect(listReads()).toHaveLength(1);
  });

  it('a permalink edit (no row from the list) knows nothing the list row adds: after the save the list pages ask again', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/p1';
    api.record = { status: HTTP_OK, body: { ...LINE, id: 'p1' } };
    api.save = { status: HTTP_OK, body: { ...LINE, id: 'p1', name: 'Five years' } };
    show(
      <>
        <ListProbe q="permalink-probe" />
        <FixedEquipmentDepreciationsForm id="p1" />
      </>,
      undefined,
      GLOBAL,
    );
    await screen.findByRole('heading', { level: 1, name: 'Straight line' });
    await screen.findByText('Straight line', { selector: 'output' });
    const before = listReads().length;
    const user = await typeAndSubmit('Five years', '60', SAVE);
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(LIST_PAGE, { scroll: false });
    });
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
  });

  it('a change of the number of months alone is named in the summary', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/a1';
    api.save = { status: HTTP_OK, body: { ...LINE, term: 72 } };
    show(<FixedEquipmentDepreciationsForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Straight line' });
    const user = await typeAndSubmit('Straight line', '72', SAVE);
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByTestId('confirm-dialog-changes').textContent).toBe(
      COMMON.change_from_to
        .replace('{label}', EN.fe_number_of_months)
        .replace('{from}', '60')
        .replace('{to}', '72'),
    );
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([
        { method: 'PATCH', path: RECORD, body: { name: 'Straight line', term: 72 } },
      ]);
    });
  });

  it('typing 007 over 7 is no change to the months: the summary names only the real change, and the body sends 7', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/a1';
    api.record = { status: HTTP_OK, body: { ...LINE, term: 7 } };
    api.save = { status: HTTP_OK, body: { ...LINE, name: 'Seven', term: 7 } };
    show(<FixedEquipmentDepreciationsForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Straight line' });
    const user = await typeAndSubmit('Seven', '007', SAVE);
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByTestId('confirm-dialog-changes').textContent).toBe(
      COMMON.change_from_to
        .replace('{label}', EN.fe_depreciation_name)
        .replace('{from}', 'Straight line')
        .replace('{to}', 'Seven'),
    );
    expect(open.textContent).not.toContain('007');
    await confirmSave(user);
    await waitFor(() => {
      expect(saves()).toEqual([
        { method: 'PATCH', path: RECORD, body: { name: 'Seven', term: 7 } },
      ]);
    });
  });

  it('an old row with no term: the summary names the change from "None"', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/a1';
    api.record = { status: HTTP_OK, body: LEGACY };
    show(<FixedEquipmentDepreciationsForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Legacy' });
    await typeAndSubmit('Legacy', '12', SAVE);
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByTestId('confirm-dialog-changes').textContent).toBe(
      COMMON.change_from_to
        .replace('{label}', EN.fe_number_of_months)
        .replace('{from}', COMMON.none)
        .replace('{to}', '12'),
    );
  });

  it("a save answered 404 ERP-CORE-0004 (deleted meanwhile) stays inside the summary dialog in the feature's words, with its confirm disabled, and the form keeps the edits", async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/a1';
    api.save = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    show(<FixedEquipmentDepreciationsForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Straight line' });
    const user = await typeAndSubmit('Five years', '60', SAVE);
    await confirmSave(user);
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors['ERP-CORE-0004']);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    expect(push).not.toHaveBeenCalled();
    // Behind the modal dialog (hidden from the accessibility tree while it is open), the edit is kept.
    expect(
      screen.getByRole('textbox', { name: EN.fe_depreciation_name, hidden: true }),
    ).toHaveProperty('value', 'Five years');
  });
});

describe('FixedEquipmentDepreciationsForm: leaving (Discard)', () => {
  it('a dirty form asks "Discard changes?" before Back to list leaves', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/a1';
    show(<FixedEquipmentDepreciationsForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Straight line' });
    const user = userEvent.setup();
    await user.type(await nameBox(), ' 2');
    await user.click(screen.getByRole('button', { name: COMMON.back_to_list }));
    const open = await screen.findByTestId('confirm-dialog');
    expect(within(open).getByRole('heading').textContent).toBe(COMMON.discard_title);
    expect(push).not.toHaveBeenCalled();
  });

  it('confirming the discard leaves for the list', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/a1';
    show(<FixedEquipmentDepreciationsForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Straight line' });
    const user = userEvent.setup();
    await user.type(await nameBox(), ' 2');
    await user.click(screen.getByRole('button', { name: COMMON.back_to_list }));
    const open = await screen.findByTestId('confirm-dialog');
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(LIST_PAGE);
    });
  });

  it('a clean form leaves with no dialog', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/a1';
    show(<FixedEquipmentDepreciationsForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Straight line' });
    await userEvent.click(screen.getByRole('button', { name: COMMON.back_to_list }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(LIST_PAGE);
    });
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('on /new the discard question names the noun, as there is no record yet', async () => {
    show(<FixedEquipmentDepreciationsForm id={null} />);
    const user = userEvent.setup();
    await user.type(await nameBox(), 'Half typed');
    await user.click(screen.getByRole('button', { name: COMMON.back_to_list }));
    const open = await screen.findByTestId('confirm-dialog');
    expect(open.textContent).toContain(noun);
  });
});

describe('FixedEquipmentDepreciationsForm: a record that is not there', () => {
  const backLink = () => screen.getByRole('link', { name: COMMON.back_to_list });

  it('a permalink answered 404 ERP-CORE-0004 says so in plain words with no Retry, and Back to list to the recorded list URL', async () => {
    sessionStorage.setItem(
      'erp.list.return:/setup/fixed-equipment-depreciations',
      JSON.stringify({ url: '/setup/fixed-equipment-depreciations?q=line' }),
    );
    pathname.value = '/setup/fixed-equipment-depreciations/gone';
    api.record = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    show(<FixedEquipmentDepreciationsForm id="gone" />);
    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain(EN.errors['ERP-CORE-0004']);
    expect(error.textContent).not.toContain(COMMON.errors.unknown);
    expect(within(error).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(backLink().getAttribute('href')).toBe('/setup/fixed-equipment-depreciations?q=line');
  });

  it('a permalink whose read fails retryably (503): Retry AND Back to list (the list base when nothing is recorded)', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/gone';
    api.record = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<FixedEquipmentDepreciationsForm id="gone" />);
    await screen.findByTestId('inline-error');
    expect(screen.getByRole('button', { name: COMMON.retry })).toBeTruthy();
    expect(backLink().getAttribute('href')).toBe(LIST_PAGE);
  });

  it('opened from the list, the record answers 404: the whole page is the not-found state, never the form', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/s404';
    seedRow('/api/v1/fixed-equipment-depreciations/s404', { id: 's404', name: 'Seeded', term: 12 });
    api.record = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    show(<FixedEquipmentDepreciationsForm id="s404" />, undefined, GLOBAL);
    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain(EN.errors['ERP-CORE-0004']);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opened from the list, the record read fails retryably (503): the seeded form stays usable', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/s503';
    seedRow('/api/v1/fixed-equipment-depreciations/s503', { id: 's503', name: 'Seeded', term: 12 });
    api.record = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<FixedEquipmentDepreciationsForm id="s503" />, undefined, GLOBAL);
    expect(await nameBox()).toHaveProperty('value', 'Seeded');
    await settle();
    expect(screen.queryByTestId('inline-error')).toBeNull();
    expect(await monthsBox()).toHaveProperty('value', '12');
  });

  it('Loading: only the form skeleton while a permalink record is unknown', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/a1';
    api.record = 'pending';
    show(<FixedEquipmentDepreciationsForm id="a1" />);
    await settle();
    expect(screen.getByRole('status').getAttribute('data-variant')).toBe('form');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('FixedEquipmentDepreciationsForm: its own crumbs after the covering menu entry', () => {
  const published = vi.fn<(crumbs: readonly PageCrumb[] | null) => void>();
  const inShell = (ui: ReactElement) => (
    <BreadcrumbCrumbsContext.Provider value={published}>{ui}</BreadcrumbCrumbsContext.Provider>
  );
  /** The last crumbs published: Depreciations (a link to the list), then the page's own. */
  const lastCrumbs = () => published.mock.calls.at(-1)?.[0];
  const LIST_CRUMB = { label: EN.fe_depreciations, href: LIST_PAGE };
  beforeEach(() => {
    published.mockClear();
  });

  it('a row opened from the list: Depreciations, then its name before the record answers', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/b5';
    api.record = 'pending';
    seedRow('/api/v1/fixed-equipment-depreciations/b5', { id: 'b5', name: 'Seeded', term: 12 });
    show(inShell(<FixedEquipmentDepreciationsForm id="b5" />), undefined, GLOBAL);
    await waitFor(() => {
      expect(lastCrumbs()).toEqual([LIST_CRUMB, { label: 'Seeded' }]);
    });
  });

  it('a permalink answered 404: the last crumb is null once the not-found message shows, never a name', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/gone';
    api.record = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    show(inShell(<FixedEquipmentDepreciationsForm id="gone" />));
    await screen.findByTestId('inline-error');
    await waitFor(() => {
      expect(lastCrumbs()).toEqual([LIST_CRUMB, { label: null }]);
    });
  });

  it('a row opened from the list whose record answers 404: the last crumb is null with the not-found page', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/b404';
    seedRow('/api/v1/fixed-equipment-depreciations/b404', { id: 'b404', name: 'Seeded', term: 12 });
    api.record = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    show(inShell(<FixedEquipmentDepreciationsForm id="b404" />), undefined, GLOBAL);
    await screen.findByTestId('inline-error');
    await waitFor(() => {
      expect(lastCrumbs()).toEqual([LIST_CRUMB, { label: null }]);
    });
  });

  it('the create route (id null): Depreciations, then "Add Depreciations"', async () => {
    show(inShell(<FixedEquipmentDepreciationsForm id={null} />));
    await nameBox(false);
    await waitFor(() => {
      expect(lastCrumbs()).toEqual([LIST_CRUMB, { label: EN.fe_add_depreciations }]);
    });
  });
});

describe('FixedEquipmentDepreciationsForm: read-only without the code to save', () => {
  it('/new without create: the fields are locked and there is no Save; nothing can be sent', async () => {
    api.me = { status: HTTP_OK, body: me(false, [CODES.view]) };
    show(<FixedEquipmentDepreciationsForm id={null} />);
    const name = await nameBox(false);
    await settle();
    expect(name).toHaveProperty('disabled', true);
    expect(await monthsBox(false)).toHaveProperty('disabled', true);
    noSave(CREATE);
    expect(saves()).toEqual([]);
  });

  it('/:id without edit (opened from the row link): the record shows, locked, with no Save', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/a1';
    api.me = { status: HTTP_OK, body: me(false, [CODES.view, CODES.create]) };
    show(<FixedEquipmentDepreciationsForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Straight line' });
    const name = await nameBox(false);
    await settle();
    expect(name).toHaveProperty('value', 'Straight line');
    expect(name).toHaveProperty('disabled', true);
    noSave(SAVE);
    expect(saves()).toEqual([]);
  });

  it('/new with create: the form is editable, and Save works once something is typed', async () => {
    api.me = { status: HTTP_OK, body: me(false, [CODES.view, CODES.create]) };
    show(<FixedEquipmentDepreciationsForm id={null} />);
    const name = await nameBox();
    expect(name).toHaveProperty('disabled', false);
    await userEvent.type(name, 'Declining');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: CREATE }).hasAttribute('disabled')).toBe(false);
    });
  });

  it('/:id with edit: the form is editable', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/a1';
    api.me = { status: HTTP_OK, body: me(false, [CODES.view, CODES.edit]) };
    show(<FixedEquipmentDepreciationsForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Straight line' });
    expect(await nameBox()).toHaveProperty('disabled', false);
  });

  it('/new with only the assets group’s create: the form is editable (an item group may add)', async () => {
    api.me = { status: HTTP_OK, body: me(false, [ASSETS.view, ASSETS.create]) };
    show(<FixedEquipmentDepreciationsForm id={null} />);
    expect(await nameBox()).toHaveProperty('disabled', false);
  });

  it('/:id with only the assets group’s view: read-only, no Save', async () => {
    pathname.value = '/setup/fixed-equipment-depreciations/a1';
    api.me = { status: HTTP_OK, body: me(false, [ASSETS.view]) };
    show(<FixedEquipmentDepreciationsForm id="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Straight line' });
    const name = await nameBox(false);
    await settle();
    expect(name).toHaveProperty('disabled', true);
    noSave(SAVE);
  });
});

describe('GuardedFixedEquipmentDepreciationsForm and Arabic', () => {
  it('a member holding the view code opens /setup/fixed-equipment-depreciations/new', async () => {
    api.me = { status: HTTP_OK, body: me(false, [CODES.view, CODES.create]) };
    show(<GuardedFixedEquipmentDepreciationsForm id={null} />);
    expect(await nameBox()).toBeTruthy();
  });

  it('a member holding only the view-own code opens the form, read-only: no create, so no Save', async () => {
    api.me = { status: HTTP_OK, body: me(false, [CODES.viewOwn]) };
    show(<GuardedFixedEquipmentDepreciationsForm id={null} />);
    const name = await nameBox(false);
    await settle();
    expect(name).toHaveProperty('disabled', true);
    noSave(CREATE);
    expect(screen.queryByTestId('permission-refused')).toBeNull();
  });

  it('a member with neither view code is refused on /setup/fixed-equipment-depreciations/new', async () => {
    api.me = { status: HTTP_OK, body: me(false, [CODES.create]) };
    show(<GuardedFixedEquipmentDepreciationsForm id={null} />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders under ar with the Arabic title and field labels and no physical-direction class', async () => {
    const { container } = show(<FixedEquipmentDepreciationsForm id={null} />, 'ar');
    expect(await screen.findByRole('textbox', { name: AR.fe_depreciation_name })).toBeTruthy();
    expect(await screen.findByRole('spinbutton', { name: AR.fe_number_of_months })).toBeTruthy();
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      AR.fe_add_depreciations,
    );
    expect(document.documentElement.dir).toBe('rtl');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
