// @vitest-environment happy-dom
import { fireEvent } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  ListPageTemplate,
  type ListColumn,
  type ListPageTemplateProps,
} from '@/components/templates/ListPageTemplate';
import { Toaster } from '@/components/ui/sonner';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { messagesFor } from '@/messages';
import en from '@/messages/common/en.json';
import {
  physicalClassesIn,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import { columnClass, readDateTime } from '../EditableTable';
import type { EditableConfig, EditableSaveResult } from '../EditableTable';

/**
 * K6: the editable mode of `ListPageTemplate` (UI-SPEC § Editable table). The list is served by a
 * fake axios adapter on the shared instance (the real `useList` path); the save is a fake `save`
 * resolving each answer, so the batch body is asserted exactly. One `it` per story (FE-27).
 */
const COMMON = en.common;
const HTTP_OK = 200;
const SERVICE_UNAVAILABLE = 503;
const PATH = '/api/v1/demo/units';
const STALE_TEXT = 'These units were changed by someone else since you opened them.';

vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/units',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const unitSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  display: z.boolean(),
  note: z.string(),
  etag: z.string(),
});
type Unit = z.infer<typeof unitSchema>;

const units = (count: number): Unit[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    code: `U${String(i + 1)}`,
    name: `Unit ${String(i + 1)}`,
    display: true,
    note: '',
    etag: `e${String(i + 1)}`,
  }));

const levelSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  minimum: z.string(),
  maximum: z.string(),
  etag: z.string(),
});
type Level = z.infer<typeof levelSchema>;
const LEVELS: Level[] = [1, 2, 3].map((n) => ({
  id: n,
  name: `Item ${String(n)}`,
  minimum: String(n),
  maximum: String(n * 10),
  etag: `l${String(n)}`,
}));

const page = (data: readonly unknown[]) => ({
  data,
  meta: { nextCursor: 'n2', prevCursor: null, total: 40, rangeStart: 1 },
});

type Reply = { readonly status: number; readonly body: unknown } | 'pending';
let requests: URL[] = [];
let answer: (url: URL) => Reply = () => ({ status: HTTP_OK, body: page(units(3)) });
const ME = {
  staffId: 12,
  email: 'admin@example.invalid',
  firstName: 'Admin',
  lastName: 'Person',
  isAdmin: true,
  roleId: null,
  permissions: [],
  locale: null,
};

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  requests.push(url);
  const reply: Reply =
    url.pathname === '/api/v1/auth/me' ? { status: HTTP_OK, body: ME } : answer(url);
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
const listRequests = () => requests.filter((url) => url.pathname === PATH);

const save = vi.fn<(body: { readonly rows: readonly unknown[] }) => Promise<EditableSaveResult>>();
const OK: EditableSaveResult = { ok: true };
const refused = (status: number, code: string, issues?: unknown): EditableSaveResult => ({
  ok: false,
  status,
  code,
  retryAfterS: null,
  issues,
});

const UNIT_COLUMNS: readonly ListColumn<Unit>[] = [
  { id: 'id', header: 'ID', align: 'end', cell: (r) => String(r.id) },
  { id: 'code', header: 'Unit code', sortField: 'code', cell: (r) => r.code },
  { id: 'name', header: 'Unit Name', sortField: 'name', cell: (r) => r.name },
  {
    id: 'display',
    header: 'Display',
    hideBelow: 'md',
    cell: (r) => (r.display ? 'Display' : 'Not display'),
  },
  { id: 'note', header: 'Note', hideBelow: 'lg', cell: (r) => r.note },
];

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function unitConfig(overrides: Partial<EditableConfig<Unit>> = {}): EditableConfig<Unit> {
  return {
    mode: 'rows',
    columns: [
      { id: 'code', kind: 'text', label: 'Unit code' },
      { id: 'name', kind: 'text', label: 'Unit Name', required: true },
      { id: 'display', kind: 'checkbox', label: 'Display' },
      { id: 'note', kind: 'textarea', label: 'Note' },
    ],
    rowId: (r) => String(r.id),
    toDraft: (r) => ({ code: r.code, name: r.name, display: r.display, note: r.note }),
    etagOf: (r) => r.etag,
    blankDraft: () => ({ code: '', name: '', display: true, note: '' }),
    rowName: (draft) => text(draft.name),
    validate: (draft) => (text(draft.name).trim() === '' ? { name: 'Enter a unit name.' } : {}),
    issueText: () => 'The api refused this value.',
    save,
    labels: {
      listLabel: 'Units',
      submit: 'Save units',
      pending: 'Saving units…',
      savedToast: 'Units saved',
      addLabel: 'Add unit',
    },
    canEdit: true,
    canAdd: true,
    ...overrides,
  };
}

const EMPTY = {
  nothingYetHeading: 'No units yet',
  nothingYetBody: 'Add the first unit so items can use it.',
  noResultsHeading: (q: string) => `No units match “${q}”`,
  noResultsBody: 'Check the spelling or clear the search.',
};

function unitProps(config: EditableConfig<Unit> = unitConfig()): ListPageTemplateProps<Unit> {
  return {
    title: 'Units',
    path: PATH,
    rowSchema: unitSchema,
    listBase: '/setup/units',
    rowKey: (r) => String(r.id),
    rowHref: () => '/setup/units',
    recordName: (r) => r.name,
    columns: UNIT_COLUMNS,
    editable: config,
    empty: EMPTY,
    recordsNoun: 'units',
    featureErrors: { namespace: 'demo', codes: ['ERP-CORE-0013'] },
  };
}

function levelConfig(overrides: Partial<EditableConfig<Level>> = {}): EditableConfig<Level> {
  return {
    mode: 'grid',
    columns: [
      { id: 'minimum', kind: 'number', label: 'Minimum value' },
      { id: 'maximum', kind: 'number', label: 'Maximum Qty' },
    ],
    rowId: (r) => String(r.id),
    toDraft: (r) => ({ minimum: r.minimum, maximum: r.maximum }),
    etagOf: (r) => r.etag,
    rowName: () => '',
    validate: (draft) =>
      Object.fromEntries(
        Object.entries(draft)
          .filter(([, value]) => !/^\d*$/.test(text(value)))
          .map(([field]) => [field, COMMON.enter_number]),
      ),
    issueText: () => 'The api refused this value.',
    save,
    labels: {
      listLabel: 'Levels',
      submit: 'Save levels',
      pending: 'Saving levels…',
      savedToast: 'Levels saved',
    },
    canEdit: true,
    canAdd: false,
    bulkSet: {
      label: 'Set levels',
      title: 'Set levels',
      applyLabel: (count) => `Apply to ${String(count)} items`,
      columns: ['minimum', 'maximum'],
    },
    ...overrides,
  };
}

function levelProps(config: EditableConfig<Level> = levelConfig()): ListPageTemplateProps<Level> {
  return {
    title: 'Minimum, maximum levels',
    path: PATH,
    rowSchema: levelSchema,
    listBase: '/setup/levels',
    rowKey: (r) => String(r.id),
    rowHref: () => '/setup/levels',
    recordName: (r) => r.name,
    columns: [
      { id: 'id', header: 'ID', cell: (r) => String(r.id) },
      { id: 'name', header: 'Items Name', cell: (r) => r.name },
      {
        id: 'minimum',
        header: 'Minimum value',
        align: 'end',
        hideBelow: 'md',
        cell: (r) => r.minimum,
      },
      { id: 'maximum', header: 'Maximum Qty', align: 'end', cell: (r) => r.maximum },
    ],
    editable: config,
    empty: EMPTY,
    recordsNoun: 'items',
  };
}

const ISOLATED: SWRConfiguration = { provider: () => new Map(), shouldRetryOnError: false };

/** The page, a private SWR cache and a URL with memory; `demo` stands for the feature's own errors. */
function show(ui: ReactElement, options: { searchParams?: string; locale?: 'en' | 'ar' } = {}) {
  const locale = options.locale ?? 'en';
  const messages = {
    ...messagesFor(locale),
    demo: { errors: { 'ERP-CORE-0013': STALE_TEXT } },
  };
  return renderWithProviders(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <NuqsTestingAdapter searchParams={options.searchParams ?? ''} hasMemory>
        <SWRConfig value={ISOLATED}>
          {ui}
          <Toaster />
        </SWRConfig>
      </NuqsTestingAdapter>
    </NextIntlClientProvider>,
    { locale },
  );
}

const table = () => screen.findByTestId('editable-table');
const rowOf = (key: string) => {
  const row = document.querySelector(`[data-row-key="${key}"]`);
  if (!(row instanceof HTMLElement)) throw new Error(`no row ${key}`);
  return row;
};
const cell = (name: string) => screen.getByRole('textbox', { name });
const saveBar = () => screen.getByTestId('save-bar');

async function editUnit(n: number): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: `Edit Unit ${String(n)}` }));
}
async function retype(name: string, value: string): Promise<void> {
  const input = cell(name);
  await userEvent.clear(input);
  if (value !== '') await userEvent.type(input, value);
}

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  answer = () => ({ status: HTTP_OK, body: page(units(3)) });
  http.defaults.adapter = respond;
  save.mockReset();
  save.mockResolvedValue(OK);
  window.history.replaceState(null, '', '/setup/units');
});
afterEach(() => {
  toast.dismiss();
  clearSession();
  delete http.defaults.adapter;
  localStorage.clear();
});

describe('EditableTable: the states (D-39)', () => {
  it('Loading: the list skeleton and no message, no save bar, no stale or failure alert', () => {
    answer = () => 'pending';
    show(<ListPageTemplate {...unitProps()} />);
    expect(screen.getByTestId('list-loading')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('save-bar')).toBeNull();
    expect(screen.queryByTestId('editable-stale')).toBeNull();
  });

  it('Empty: "nothing yet" with the add button (not a create link); Add unit shows the table with one new row', async () => {
    answer = () => ({ status: HTTP_OK, body: page([]) });
    show(<ListPageTemplate {...unitProps()} />);
    const empty = await screen.findByTestId('list-empty');
    await userEvent.click(within(empty).getByRole('button', { name: 'Add unit' }));
    await table();
    expect(screen.queryByTestId('list-empty')).toBeNull();
    expect(screen.getAllByText(COMMON.row_new).length).toBeGreaterThan(0);
  });

  it('NoResults: a search that matched nothing is the ordinary "no results"', async () => {
    answer = () => ({ status: HTTP_OK, body: page([]) });
    show(<ListPageTemplate {...unitProps()} />, { searchParams: '?q=zzz' });
    expect(await screen.findByTestId('list-no-results')).toBeTruthy();
  });

  it('Error: a failed read is the inline list error with Retry', async () => {
    answer = () => ({
      status: SERVICE_UNAVAILABLE,
      body: { type: 'about:blank', status: SERVICE_UNAVAILABLE, code: 'ERP-UPSTREAM-0001' },
    });
    show(<ListPageTemplate {...unitProps()} />);
    expect(await screen.findByTestId('list-error')).toBeTruthy();
  });

  it('Loaded: read cells, the kit Edit per row (main) and the add button; no save bar while clean', async () => {
    show(<ListPageTemplate {...unitProps()} />);
    const grid = await table();
    expect(within(grid).getByText('Unit 2')).toBeTruthy();
    expect(within(grid).queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /^Edit Unit/ })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Add unit' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Add unit' })).toBeNull();
    expect(screen.queryByTestId('save-bar')).toBeNull();
  });
});

describe('EditableTable: rows mode (K6)', () => {
  it('a note cell keeps a usable width and an unset colour reads "None", never a black swatch alone', async () => {
    const config = unitConfig({
      columns: [...unitConfig().columns, { id: 'color', kind: 'color', label: 'Color hex' }],
    });
    show(
      <ListPageTemplate
        {...unitProps(config)}
        columns={[...UNIT_COLUMNS, { id: 'color', header: 'Color hex', cell: (r) => r.code }]}
      />,
    );
    await table();
    await userEvent.click(screen.getByRole('button', { name: 'Add unit' }));
    const row = rowOf('new-1');
    // The primitive sizes a textarea to its content: an empty note would collapse to a sliver.
    expect(
      within(row).getByRole('textbox', { name: `${COMMON.row_new}: Note` }).className,
    ).toContain('min-w-48');
    expect(within(row).getByText(COMMON.none)).toBeTruthy();
  });

  it('a choice or multiChoice column passes its emptyHint: an empty option list reads the hint and links to where one is created', async () => {
    const hint = (what: string) => ({
      text: `No ${what} yet.`,
      action: { label: `Create one in ${what}`, href: `/setup/${what}/new` },
    });
    const config = unitConfig({
      columns: [
        ...unitConfig().columns,
        { id: 'group', kind: 'choice', label: 'Group', options: [], emptyHint: hint('groups') },
        { id: 'tags', kind: 'multiChoice', label: 'Tags', options: [], emptyHint: hint('tags') },
      ],
    });
    show(
      <ListPageTemplate
        {...unitProps(config)}
        columns={[
          ...UNIT_COLUMNS,
          { id: 'group', header: 'Group', cell: () => '' },
          { id: 'tags', header: 'Tags', cell: () => '' },
        ]}
      />,
    );
    await table();
    await userEvent.click(screen.getByRole('button', { name: 'Add unit' }));
    const row = rowOf('new-1');
    for (const [column, what] of [
      ['Group', 'groups'],
      ['Tags', 'tags'],
    ] as const) {
      await userEvent.click(
        within(row).getByRole('combobox', { name: `${COMMON.row_new}: ${column}` }),
      );
      expect(screen.getByText(`No ${what} yet.`)).toBeTruthy();
      expect(screen.getByRole('link', { name: `Create one in ${what}` }).getAttribute('href')).toBe(
        `/setup/${what}/new`,
      );
      await userEvent.keyboard('{Escape}');
    }
  });

  it('Adding: blank rows at the top, the first input focused, "New" and Remove new row; Add another row under them', async () => {
    show(<ListPageTemplate {...unitProps()} />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: 'Add unit' }));
    const first = screen.getAllByRole('textbox', { name: `${COMMON.row_new}: Unit code` })[0];
    expect(document.activeElement).toBe(first);
    const body = rowOf('new-1').parentElement;
    expect(body?.firstElementChild).toBe(rowOf('new-1'));
    expect(within(rowOf('new-1')).getByText(COMMON.row_new)).toBeTruthy();
    expect(
      within(rowOf('new-1')).getByRole('button', { name: COMMON.remove_new_row }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: COMMON.add_another_row }));
    expect(body?.firstElementChild).toBe(rowOf('new-2'));
    expect(within(saveBar()).getByText('2 rows changed')).toBeTruthy();
    await userEvent.click(
      within(rowOf('new-2')).getByRole('button', { name: COMMON.remove_new_row }),
    );
    expect(within(saveBar()).getByText('1 row changed')).toBeTruthy();
  });

  it('Editing: Edit turns the row into 32px inputs named "{row}: {column}", muted, with Undo; several rows at once; Undo restores', async () => {
    show(<ListPageTemplate {...unitProps()} />);
    await editUnit(1);
    await editUnit(2);
    expect(cell('Unit 1: Unit Name').className).toContain('h-8');
    expect(cell('Unit 2: Unit code')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Unit 1: Display' })).toBeTruthy();
    expect(rowOf('1').className).toContain('bg-muted');
    expect(screen.queryByTestId('save-bar')).toBeNull();
    await retype('Unit 1: Unit Name', 'Unit One');
    expect(within(saveBar()).getByText('1 row changed')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Undo changes to Unit 1' }));
    expect(within(rowOf('1')).getByText('Unit 1')).toBeTruthy();
    expect(screen.queryByTestId('save-bar')).toBeNull();
  });

  it('CellErrors: a client error marks the cell and links "{row}: {column}" in Check these fields, with no request', async () => {
    show(<ListPageTemplate {...unitProps()} />);
    await editUnit(1);
    await retype('Unit 1: Unit Name', '');
    await userEvent.click(within(saveBar()).getByRole('button', { name: 'Save units' }));
    const input = cell('Unit 1: Unit Name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toBe('Enter a unit name.');
    const summary = screen.getByTestId('error-summary');
    expect(summary.textContent).toContain(COMMON.check_these_fields);
    const link = within(summary).getByRole('link', {
      name: 'Unit 1: Unit Name: Enter a unit name.',
    });
    await userEvent.click(link);
    expect(document.activeElement).toBe(input);
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('SaveSummary: "Added: {name}" and "{row}: {column}: {old} → {new}" lines; confirm sends { rows } exactly as toBatch; 200 toasts, clears and revalidates', async () => {
    show(<ListPageTemplate {...unitProps()} />);
    await editUnit(2);
    await retype('Unit 2: Unit Name', 'Unit Two');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Unit 2: Display' }));
    await userEvent.type(cell('Unit 2: Note'), 'Boxed');
    await userEvent.click(screen.getByRole('button', { name: 'Add unit' }));
    await userEvent.type(cell(`${COMMON.row_new}: Unit Name`), 'Crate');
    await userEvent.click(within(saveBar()).getByRole('button', { name: 'Save units' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Save changes to Units?');
    expect(within(dialog).getByTestId('confirm-dialog-changes').textContent).toBe(
      [
        'Added: Crate',
        'Unit 2: Unit Name: Unit 2 → Unit Two',
        'Unit 2: Display: Yes → No',
        'Unit 2: Note updated',
      ].join(''),
    );
    const before = listRequests().length;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save units' }));
    expect(save).toHaveBeenCalledWith({
      rows: [
        { code: '', name: 'Crate', display: true, note: '' },
        { code: 'U2', name: 'Unit Two', display: false, note: 'Boxed', id: 2, etag: 'e2' },
      ],
    });
    expect(await screen.findByText('Units saved')).toBeTruthy();
    expect(screen.queryByTestId('save-bar')).toBeNull();
    await waitFor(() => {
      expect(listRequests().length).toBeGreaterThan(before);
    });
  });

  it('SaveSummary: ten lines shown, then "Show {n} more"', async () => {
    // Blank rows that already carry a name, added by plain clicks: twelve rows typed key by key
    // outlast the test timeout under coverage.
    const named = unitConfig({
      blankDraft: () => ({ code: '', name: 'Box', display: true, note: '' }),
    });
    show(<ListPageTemplate {...unitProps(named)} />);
    await table();
    const add = screen.getByRole('button', { name: 'Add unit' });
    for (let i = 0; i < 12; i += 1) fireEvent.click(add);
    await userEvent.click(within(saveBar()).getByRole('button', { name: 'Save units' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(10);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show 2 more' }));
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(12);
  });

  it('a 400 with issues on [rows, 0, name] closes the summary and marks that cell', async () => {
    save.mockResolvedValue(
      refused(400, 'ERP-VALIDATION-0001', [{ path: ['rows', 0, 'name'], message: 'x' }]),
    );
    show(<ListPageTemplate {...unitProps()} />);
    await editUnit(1);
    await retype('Unit 1: Unit Name', 'Unit One');
    await userEvent.click(within(saveBar()).getByRole('button', { name: 'Save units' }));
    await userEvent.click(
      within(await screen.findByTestId('confirm-dialog')).getByRole('button', {
        name: 'Save units',
      }),
    );
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(cell('Unit 1: Unit Name').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('error-summary').textContent).toContain(
      'Unit 1: Unit Name: The api refused this value.',
    );
    expect(within(saveBar()).getByText('1 row changed')).toBeTruthy();
  });

  it('Stale: a 412 keeps every edit, marks the stale row, shows the alert with Reload list, and the summary refuses with the feature text', async () => {
    save.mockResolvedValue(refused(412, 'ERP-CORE-0013', [{ id: '2' }]));
    show(<ListPageTemplate {...unitProps()} />);
    await editUnit(1);
    await editUnit(2);
    await retype('Unit 1: Unit Name', 'Unit One');
    await retype('Unit 2: Unit Name', 'Unit Two');
    await userEvent.click(within(saveBar()).getByRole('button', { name: 'Save units' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save units' }));
    expect((await within(dialog).findByTestId('confirm-dialog-error')).textContent).toBe(
      STALE_TEXT,
    );
    expect(within(dialog).getByTestId('confirm-dialog-confirm')).toHaveProperty('disabled', true);
    const mark = within(rowOf('2')).getByText(COMMON.row_stale);
    expect(mark.parentElement?.querySelector('[data-icon-name="triangle-exclamation"]')).not.toBe(
      null,
    );
    expect(within(rowOf('1')).queryByText(COMMON.row_stale)).toBeNull();
    const alert = screen.getByTestId('editable-stale');
    expect(alert.textContent).toContain(
      '1 row was changed by someone else since you opened this list.',
    );
    expect(within(alert).getByText('Unit 2')).toBeTruthy();
    // The summary is still open (modal), so the page behind it is hidden from the tree for now.
    expect(
      within(alert).getByRole('button', { name: COMMON.reload_list, hidden: true }),
    ).toBeTruthy();
    // All or nothing (L-08): nothing was cleared.
    expect(within(saveBar()).getByText('2 rows changed')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Unit 1: Unit Name', hidden: true })).toHaveProperty(
      'value',
      'Unit One',
    );
  });

  it('Reload list goes through "Discard changes?", then clears the edits and reads the list again', async () => {
    save.mockResolvedValue(refused(412, 'ERP-CORE-0013', [{ id: '1' }]));
    show(<ListPageTemplate {...unitProps()} />);
    await editUnit(1);
    await retype('Unit 1: Unit Name', 'Unit One');
    await userEvent.click(within(saveBar()).getByRole('button', { name: 'Save units' }));
    const summary = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(summary).getByRole('button', { name: 'Save units' }));
    await within(summary).findByTestId('confirm-dialog-error');
    await userEvent.click(within(summary).getByRole('button', { name: COMMON.keep_editing }));
    const before = listRequests().length;
    await userEvent.click(
      within(screen.getByTestId('editable-stale')).getByRole('button', {
        name: COMMON.reload_list,
      }),
    );
    const discard = await screen.findByTestId('confirm-dialog');
    expect(within(discard).getByRole('heading').textContent).toBe(COMMON.discard_title);
    await userEvent.click(within(discard).getByRole('button', { name: COMMON.discard_changes }));
    await waitFor(() => {
      expect(listRequests().length).toBeGreaterThan(before);
    });
    expect(screen.queryByTestId('editable-stale')).toBeNull();
    expect(screen.queryByTestId('save-bar')).toBeNull();
  });

  it('a network failure closes the summary into the kit alert with Retry; every edit is kept and Retry re-sends the batch', async () => {
    save.mockResolvedValueOnce(refused(0, 'ERP-NETWORK-0001'));
    show(<ListPageTemplate {...unitProps()} />);
    await editUnit(1);
    await retype('Unit 1: Unit Name', 'Unit One');
    await userEvent.click(within(saveBar()).getByRole('button', { name: 'Save units' }));
    await userEvent.click(
      within(await screen.findByTestId('confirm-dialog')).getByRole('button', {
        name: 'Save units',
      }),
    );
    const failed = await screen.findByTestId('editable-save-failed');
    expect(failed.textContent).toContain(COMMON.save_failed);
    expect(cell('Unit 1: Unit Name')).toHaveProperty('value', 'Unit One');
    await userEvent.click(within(failed).getByRole('button', { name: COMMON.retry }));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
    expect(await screen.findByText('Units saved')).toBeTruthy();
  });

  it('Enter inside a row input opens the summary', async () => {
    show(<ListPageTemplate {...unitProps()} />);
    await editUnit(1);
    await retype('Unit 1: Unit Name', 'Unit One');
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByTestId('confirm-dialog')).toBeTruthy();
  });

  it('Discard changes on the save bar asks first, then clears every edit', async () => {
    show(<ListPageTemplate {...unitProps()} />);
    await editUnit(1);
    await retype('Unit 1: Unit Name', 'Unit One');
    await userEvent.click(within(saveBar()).getByRole('button', { name: COMMON.discard_changes }));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(COMMON.discard_title);
    await userEvent.click(within(dialog).getByRole('button', { name: COMMON.discard_changes }));
    await waitFor(() => {
      expect(screen.queryByTestId('save-bar')).toBeNull();
    });
    expect(within(rowOf('1')).getByText('Unit 1')).toBeTruthy();
  });

  it('AddOnly: existing rows show no Edit and no inputs; the add button still adds', async () => {
    show(<ListPageTemplate {...unitProps(unitConfig({ addOnly: true }))} />);
    await table();
    expect(screen.queryByRole('button', { name: /^Edit Unit/ })).toBeNull();
    expect(within(rowOf('1')).queryAllByRole('textbox')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Add unit' }));
    expect(within(rowOf('new-1')).getAllByRole('textbox').length).toBeGreaterThan(0);
  });

  it('labels: without overrides the bar reads "{count} rows changed" and the title "Save changes to Units?"; CustomCountLabel and CustomSummaryTitle replace them', async () => {
    const labels = unitConfig().labels;
    show(
      <ListPageTemplate
        {...unitProps(
          unitConfig({
            labels: {
              ...labels,
              countLabel: (n) => `${String(n)} items changed`,
              summaryTitle: (n) => `Save levels for ${String(n)} items?`,
            },
          }),
        )}
      />,
    );
    await editUnit(1);
    await editUnit(2);
    await retype('Unit 1: Unit Name', 'A');
    await retype('Unit 2: Unit Name', 'B');
    expect(within(saveBar()).getByText('2 items changed')).toBeTruthy();
    await userEvent.click(within(saveBar()).getByRole('button', { name: 'Save units' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Save levels for 2 items?');
  });

  it('summaryBody (opt-in, 04.6-15): one line under the title; absent, none', async () => {
    const labels = unitConfig().labels;
    show(
      <ListPageTemplate
        {...unitProps(unitConfig({ labels: { ...labels, summaryBody: 'Each change is logged.' } }))}
      />,
    );
    await editUnit(1);
    await retype('Unit 1: Unit Name', 'A');
    await userEvent.click(within(saveBar()).getByRole('button', { name: 'Save units' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(within(dialog).getByText('Each change is logged.')).toBeTruthy();
  });
});

describe('EditableTable: the row (lead 2026-10-03)', () => {
  const deleteAction = (unit: Unit) => [
    {
      id: 'delete',
      kind: 'destructive' as const,
      icon: 'trash-can' as const,
      label: COMMON.delete,
      ariaLabel: `Delete unit ${unit.name}`,
      onSelect: vi.fn(),
    },
  ];
  const stars = (grid: HTMLElement) =>
    [...grid.querySelectorAll('thead th')].filter((head) => head.textContent.includes('*'));

  it('one quiet Edit (outline, small) per row and the "Actions for" menu holding Delete after a separator; no Delete button in the row', async () => {
    show(<ListPageTemplate {...unitProps()} rowActions={deleteAction} />);
    await table();
    const row = within(rowOf('1'));
    const editButton = row.getByRole('button', { name: 'Edit Unit 1' });
    expect(editButton.getAttribute('data-variant')).toBe('outline');
    expect(editButton.getAttribute('data-size')).toBe('sm');
    expect(row.queryByRole('button', { name: 'Delete unit Unit 1' })).toBeNull();
    const kebab = row.getByRole('button', { name: COMMON.actions_for.replace('{name}', 'Unit 1') });
    expect(within(rowOf('1')).getByTestId('row-actions-menu').className).not.toContain('md:hidden');
    await userEvent.click(kebab);
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Edit Unit 1',
      'Delete unit Unit 1',
    ]);
    expect(items[1]?.getAttribute('data-variant')).toBe('destructive');
    expect(items[1]?.previousElementSibling?.getAttribute('data-slot')).toBe(
      'dropdown-menu-separator',
    );
  });

  it('the required star shows only while the table is in edit (a row edited or added), never on the read-only list', async () => {
    show(<ListPageTemplate {...unitProps()} />);
    const grid = await table();
    expect(stars(grid)).toEqual([]);
    await editUnit(1);
    expect(stars(grid).map((head) => head.textContent)).toEqual(['Unit Name*']);
    await userEvent.click(screen.getByRole('button', { name: 'Undo changes to Unit 1' }));
    expect(stars(grid)).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Add unit' }));
    expect(stars(grid)).toHaveLength(1);
  });

  it('a long read value wraps inside its cell between 160 and 320px instead of widening the table; a short one keeps its line', async () => {
    const long =
      'Long group name with several words (wrapping check) and a code SKU-000000000000-45';
    answer = () => ({ status: HTTP_OK, body: page([{ ...units(1)[0], name: long }]) });
    show(<ListPageTemplate {...unitProps()} rowActions={deleteAction} />);
    await table();
    const text = within(rowOf('1')).getByText(long);
    const frame = text.closest('td > div');
    expect(frame?.className.split(' ')).toEqual(
      expect.arrayContaining([
        'inline-block',
        'max-w-xs',
        'min-w-40',
        'whitespace-pre-line',
        'break-words',
      ]),
    );
    // w-max would hold every value at its full width, so a column could never narrow (1280 overflow).
    expect(frame?.className.split(' ')).not.toContain('w-max');
  });

  it('a short read value gets no wrapping box, so it keeps one line while a long text takes the squeeze', async () => {
    show(<ListPageTemplate {...unitProps()} rowActions={deleteAction} />);
    await table();
    expect(within(rowOf('1')).getByText('Unit 1').closest('td > div')).toBeNull();
  });

  it('a short read text with a line break counts as long: it keeps its line breaks in the wrapping box', async () => {
    answer = () => ({
      status: HTTP_OK,
      body: page([{ ...units(1)[0], name: 'Line one\nLine two' }]),
    });
    show(<ListPageTemplate {...unitProps()} rowActions={deleteAction} />);
    await table();
    const box = within(rowOf('1'))
      .getByText(/Line one/)
      .closest('td > div');
    expect(box?.className.split(' ')).toContain('whitespace-pre-line');
  });

  it('an empty read value says "None" in muted text, never a blank cell (the name and the note here)', async () => {
    answer = () => ({
      status: HTTP_OK,
      body: page([{ ...units(1)[0], name: '' }]),
    });
    show(<ListPageTemplate {...unitProps()} rowActions={deleteAction} />);
    await table();
    const nones = within(rowOf('1')).getAllByText('None');
    expect(nones).toHaveLength(2);
    for (const none of nones) expect(none.className.split(' ')).toContain('text-muted-foreground');
  });

  it('a read row centres every cell with its buttons; a row in edit tops every cell, its actions too (an error line grows the row)', async () => {
    show(<ListPageTemplate {...unitProps()} rowActions={deleteAction} />);
    await table();
    const cells = (key: string) => [...rowOf(key).querySelectorAll('td')];
    expect(cells('1').map((td) => td.className.includes('align-top'))).toEqual(
      cells('1').map(() => false),
    );
    expect(cells('1').every((td) => td.className.includes('align-middle'))).toBe(true);
    await editUnit(1);
    expect(cells('1').every((td) => td.className.includes('align-top'))).toBe(true);
    expect(cells('2').every((td) => td.className.includes('align-middle'))).toBe(true);
  });

  it("the actions column is sticky at the inline end, header too, on the row's solid background (quick 261003-ovf)", async () => {
    show(<ListPageTemplate {...unitProps()} rowActions={deleteAction} />);
    const grid = await table();
    const classes = (element: Element | null | undefined): string[] =>
      (element?.getAttribute('class') ?? '').split(' ');
    const head = [...grid.querySelectorAll('th')].at(-1);
    expect(classes(head)).toEqual(expect.arrayContaining(['sticky-actions', 'bg-muted']));
    const row = rowOf('1');
    const cell = [...row.querySelectorAll('td')].at(-1);
    expect(cell?.contains(within(row).getByRole('button', { name: 'Edit Unit 1' }))).toBe(true);
    expect(classes(cell)).toEqual(expect.arrayContaining(['sticky-actions', 'bg-inherit']));
    // The primitive's half see-through tints become solid, so no text shows through the cell.
    expect(classes(row)).toContain('bg-background');
    expect(classes(row).filter((name) => name.startsWith('hover:'))).toEqual([
      'hover:bg-[color-mix(in_oklab,var(--color-muted)_50%,var(--color-background))]',
    ]);
    // Only the actions column sticks.
    expect(
      [...row.querySelectorAll('td')].filter((td) => classes(td).includes('sticky-actions')),
    ).toHaveLength(1);
  });
});

describe('EditableTable: grid mode (D-26)', () => {
  beforeEach(() => {
    answer = () => ({ status: HTTP_OK, body: page(LEVELS) });
  });

  it('Grid: the level columns are always inputs, no per-row Edit; Enter and Shift+Enter move down and up in the column; Esc restores', async () => {
    show(<ListPageTemplate {...levelProps()} />);
    await table();
    expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull();
    const min1 = cell('Item 1: Minimum value');
    const min2 = cell('Item 2: Minimum value');
    expect(min1.className).toContain('text-end');
    min1.focus();
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(min2);
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    expect(document.activeElement).toBe(min1);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    await userEvent.type(min1, '9');
    expect(min1).toHaveProperty('value', '19');
    await userEvent.keyboard('{Escape}');
    expect(min1).toHaveProperty('value', '1');
    expect(screen.queryByTestId('save-bar')).toBeNull();
  });

  it('GridDirty: a changed cell is muted with a hidden "Changed", the bar counts the row; a non-number is "Enter a number."', async () => {
    show(<ListPageTemplate {...levelProps()} />);
    await table();
    await userEvent.type(cell('Item 2: Maximum Qty'), 'x');
    const dirtyCell = cell('Item 2: Maximum Qty').closest('td');
    expect(dirtyCell?.className).toContain('bg-muted');
    expect(within(dirtyCell as HTMLElement).getByText(COMMON.cell_changed).className).toContain(
      'sr-only',
    );
    expect(within(saveBar()).getByText('1 row changed')).toBeTruthy();
    await userEvent.click(within(saveBar()).getByRole('button', { name: 'Save levels' }));
    expect(screen.getByTestId('error-summary').textContent).toContain(
      `Item 2: Maximum Qty: ${COMMON.enter_number}`,
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('SetForSelected: checking rows shows Set levels; its dialog fills the chosen column of the checked rows, an empty input unchanged, and saves nothing', async () => {
    show(<ListPageTemplate {...levelProps()} />);
    await table();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Item 1' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Item 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Set levels' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Minimum value' }), '5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply to 2 items' }));
    expect(cell('Item 1: Minimum value')).toHaveProperty('value', '5');
    expect(cell('Item 3: Minimum value')).toHaveProperty('value', '5');
    expect(cell('Item 2: Minimum value')).toHaveProperty('value', '2');
    expect(cell('Item 1: Maximum Qty')).toHaveProperty('value', '10');
    expect(within(saveBar()).getByText('2 rows changed')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it('GridWithDate (K15): a date column is a native date input named "{row}: {column}"; a typed date reaches the draft; its error is under it with aria-invalid', async () => {
    const config = levelConfig({
      columns: [{ id: 'minimum', kind: 'date', label: 'Expiry Date' }],
      toDraft: () => ({ minimum: '' }),
      validate: (draft) => (text(draft.minimum) === '' ? {} : { minimum: 'Enter a later date.' }),
    });
    show(<ListPageTemplate {...levelProps(config)} />);
    await table();
    const input = screen.getByLabelText('Item 2: Expiry Date');
    expect(input.getAttribute('type')).toBe('date');
    fireEvent.change(input, { target: { value: '2026-10-05' } });
    expect(input).toHaveProperty('value', '2026-10-05');
    expect(within(saveBar()).getByText('1 row changed')).toBeTruthy();
    await userEvent.click(within(saveBar()).getByRole('button', { name: 'Save levels' }));
    const after = screen.getByLabelText('Item 2: Expiry Date');
    expect(after.getAttribute('aria-invalid')).toBe('true');
    const errorId = after.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(errorId)?.textContent).toBe('Enter a later date.');
    expect(save).not.toHaveBeenCalled();
  });

  it('CellInput is exported for the document lines editor (K14) and EmptyAsNone is still exported here', async () => {
    const kit = await import('@/components/templates/EditableTable');
    expect(typeof kit.CellInput).toBe('function');
    expect(typeof kit.EmptyAsNone).toBe('function');
  });

  it('pinNumbersWithActions (opt-in, 04.6-15): a grid that adds rows pins its numbers beside fixed 4rem actions; absent, no pin', async () => {
    const blankDraft = () => ({ minimum: '', maximum: '' });
    const pinned = show(
      <ListPageTemplate
        {...levelProps(levelConfig({ canAdd: true, blankDraft, pinNumbersWithActions: true }))}
      />,
    );
    let grid = await table();
    const maximum = within(grid).getByRole('columnheader', { name: /Maximum Qty/ });
    const minimum = within(grid).getByRole('columnheader', { name: /Minimum value/ });
    expect(maximum.style.insetInlineEnd).toBe('4rem');
    expect(minimum.style.insetInlineEnd).toBe('11rem');
    expect(minimum.className).toContain('border-s');
    expect(within(grid).getByRole('columnheader', { name: COMMON.actions }).className).toContain(
      'w-16',
    );
    pinned.unmount();
    show(<ListPageTemplate {...levelProps(levelConfig({ canAdd: true, blankDraft }))} />);
    grid = await table();
    expect(
      within(grid).getByRole('columnheader', { name: /Maximum Qty/ }).style.insetInlineEnd,
    ).toBe('');
  });

  it('Mobile: every editable column is kept (no hide-below class) and the table scrolls inside its wrapper', async () => {
    show(<ListPageTemplate {...levelProps()} />);
    const grid = await table();
    const minimumHeader = within(grid).getByRole('columnheader', {
      name: 'Minimum value',
    });
    expect(minimumHeader.className).not.toContain('hidden');
    expect(grid.parentElement?.className).toContain('overflow-x-auto');
  });

  it('Rtl: no physical-direction class under ar, with a new row, a row in edit and the grid', async () => {
    const grid = show(<ListPageTemplate {...levelProps()} />, { locale: 'ar' });
    await table();
    expect(physicalClassesIn(grid.container)).toEqual([]);
    grid.unmount();
    answer = () => ({ status: HTTP_OK, body: page(units(3)) });
    const { container } = show(<ListPageTemplate {...unitProps()} />, { locale: 'ar' });
    await table();
    await userEvent.click(screen.getByRole('button', { name: 'Add unit' }));
    await editUnit(1);
    expect(physicalClassesIn(container)).toEqual([]);
  });
});

describe('columnClass', () => {
  it("hideBelow 'xl' (opt-in, plan 04.6-06) hides a column below 1280", () => {
    expect(columnClass({ hideBelow: 'xl' })).toBe('hidden xl:table-cell');
    expect(columnClass({ hideBelow: 'md', align: 'end' })).toBe(
      'hidden md:table-cell text-end tabular-nums',
    );
  });
});

describe('readDateTime (opt-in, plan 04.8-09)', () => {
  it('puts the time under the date at caption size; a text with no time stays one line', () => {
    const { container } = renderWithProviders(<div>{readDateTime('2026-10-02 1:00 PM')}</div>);
    const [date, time] = [...container.querySelectorAll('bdi')];
    expect(date?.textContent).toBe('2026-10-02');
    expect(time?.textContent).toBe('1:00 PM');
    expect(time?.className).toContain('text-xs');
    const one = renderWithProviders(<div>{readDateTime('2026-10-02')}</div>);
    expect(one.container.querySelectorAll('bdi')).toHaveLength(1);
  });
});
