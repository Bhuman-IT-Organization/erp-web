// @vitest-environment happy-dom
import { act, cleanup, fireEvent } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from 'nuqs/adapters/testing';
import type { ReactElement } from 'react';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { resetApiStatus } from '@/lib/api/api-status';
import { clearSession, setSession } from '@/lib/auth/session';
import { http } from '@/lib/api/http';
import { replaceRowInLists, seedRow, useRowSeed } from '@/lib/api/row-seed';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import en from '@/messages/common/en.json';
import {
  physicalClassesIn,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import type { FilterControl } from '@/components/organisms/FilterBar';
import type { EditableConfig } from '@/components/templates/EditableTable';
import type { ListFilterDef } from '@/lib/url/use-query-state';
import { ListPageTemplate, type ListColumn, type ListPageTemplateProps } from '../ListPageTemplate';

/**
 * UIK-01 "list page": one template renders every list (D-17…D-20, D-23, D-30, D-31, D-39). The
 * screen passes an endpoint, a row schema and columns; the template owns layout, URL state, the
 * request and every state. The transport is a fake axios adapter on the shared instance, so the
 * real `useList` → `swrFetcher` → `callApi` path runs.
 */
const COMMON = en.common;

// The editable mode asks before leaving (useUnsavedChanges reads the router); the plain list does not.
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/staff',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));
const HTTP_OK = 200;
const FORBIDDEN = 403;
const SERVICE_UNAVAILABLE = 503;
const PATH = '/api/v1/identity/members';
const SKELETON_ROWS_MAX = 10;
const TOTAL = 1240;
/** A key this plan adds: a literal, so a missing key cannot pass as `name: undefined` (plan 09's trap). */
const SEARCH = 'Search';
const PAGE = 25;
const SLOW_MS = 3_000;
const UNDER_DEBOUNCE_MS = CLIENT_TIMINGS.list.searchDebounceMs / 3;

const rowSchema = z.object({ id: z.number().int(), name: z.string(), email: z.string() });
type Row = z.infer<typeof rowSchema>;

const people = (count: number, from = 1): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: from + i,
    name: `Person ${String(from + i)}`,
    email: `p${String(from + i)}@example.invalid`,
  }));

const page = (
  data: readonly Row[],
  meta: Partial<{
    nextCursor: string | null;
    prevCursor: string | null;
    total: number | undefined;
    rangeStart: number | undefined;
    exportLimit: number;
    printLimit: number;
  }> = {},
) => ({
  data,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: data.length,
    rangeStart: data.length === 0 ? 0 : 1,
    ...meta,
  },
});

const problem = (status: number, code: string) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
});

type Reply = { readonly status: number; readonly body: unknown } | 'pending';

/** Every list request the page made, as a parsed URL (path + query). */
let requests: URL[] = [];
let answer: (url: URL) => Reply = () => ({ status: HTTP_OK, body: page(people(3)) });

/** `/me` for the page-size memory (usePageSize reads the staff id). */
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

const onEdit = vi.fn();
const onDelete = vi.fn();
const onRowOpen = vi.fn<(row: Row) => void>();

const COLUMNS: readonly ListColumn<Row>[] = [
  { id: 'name', header: 'Full Name', sortField: 'firstName', primary: true, cell: (r) => r.name },
  { id: 'email', header: 'Email', sortField: 'email', hideBelow: 'md', cell: (r) => r.email },
  // D-41: Role is not a keyset key — a plain header, no sort control.
  { id: 'role', header: 'Role', hideBelow: 'lg', cell: () => 'Support' },
];

function props(overrides: Partial<ListPageTemplateProps<Row>> = {}): ListPageTemplateProps<Row> {
  return {
    title: 'Staff Members',
    path: PATH,
    rowSchema,
    listBase: '/setup/staff',
    rowKey: (r) => String(r.id),
    rowHref: (r) => `/setup/staff/${String(r.id)}`,
    recordName: (r) => r.name,
    onRowOpen,
    columns: COLUMNS,
    rowActions: (r) => [
      {
        id: 'edit',
        label: 'Edit',
        ariaLabel: `Edit ${r.name}`,
        icon: 'pen-to-square',
        kind: 'main',
        onSelect: onEdit,
      },
      {
        id: 'delete',
        label: 'Delete',
        ariaLabel: `Delete ${r.name}`,
        icon: 'trash-can',
        kind: 'destructive',
        onSelect: onDelete,
      },
    ],
    createAction: { label: 'New Staff Member', href: '/setup/staff/new' },
    empty: {
      nothingYetHeading: 'No staff members yet',
      nothingYetBody: 'Add the first staff member to give someone access.',
      noResultsHeading: (q) => `No staff members match “${q}”`,
      noResultsBody: 'Check the spelling or clear the search to see everyone.',
    },
    recordsNoun: 'staff members',
    ...overrides,
  };
}

/** A private SWR cache per test, no automatic retry (the settled state is what is asserted). */
const ISOLATED: SWRConfiguration = { provider: () => new Map(), shouldRetryOnError: false };

function show(
  ui: ReactElement,
  options: {
    searchParams?: string;
    onUrlUpdate?: OnUrlUpdateFunction;
    locale?: 'en' | 'ar';
    swr?: SWRConfiguration;
  } = {},
) {
  const { swr = ISOLATED, searchParams = '', onUrlUpdate, locale } = options;
  // A URL WITH memory, as a browser has: the harness's adapter forgets every write, so once the
  // debounced `q` write flushed, nuqs re-read the old URL and set `q` back — a race with the
  // search's own settle timer that no browser has.
  return renderWithProviders(
    <NuqsTestingAdapter
      searchParams={searchParams}
      hasMemory
      {...(onUrlUpdate === undefined ? {} : { onUrlUpdate })}
    >
      <SWRConfig value={swr}>{ui}</SWRConfig>
    </NuqsTestingAdapter>,
    locale === undefined ? {} : { locale },
  );
}

/** Every link the page follows is recorded here, never navigated (happy-dom has no router). */
let followed: string[] = [];
function recordNavigation(event: MouseEvent): void {
  const link = event.target instanceof Element ? event.target.closest('a') : null;
  if (link === null) return;
  event.preventDefault();
  followed.push(link.getAttribute('href') ?? '');
}

// Harness order (RESEARCH Pitfall 9): the session is seeded first, and the tree is unmounted
// BEFORE the session is cleared, or a still-mounted consumer starts a real bootstrap.
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  followed = [];
  answer = () => ({ status: HTTP_OK, body: page(people(3)) });
  http.defaults.adapter = respond;
  onEdit.mockClear();
  onDelete.mockClear();
  onRowOpen.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/staff');
  document.addEventListener('click', recordNavigation);
});
afterEach(() => {
  cleanup();
  clearSession();
  document.removeEventListener('click', recordNavigation);
  delete http.defaults.adapter;
  localStorage.clear();
});

const MESSAGE_IDS = ['list-error', 'list-empty', 'list-no-results'] as const;

describe('ListPageTemplate — states in the D-39 precedence', () => {
  it('first load: the list skeleton (10 rows) and NO message of any kind while loading (D-39)', () => {
    answer = () => 'pending';
    show(<ListPageTemplate {...props()} />);
    const skeleton = screen.getByTestId('list-loading');
    expect(skeleton.getAttribute('data-variant')).toBe('list');
    expect(within(skeleton).getAllByTestId('skeleton-row')).toHaveLength(SKELETON_ROWS_MAX);
    for (const id of MESSAGE_IDS) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByTestId('list-table')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('loaded: the h1 title, one row per item, and the primary cell is a[data-row-link] to rowHref', async () => {
    show(<ListPageTemplate {...props()} />);
    const table = await screen.findByTestId('list-table');
    expect(screen.getByRole('heading', { level: 1, name: 'Staff Members' })).toBeTruthy();
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 3);
    const link = within(table).getByRole('link', { name: 'Person 1' });
    expect(link.hasAttribute('data-row-link')).toBe(true);
    expect(link.getAttribute('href')).toBe('/setup/staff/1');
    expect(screen.queryByTestId('list-loading')).toBeNull();
  });

  it('an unpaginated list reads `{ data }` without query params and searches rows locally', async () => {
    answer = () => ({ status: HTTP_OK, body: { data: people(3) } });
    show(
      <ListPageTemplate
        {...props({
          unpaginated: {
            responseSchema: z.strictObject({ data: z.array(rowSchema).readonly() }).readonly(),
            matchesSearch: (row, query) =>
              row.id.toString().includes(query) ||
              row.name.toLowerCase().includes(query.toLowerCase()),
          },
        })}
      />,
      { searchParams: '?q=Person+2' },
    );
    const table = await screen.findByTestId('list-table');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByRole('link', { name: 'Person 2' })).toBeTruthy();
    expect(within(table).queryByRole('link', { name: 'Person 1' })).toBeNull();
    expect(screen.queryByTestId('list-pager')).toBeNull();
    expect(listRequests().map((url) => `${url.pathname}${url.search}`)).toEqual([PATH]);
  });

  it('an unpaginated list sorts locally while keeping its bare list request', async () => {
    answer = () => ({ status: HTTP_OK, body: { data: people(3) } });
    show(
      <ListPageTemplate
        {...props({
          columns: [
            {
              id: 'name',
              header: 'Full Name',
              sortField: 'firstName',
              sortValue: (row) => row.name,
              primary: true,
              cell: (row) => row.name,
            },
            ...COLUMNS.slice(1),
          ],
          unpaginated: {
            responseSchema: z.strictObject({ data: z.array(rowSchema).readonly() }).readonly(),
            matchesSearch: (row, query) =>
              row.id.toString().includes(query) ||
              row.name.toLowerCase().includes(query.toLowerCase()),
          },
        })}
      />,
      { searchParams: '?sort=-firstName' },
    );
    const table = await screen.findByTestId('list-table');
    const rows = within(table).getAllByRole('row');
    expect(rows.slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining('Person 3'),
      expect.stringContaining('Person 2'),
      expect.stringContaining('Person 1'),
    ]);
    expect(listRequests().map((url) => `${url.pathname}${url.search}`)).toEqual([PATH]);
  });

  it('options (opt-in, plan 04.7-23): the answer meta.options reach each cell and row menu; {} when absent', async () => {
    const seen: unknown[] = [];
    const withOptions = (options?: object) => {
      answer = () => ({
        status: HTTP_OK,
        body: {
          ...page(people(1)),
          meta: { ...page(people(1)).meta, ...(options === undefined ? {} : { options }) },
        },
      });
    };
    withOptions({ revertEnabled: true, unitNames: ['pcs'] });
    const { unmount } = show(
      <ListPageTemplate
        {...props({
          columns: [
            {
              ...COLUMNS[0],
              cell: (r, options) => `${r.name} ${JSON.stringify(options)}`,
            } as ListColumn<Row>,
          ],
          rowActions: (r, options) => {
            seen.push(options);
            return [
              {
                id: 'view',
                kind: 'main',
                icon: 'eye',
                label: 'View',
                ariaLabel: `View ${r.name}`,
                onSelect: vi.fn(),
              },
            ];
          },
        })}
      />,
    );
    expect(
      await screen.findByText('Person 1 {"revertEnabled":true,"unitNames":["pcs"]}'),
    ).toBeTruthy();
    expect(seen.at(-1)).toEqual({ revertEnabled: true, unitNames: ['pcs'] });
    unmount();
    withOptions();
    show(
      <ListPageTemplate
        {...props({
          columns: [
            {
              ...COLUMNS[0],
              cell: (r, options) => `${r.name} ${JSON.stringify(options)}`,
            } as ListColumn<Row>,
          ],
        })}
      />,
    );
    expect(await screen.findByText('Person 1 {}')).toBeTruthy();
  });

  it('an empty read value says "None" in muted text, never a blank cell; on the primary column it is still the row link', async () => {
    answer = () => ({
      status: HTTP_OK,
      body: page([{ ...people(1)[0], name: '', email: '' } as Row]),
    });
    show(<ListPageTemplate {...props()} />);
    const table = await screen.findByTestId('list-table');
    const link = within(table).getByRole('link', { name: 'None' });
    expect(link.getAttribute('href')).toBe('/setup/staff/1');
    const nones = within(table).getAllByText('None');
    expect(nones).toHaveLength(2);
    for (const none of nones) expect(none.className.split(' ')).toContain('text-muted-foreground');
  });

  it('returned empty with no q: "nothing yet" with its body and the create button (D-30)', async () => {
    answer = () => ({ status: HTTP_OK, body: page([]) });
    show(<ListPageTemplate {...props()} />);
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('heading', { name: 'No staff members yet' })).toBeTruthy();
    expect(empty.textContent).toContain('Add the first staff member to give someone access.');
    expect(within(empty).getByRole('link', { name: 'New Staff Member' }).getAttribute('href')).toBe(
      '/setup/staff/new',
    );
    expect(screen.queryByTestId('list-no-results')).toBeNull();
  });

  it('empty.nothingYetAction (opt-in, 04.6-14): the nothing-yet state shows it instead of the create action', async () => {
    answer = () => ({ status: HTTP_OK, body: page([]) });
    show(
      <ListPageTemplate
        {...props({
          createAction: null,
          empty: {
            nothingYetHeading: 'No staff members yet',
            nothingYetBody: 'Add the first staff member to give someone access.',
            noResultsHeading: (q) => `No staff members match "${q}"`,
            noResultsBody: 'Check the spelling.',
            nothingYetAction: <a href="/elsewhere/new">Add something elsewhere</a>,
          },
        })}
      />,
    );
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('link', { name: 'Add something elsewhere' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'New Staff Member' })).toBeNull();
  });

  it('empty.createOnlyInEmpty (opt-in, 04.8-16): the nothing-yet state holds the one create, the toolbar none', async () => {
    answer = () => ({ status: HTTP_OK, body: page([]) });
    const base = props();
    show(<ListPageTemplate {...base} empty={{ ...base.empty, createOnlyInEmpty: true }} />);
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('link', { name: 'New Staff Member' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'New Staff Member' })).toHaveLength(1);
  });

  it('createAction with items (opt-in, 04.8-17): one primary menu whose choices link to their pages', async () => {
    answer = () => ({ status: HTTP_OK, body: page([]) });
    show(
      <ListPageTemplate
        {...props({
          createAction: {
            label: 'Add document',
            items: [
              { label: 'Credit note', href: '/r/new?kind=receipt' },
              { label: 'Refund to a vendor', href: '/r/new?kind=delivery' },
            ],
          },
        })}
      />,
    );
    await screen.findByTestId('list-empty');
    const [menu] = screen.getAllByRole('button', { name: 'Add document' });
    if (menu === undefined) throw new Error('no menu');
    await userEvent.click(menu);
    expect(
      (await screen.findByRole('menuitem', { name: 'Credit note' })).getAttribute('href'),
    ).toBe('/r/new?kind=receipt');
    expect(screen.getByRole('menuitem', { name: 'Refund to a vendor' }).getAttribute('href')).toBe(
      '/r/new?kind=delivery',
    );
  });

  it('createOnlyInEmpty with a nothingYetAction (04.8-17): the state holds the create, then its own action', async () => {
    answer = () => ({ status: HTTP_OK, body: page([]) });
    const base = props();
    show(
      <ListPageTemplate
        {...base}
        empty={{
          ...base.empty,
          createOnlyInEmpty: true,
          nothingYetAction: <button type="button">Clear dates</button>,
        }}
      />,
    );
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('link', { name: 'New Staff Member' })).toBeTruthy();
    expect(within(empty).getByRole('button', { name: 'Clear dates' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'New Staff Member' })).toHaveLength(1);
  });

  it('returned empty with a q: "no results for …" and Clear search clears q, keeping sort and limit', async () => {
    answer = () => ({ status: HTTP_OK, body: page([]) });
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    show(<ListPageTemplate {...props()} />, {
      searchParams: '?q=zzz&sort=-email&limit=50',
      onUrlUpdate,
    });
    const none = await screen.findByTestId('list-no-results');
    expect(
      within(none).getByRole('heading', { name: 'No staff members match “zzz”' }),
    ).toBeTruthy();
    expect(screen.queryByTestId('list-empty')).toBeNull();
    await userEvent.click(within(none).getByRole('button', { name: COMMON.clear_search }));
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalled();
    });
    const update = onUrlUpdate.mock.lastCall?.[0];
    expect(update?.searchParams.has('q')).toBe(false);
    expect(update?.searchParams.get('sort')).toBe('-email');
    expect(update?.searchParams.get('limit')).toBe('50');
  });

  it('a retryable failure (503) with no data: the inline error in plain language with Retry; title and toolbar stay', async () => {
    answer = () => ({
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    });
    show(<ListPageTemplate {...props()} />);
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain("We couldn't load staff members. Try again in a moment.");
    expect(error.textContent).not.toMatch(/ERP-|\b503\b/);
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Staff Members' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: SEARCH })).toBeTruthy();
    for (const id of ['list-empty', 'list-no-results', 'list-loading', 'list-table']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    const before = listRequests().length;
    await userEvent.click(within(error).getByRole('button', { name: COMMON.retry }));
    await waitFor(() => {
      expect(listRequests().length).toBe(before + 1);
    });
  });

  it('a 403: the common ERP-AUTH-0005 text and no Retry; never a code or a status (D-32)', async () => {
    answer = () => ({ status: FORBIDDEN, body: problem(FORBIDDEN, 'ERP-AUTH-0005') });
    show(<ListPageTemplate {...props()} />);
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain(COMMON.errors['ERP-AUTH-0005']);
    expect(error.textContent).not.toMatch(/ERP-|\b403\b/);
    expect(within(error).queryByRole('button')).toBeNull();
  });

  it('a refetch failure after rows loaded keeps the rows and shows the error above them (D-31)', async () => {
    answer = (url) =>
      url.searchParams.get('cursor') === 'n1'
        ? { status: SERVICE_UNAVAILABLE, body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001') }
        : { status: HTTP_OK, body: page(people(PAGE), { nextCursor: 'n1', total: TOTAL }) };
    show(<ListPageTemplate {...props()} />);
    await screen.findByTestId('list-table');
    await userEvent.click(screen.getByRole('button', { name: COMMON.next }));
    const error = await screen.findByTestId('list-error');
    const table = screen.getByTestId('list-table');
    expect(within(table).getByRole('link', { name: 'Person 1' })).toBeTruthy();
    expect(error.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('ListPageTemplate — table, row click, sort, pager', () => {
  it('a click on a plain cell opens the record through its link, records the return and calls onRowOpen', async () => {
    window.history.replaceState(null, '', '/setup/staff?q=per');
    show(<ListPageTemplate {...props()} />, { searchParams: '?q=per' });
    const table = await screen.findByTestId('list-table');
    await userEvent.click(within(table).getByText('p2@example.invalid'));
    expect(followed).toEqual(['/setup/staff/2']);
    expect(onRowOpen).toHaveBeenCalledWith({
      id: 2,
      name: 'Person 2',
      email: 'p2@example.invalid',
    });
    expect(
      JSON.parse(sessionStorage.getItem('erp.list.return:/setup/staff') ?? '{}'),
    ).toMatchObject({
      url: '/setup/staff?q=per',
    });
  });

  it('a mouse click on a row action runs it and never opens the row', async () => {
    show(<ListPageTemplate {...props()} />);
    const table = await screen.findByTestId('list-table');
    const [edit] = within(table).getAllByRole('button', { name: 'Edit Person 1' });
    if (edit === undefined) throw new Error('no Edit button');
    await userEvent.click(edit);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRowOpen).not.toHaveBeenCalled();
    expect(followed).toEqual([]);
  });

  it('Enter on a row action (the keyboard) runs it and never opens the row', async () => {
    show(<ListPageTemplate {...props()} />);
    const table = await screen.findByTestId('list-table');
    const [edit] = within(table).getAllByRole('button', { name: 'Edit Person 1' });
    if (edit === undefined) throw new Error('no Edit button');
    edit.focus();
    await userEvent.keyboard('{Enter}');
    expect(onEdit).toHaveBeenCalledTimes(1);
    const kebab = within(table).getByRole('button', { name: 'Actions for Person 1' });
    kebab.focus();
    await userEvent.keyboard('{Enter}');
    expect(onRowOpen).not.toHaveBeenCalled();
    expect(followed).toEqual([]);
  });

  it('a click between the row actions (the separator, inside [data-row-ignore]) never opens the row', async () => {
    show(<ListPageTemplate {...props()} />);
    const table = await screen.findByTestId('list-table');
    const [rowOne] = within(table).getAllByRole('row').slice(1);
    const separator = rowOne?.querySelector('[data-slot="separator"]');
    if (separator === null || separator === undefined) throw new Error('no separator');
    fireEvent.click(separator);
    expect(onRowOpen).not.toHaveBeenCalled();
    expect(followed).toEqual([]);
  });

  it('a column with sortField: a SortableHeader in a th with aria-sort; a click pushes sort and drops the cursor', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    show(<ListPageTemplate {...props()} />, {
      searchParams: '?cursor=abc&sort=-email',
      onUrlUpdate,
    });
    const table = await screen.findByTestId('list-table');
    const headers = within(table).getAllByRole('columnheader');
    const email = headers.find((th) => th.textContent.includes('Email'));
    expect(email?.getAttribute('aria-sort')).toBe('descending');
    const name = headers.find((th) => th.textContent.includes('Full Name'));
    expect(name?.getAttribute('aria-sort')).toBe('none');
    await userEvent.click(within(table).getByRole('button', { name: 'Sort by Full Name' }));
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalled();
    });
    const update = onUrlUpdate.mock.lastCall?.[0];
    expect(update?.options.history).toBe('push');
    expect(update?.searchParams.get('sort')).toBe('firstName');
    expect(update?.searchParams.has('cursor')).toBe(false);
  });

  it('a column without sortField (Role, D-41) has no sort control and no aria-sort', async () => {
    show(<ListPageTemplate {...props()} />);
    const table = await screen.findByTestId('list-table');
    const role = within(table)
      .getAllByRole('columnheader')
      .find((th) => th.textContent === 'Role');
    expect(role).toBeDefined();
    expect(role?.hasAttribute('aria-sort')).toBe(false);
    expect(within(table).queryByRole('button', { name: 'Sort by Role' })).toBeNull();
  });

  it('the pager shows "Showing 1–25 of 1,240" from meta; Next and Previous push the cursors from meta', async () => {
    answer = () => ({
      status: HTTP_OK,
      body: page(people(PAGE), { nextCursor: 'n1', prevCursor: 'p1', total: TOTAL, rangeStart: 1 }),
    });
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    show(<ListPageTemplate {...props()} />, { onUrlUpdate });
    await screen.findByTestId('list-table');
    expect(screen.getByTestId('pager-range').textContent).toBe('Showing 1–25 of 1,240');
    await userEvent.click(screen.getByRole('button', { name: COMMON.next }));
    await waitFor(() => {
      expect(onUrlUpdate.mock.lastCall?.[0].searchParams.get('cursor')).toBe('n1');
    });
    expect(onUrlUpdate.mock.lastCall?.[0].options.history).toBe('push');
    await userEvent.click(screen.getByRole('button', { name: COMMON.previous }));
    await waitFor(() => {
      expect(onUrlUpdate.mock.lastCall?.[0].searchParams.get('cursor')).toBe('p1');
    });
  });

  it("hideBelow 'md' gives the column's header and cells the literal hidden md:table-cell", async () => {
    show(<ListPageTemplate {...props()} />);
    const table = await screen.findByTestId('list-table');
    const cell = within(table).getByText('p1@example.invalid').closest('td');
    expect(cell?.className.split(' ')).toEqual(expect.arrayContaining(['hidden', 'md:table-cell']));
    const header = within(table)
      .getAllByRole('columnheader')
      .find((th) => th.textContent.includes('Email'));
    expect(header?.className.split(' ')).toEqual(
      expect.arrayContaining(['hidden', 'md:table-cell']),
    );
  });

  it('wrapHeader (opt-in, plan 04.7-11): that header may wrap; the others keep one line', async () => {
    const columns: readonly ListColumn<Row>[] = [
      { ...COLUMNS[0], wrapHeader: true } as ListColumn<Row>,
      ...COLUMNS.slice(1),
    ];
    show(<ListPageTemplate {...props({ columns })} />);
    const table = await screen.findByTestId('list-table');
    const [first, second] = within(table).getAllByRole('columnheader');
    if (first === undefined) throw new Error('no header');
    expect(first.className.split(' ')).toContain('whitespace-normal');
    expect(second?.className.split(' ')).not.toContain('whitespace-normal');
    expect(within(first).getByRole('button').className.split(' ')).toContain('whitespace-normal');
  });

  it('createAction null: no create button at all (hidden, not disabled)', async () => {
    show(<ListPageTemplate {...props({ createAction: null })} />);
    await screen.findByTestId('list-table');
    expect(screen.queryByRole('link', { name: 'New Staff Member' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New Staff Member' })).toBeNull();
  });

  it('uses no physical-direction class under ar', async () => {
    const { container } = show(<ListPageTemplate {...props()} />, { locale: 'ar' });
    await screen.findByTestId('list-table');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});

describe('ListPageTemplate — the request (D-19, D-20, D-36)', () => {
  it('typing "jan" sends ONE request with q=jan after the debounce (none for j or ja) and replaces q in the URL', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    show(<ListPageTemplate {...props()} />, { onUrlUpdate });
    await screen.findByTestId('list-table');
    await userEvent.type(screen.getByRole('textbox', { name: SEARCH }), 'jan');
    // The debounce plus one request: a generous budget, so a busy machine is not a failure.
    await waitFor(
      () => {
        expect(listRequests().some((url) => url.searchParams.get('q') === 'jan')).toBe(true);
      },
      { timeout: SLOW_MS },
    );
    const withQ = listRequests().filter((url) => url.searchParams.has('q'));
    expect(withQ.map((url) => url.searchParams.get('q'))).toEqual(['jan']);
    await waitFor(
      () => {
        expect(onUrlUpdate.mock.lastCall?.[0].searchParams.get('q')).toBe('jan');
      },
      { timeout: SLOW_MS },
    );
    expect(onUrlUpdate.mock.lastCall?.[0].options.history).toBe('replace');
  });

  it('Enter sends the search and writes the URL at once, without waiting for the debounce', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    show(<ListPageTemplate {...props()} />, { onUrlUpdate });
    await screen.findByTestId('list-table');
    const box = screen.getByRole('textbox', { name: SEARCH });
    fireEvent.change(box, { target: { value: 'jan' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    // Timers fire in due order: this one, set AFTER the typing's 300 ms debounce timers, fires
    // before any of them — so whatever is asserted next did not wait for the debounce.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, UNDER_DEBOUNCE_MS));
    });
    expect(listRequests().some((url) => url.searchParams.get('q') === 'jan')).toBe(true);
    expect(onUrlUpdate.mock.lastCall?.[0].searchParams.get('q')).toBe('jan');
  });

  it('the rows shown are exactly the api answer: nothing is filtered on the client (D-19)', async () => {
    answer = (url) => ({
      status: HTTP_OK,
      body: page(url.searchParams.get('q') === 'jan' ? people(2, 40) : people(3)),
    });
    show(<ListPageTemplate {...props()} />, { searchParams: '?q=jan' });
    const table = await screen.findByTestId('list-table');
    expect(
      within(table)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Person 40', 'Person 41']);
  });

  it('the request carries limit from usePageSize (the URL wins), q, sort, cursor and the filters', async () => {
    show(<ListPageTemplate {...props({ filters: { 'filter[active]': true } })} />, {
      searchParams: '?limit=50&q=ada&sort=-email&cursor=c9',
    });
    await screen.findByTestId('list-table');
    const [first] = listRequests();
    expect(Object.fromEntries(first?.searchParams ?? [])).toEqual({
      limit: '50',
      q: 'ada',
      sort: '-email',
      cursor: 'c9',
      'filter[active]': 'true',
    });
  });

  it('a search with a leading or trailing space sends it trimmed; the box keeps what was typed (UAT 4.6)', async () => {
    show(<ListPageTemplate {...props()} />, { searchParams: '?q=+ZZ+Test+' });
    await screen.findByTestId('list-table');
    expect(listRequests().map((url) => url.searchParams.get('q'))).toEqual(['ZZ Test']);
    expect(screen.getByRole('textbox', { name: SEARCH })).toHaveProperty('value', ' ZZ Test ');
  });

  it('a search of spaces only sends no q', async () => {
    show(<ListPageTemplate {...props()} />, { searchParams: '?q=++' });
    await screen.findByTestId('list-table');
    expect(listRequests().every((url) => !url.searchParams.has('q'))).toBe(true);
  });

  it('a window focus triggers no request (revalidateOnFocus: false, D-36)', async () => {
    // No dedupe window and no focus throttle (SWR ignores a focus within 5 s of the mount), so
    // only `revalidateOnFocus: false` can keep the request from going out.
    show(<ListPageTemplate {...props()} />, {
      swr: { ...ISOLATED, dedupingInterval: 0, focusThrottleInterval: 0 },
    });
    await screen.findByTestId('list-table');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const before = listRequests().length;
    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(listRequests().length).toBe(before);
  });

  it('a row open seeds the detail from the row (D-35); a save updates the list on screen with no request (D-36)', async () => {
    const path = '/api/v1/identity/zz-seed-probe';
    const detail = '/api/v1/identity/zz-seed-probe/2';
    function SeedProbe() {
      const seeded = useRowSeed(detail, rowSchema);
      return <output data-testid="seed">{seeded?.name ?? 'none'}</output>;
    }
    answer = () => ({ status: HTTP_OK, body: page(people(3)) });
    // The app's one cache (not a private one): seedRow and replaceRowInLists write through it.
    show(
      <>
        <ListPageTemplate
          {...props({
            path,
            onRowOpen: (row) => {
              seedRow(`${path}/${String(row.id)}`, row);
            },
          })}
        />
        <SeedProbe />
      </>,
      { swr: { shouldRetryOnError: false } },
    );
    const table = await screen.findByTestId('list-table');
    expect(screen.getByTestId('seed').textContent).toBe('none');
    await userEvent.click(within(table).getByText('p2@example.invalid'));
    await waitFor(() => {
      expect(screen.getByTestId('seed').textContent).toBe('Person 2');
    });
    const before = requests.length;
    await act(async () => {
      await replaceRowInLists(
        path,
        { id: 2, name: 'Person 2 Renamed', email: 'p2@example.invalid' },
        (r: Row) => r.id === 2,
      );
    });
    expect(within(table).getByRole('link', { name: 'Person 2 Renamed' })).toBeTruthy();
    expect(requests.length).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------
// Export (D-26, D-42) and bulk selection (D-27)
// ---------------------------------------------------------------------------------------------

const EXPORT_PATH = '/api/v1/identity/members/export';
/** Plan 05's member export columns, in the api's order (MEMBER_EXPORT_COLUMNS: 7). */
const MEMBER_EXPORT_COLUMNS = [
  'staffId',
  'firstName',
  'lastName',
  'email',
  'roleName',
  'active',
  'lastLogin',
] as const;
type MemberExportColumn = (typeof MEMBER_EXPORT_COLUMNS)[number];
const MEMBER_EXPORT_LABELS: Readonly<Record<MemberExportColumn, string>> = {
  staffId: 'Staff ID',
  firstName: 'First Name',
  lastName: 'Last Name',
  email: 'Email',
  roleName: 'Role',
  active: 'Active',
  lastLogin: 'Last Login',
};
const EXPORTING = 'Exporting…';
const EXPORT_FAILED = "We couldn't export the list. Try again.";
const BAD_REQUEST = 400;

const exportRequests = () => requests.filter((url) => url.pathname === EXPORT_PATH);

const EXPORT_ACTION = {
  path: EXPORT_PATH,
  columns: MEMBER_EXPORT_COLUMNS,
  labels: MEMBER_EXPORT_LABELS,
} as const;

/** The CSV body the api sends: a Blob that starts with the BOM. */
const csv = (): Reply => ({
  status: HTTP_OK,
  body: new Blob(['﻿Staff ID\r\n'], { type: 'text/csv' }),
});

/** A problem-details refusal as it arrives under `responseType: 'blob'`: a Blob too. */
const blobProblem = (status: number, issues: readonly unknown[]): Reply => ({
  status,
  body: new Blob([JSON.stringify({ ...problem(status, 'ERP-VALIDATION-0001'), issues })], {
    type: 'application/problem+json',
  }),
});

const SELECT_ALL_ON_PAGE = 'Select all on this page';
const BULK_ACTIONS = 'Bulk actions';
const CLEAR_SELECTION = 'Clear selection';

/** Opens the Export menu and chooses an item by its label (the items are portalled). */
const chooseExport = async (label: string): Promise<void> => {
  await userEvent.click(screen.getByTestId('list-export'));
  await userEvent.click(await screen.findByRole('menuitem', { name: label }));
};

const PRESENTATION = ['title', 'yes', 'no', 'blank', 'dateFormat', 'timeFormat', 'timeZone'];

/** The print rows the api answers (plan 02's wire): every cell a string. */
const PRINT_ROWS = {
  exportedAt: '2026-10-01T08:00:00.000Z',
  headers: ['Staff ID', 'First Name'],
  rows: [
    ['1', 'Person'],
    ['2', 'Other'],
  ],
};

/** `window.print` stands in as a spy: happy-dom has none, and a test never opens a real dialog. */
const spyPrint = () => {
  const print = vi.fn();
  Object.defineProperty(window, 'print', { value: print, configurable: true, writable: true });
  return print;
};

describe('ListPageTemplate: Export (D-01, D-07, D-13, D-25)', () => {
  const createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
  beforeEach(() => {
    // happy-dom has no blob: URLs; the browser's save is an object URL on a clicked <a download>.
    createObjectURL.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'print');
  });

  it.each([
    ['csv', COMMON.dt_button_csv],
    ['xlsx', COMMON.dt_button_excel],
  ])(
    '%s sends format, column and header with q, sort and the filters; never the cursor, the limit, a key or the presentation',
    async (format, label) => {
      answer = (url) =>
        url.pathname === EXPORT_PATH ? csv() : { status: HTTP_OK, body: page(people(3)) };
      show(
        <ListPageTemplate
          {...props({ filters: { 'filter[active]': true } })}
          exportAction={EXPORT_ACTION}
        />,
        { searchParams: '?q=ada&sort=-email&cursor=c9&limit=50' },
      );
      await screen.findByTestId('list-table');
      await chooseExport(label);
      await waitFor(() => {
        expect(exportRequests()).toHaveLength(1);
      });
      const [sent] = exportRequests();
      expect(sent?.searchParams.get('format')).toBe(format);
      expect(sent?.searchParams.getAll('column')).toEqual([...MEMBER_EXPORT_COLUMNS]);
      expect(sent?.searchParams.getAll('header')).toEqual([
        'Staff ID',
        'First Name',
        'Last Name',
        'Email',
        'Role',
        'Active',
        'Last Login',
      ]);
      expect(sent?.searchParams.get('q')).toBe('ada');
      expect(sent?.searchParams.get('sort')).toBe('-email');
      expect(sent?.searchParams.get('filter[active]')).toBe('true');
      for (const key of ['cursor', 'limit', 'key', ...PRESENTATION]) {
        expect(sent?.searchParams.has(key), key).toBe(false);
      }
    },
  );

  it('PDF also sends the presentation: the title, yes and no, one blank per column, the date and time format and the zone', async () => {
    answer = (url) =>
      url.pathname === EXPORT_PATH ? csv() : { status: HTTP_OK, body: page(people(3)) };
    show(
      <ListPageTemplate
        {...props()}
        exportAction={{ ...EXPORT_ACTION, blanks: { roleName: 'No role', lastLogin: 'Never' } }}
      />,
    );
    await screen.findByTestId('list-table');
    await chooseExport(COMMON.dt_button_pdf);
    await waitFor(() => {
      expect(exportRequests()).toHaveLength(1);
    });
    const [sent] = exportRequests();
    expect(sent?.searchParams.get('format')).toBe('pdf');
    expect(sent?.searchParams.get('title')).toBe('Staff Members');
    expect(sent?.searchParams.get('yes')).toBe(COMMON.is_active_export);
    expect(sent?.searchParams.get('no')).toBe(COMMON.is_not_active_export);
    expect(sent?.searchParams.getAll('blank')).toEqual(['', '', '', '', 'No role', '', 'Never']);
    // No FormatSettingsProvider here: the Perfex defaults, and the deployment zone.
    expect(sent?.searchParams.get('dateFormat')).toBe('Y-m-d');
    expect(sent?.searchParams.get('timeFormat')).toBe('24');
    expect(sent?.searchParams.get('timeZone')).toBe('Asia/Dubai');
    expect(sent?.searchParams.getAll('column')).toEqual([...MEMBER_EXPORT_COLUMNS]);
  });

  it('Print reads format=print with the presentation, mounts the print view with the rows, prints once and removes the view on afterprint; the URL never changes', async () => {
    const print = spyPrint();
    const onUrlUpdate = vi.fn();
    answer = (url) =>
      url.pathname === EXPORT_PATH
        ? { status: HTTP_OK, body: PRINT_ROWS }
        : { status: HTTP_OK, body: page(people(3)) };
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />, {
      searchParams: '?q=ada',
      onUrlUpdate,
    });
    await screen.findByTestId('list-table');
    onUrlUpdate.mockClear();
    await chooseExport(COMMON.dt_button_print);
    const view = await waitFor(() => {
      const found = document.body.querySelector('[data-print-view]');
      if (found === null) throw new Error('no print view yet');
      return found;
    });
    const [sent] = exportRequests();
    expect(sent?.searchParams.get('format')).toBe('print');
    expect(sent?.searchParams.get('q')).toBe('ada');
    expect(sent?.searchParams.get('title')).toBe('Staff Members');
    expect(sent?.searchParams.getAll('blank')).toHaveLength(MEMBER_EXPORT_COLUMNS.length);
    for (const key of PRESENTATION) expect(sent?.searchParams.has(key), key).toBe(true);
    expect([...view.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(
      PRINT_ROWS.headers,
    );
    expect(view.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(print).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('list-export').textContent).toBe(COMMON.preparing_print);
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(document.body.querySelector('[data-print-view]')).toBeNull();
    expect(screen.getByTestId('list-export').textContent).toBe(COMMON.dt_button_export);
    expect(print).toHaveBeenCalledTimes(1);
    expect(onUrlUpdate).not.toHaveBeenCalled();
    expect(screen.getByTestId('list-table')).toBeTruthy();
  });

  it('while a file runs the trigger reads "Exporting…" and is disabled; nothing else is sent', async () => {
    answer = (url) =>
      url.pathname === EXPORT_PATH ? 'pending' : { status: HTTP_OK, body: page(people(3)) };
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    await screen.findByTestId('list-table');
    await chooseExport(COMMON.dt_button_csv);
    const running = await screen.findByRole('button', { name: EXPORTING });
    expect((running as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(running);
    expect(exportRequests()).toHaveLength(1);
    expect(screen.queryByTestId('list-export-error')).toBeNull();
  });

  it('success: the file is saved and nothing else changes; no toast, no alert, no status line', async () => {
    answer = (url) =>
      url.pathname === EXPORT_PATH ? csv() : { status: HTTP_OK, body: page(people(3)) };
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    await screen.findByTestId('list-table');
    await chooseExport(COMMON.dt_button_csv);
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
    });
    await screen.findByRole('button', { name: COMMON.dt_button_export });
    expect(screen.queryByTestId('list-export-error')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a failure that retrying can fix (a 503) shows export_failed with Retry; Retry repeats the same format; the rows stay', async () => {
    answer = (url) =>
      url.pathname === EXPORT_PATH
        ? blobProblem(SERVICE_UNAVAILABLE, [])
        : { status: HTTP_OK, body: page(people(3)) };
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    await screen.findByTestId('list-table');
    await chooseExport(COMMON.dt_button_excel);
    const error = await screen.findByTestId('list-export-error');
    expect(error.textContent).toContain(EXPORT_FAILED);
    expect(error.textContent).not.toMatch(/ERP-|503/);
    expect(screen.getByTestId('list-table')).toBeTruthy();
    await userEvent.click(within(error).getByRole('button', { name: COMMON.retry }));
    await waitFor(() => {
      expect(exportRequests()).toHaveLength(2);
    });
    expect(exportRequests().map((url) => url.searchParams.get('format'))).toEqual(['xlsx', 'xlsx']);
  });

  it('a Print that fails (network) shows print_failed with Retry, which prints again', async () => {
    spyPrint();
    answer = (url) =>
      url.pathname === EXPORT_PATH
        ? { status: SERVICE_UNAVAILABLE, body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001') }
        : { status: HTTP_OK, body: page(people(3)) };
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    await screen.findByTestId('list-table');
    await chooseExport(COMMON.dt_button_print);
    const error = await screen.findByTestId('list-export-error');
    expect(error.textContent).toContain(COMMON.print_failed);
    expect(document.body.querySelector('[data-print-view]')).toBeNull();
    await userEvent.click(within(error).getByRole('button', { name: COMMON.retry }));
    await waitFor(() => {
      expect(exportRequests()).toHaveLength(2);
    });
    expect(exportRequests().map((url) => url.searchParams.get('format'))).toEqual([
      'print',
      'print',
    ]);
  });

  it('a header-count refusal (400 on path header) is the plain export message, never the code', async () => {
    answer = (url) =>
      url.pathname === EXPORT_PATH
        ? blobProblem(BAD_REQUEST, [{ path: ['header'], message: 'expected 7 headers' }])
        : { status: HTTP_OK, body: page(people(3)) };
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    await screen.findByTestId('list-table');
    await chooseExport(COMMON.dt_button_csv);
    const error = await screen.findByTestId('list-export-error');
    expect(error.textContent).toContain(EXPORT_FAILED);
    expect(error.textContent).not.toMatch(/ERP-|\b400\b|header/);
  });

  it('a 403 after a permission change shows the plain-language refusal without Retry (D-32)', async () => {
    answer = (url) =>
      url.pathname === EXPORT_PATH
        ? {
            status: FORBIDDEN,
            body: new Blob([JSON.stringify(problem(FORBIDDEN, 'ERP-AUTH-0005'))], {
              type: 'application/problem+json',
            }),
          }
        : { status: HTTP_OK, body: page(people(3)) };
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    await screen.findByTestId('list-table');
    await chooseExport(COMMON.dt_button_csv);
    const error = await screen.findByTestId('list-export-error');
    expect(error.textContent).toContain(COMMON.errors['ERP-AUTH-0005']);
    expect(error.textContent).not.toMatch(/ERP-|403/);
    expect(within(error).queryByRole('button')).toBeNull();
  });

  it('a PDF refused on [font] (D-24) shows pdf_unsupported_text without Retry', async () => {
    answer = (url) =>
      url.pathname === EXPORT_PATH
        ? blobProblem(BAD_REQUEST, [{ path: ['font'], message: 'text the PDF font cannot draw' }])
        : { status: HTTP_OK, body: page(people(3)) };
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    await screen.findByTestId('list-table');
    await chooseExport(COMMON.dt_button_pdf);
    const error = await screen.findByTestId('list-export-error');
    expect(error.textContent).toContain(COMMON.pdf_unsupported_text);
    expect(within(error).queryByRole('button')).toBeNull();
  });

  it('nothing export-related renders while the list is loading (D-39)', () => {
    answer = () => 'pending';
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    expect(screen.getByTestId('list-loading')).toBeTruthy();
    expect(screen.queryByTestId('list-export')).toBeNull();
    expect(screen.queryByTestId('list-export-error')).toBeNull();
    expect(screen.queryByTestId('list-export-scope')).toBeNull();
    expect(document.body.querySelector('[data-print-view]')).toBeNull();
  });

  it('a screen cannot send a label count that differs from its export columns, nor a blank for a column it does not export', () => {
    const columns = ['roleId', 'name', 'memberCount'] as const;
    const path = '/api/v1/identity/roles/export' as const;
    const ok = (
      <ListPageTemplate
        {...props()}
        exportAction={{
          path,
          columns,
          labels: { roleId: 'Role ID', name: 'Name', memberCount: 'Members' },
          blanks: { name: 'None' },
        }}
      />
    );
    const missing = (
      <ListPageTemplate
        {...props()}
        exportAction={{
          path,
          columns,
          // @ts-expect-error -- memberCount has no label: one label per export column
          labels: { roleId: 'Role ID', name: 'Name' },
        }}
      />
    );
    const extra = (
      <ListPageTemplate
        {...props()}
        exportAction={{
          path,
          columns,
          labels: {
            roleId: 'Role ID',
            name: 'Name',
            memberCount: 'Members',
            // @ts-expect-error -- lastLogin is not an export column of this list
            lastLogin: 'Last Login',
          },
        }}
      />
    );
    const strayBlank = (
      <ListPageTemplate
        {...props()}
        exportAction={{
          path,
          columns,
          labels: { roleId: 'Role ID', name: 'Name', memberCount: 'Members' },
          // @ts-expect-error -- lastLogin is not an export column of this list
          blanks: { lastLogin: 'Never' },
        }}
      />
    );
    expect([ok, missing, extra, strayBlank]).toHaveLength(4);
  });

  it('exportAction null: no Export trigger', async () => {
    show(<ListPageTemplate {...props()} exportAction={null} />);
    await screen.findByTestId('list-table');
    expect(screen.queryByTestId('list-export')).toBeNull();
  });

  it('without ticks Export sits before the create link, second to last in the toolbar (D-30)', async () => {
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    await screen.findByTestId('list-table');
    const trigger = screen.getByTestId('list-export');
    const create = screen.getByRole('link', { name: 'New Staff Member' });
    expect(trigger.parentElement?.lastElementChild).toBe(create);
    expect(create.previousElementSibling).toBe(trigger);
  });

  it('under ar the menu has no PDF item (D-09); CSV, Excel and Print stay', async () => {
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />, { locale: 'ar' });
    await screen.findByTestId('list-table');
    await userEvent.click(screen.getByTestId('list-export'));
    const menu = await screen.findByRole('menu');
    expect(
      [...menu.querySelectorAll('[role="menuitem"]')].map((el) => el.getAttribute('data-testid')),
    ).toEqual(['list-export-csv', 'list-export-xlsx', 'list-export-print']);
  });
});

describe('ListPageTemplate: which rows (D-03, D-05, D-27, D-30)', () => {
  const bulk = (): ListPageTemplateProps<Row> =>
    props({ bulkActions: [{ id: 'deactivate', label: 'Deactivate', onSelect: vi.fn() }] });
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
    answer = (url) =>
      url.pathname === EXPORT_PATH
        ? csv()
        : {
            status: HTTP_OK,
            body: page(people(PAGE), {
              nextCursor: 'n1',
              total: TOTAL,
              exportLimit: 10_000,
              printLimit: 1000,
            }),
          };
  });

  it('two rows ticked: Export sits between Bulk actions and Clear selection, says 2 selected rows, and sends both keys as key', async () => {
    show(<ListPageTemplate {...bulk()} exportAction={EXPORT_ACTION} />);
    const table = await screen.findByTestId('list-table');
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Select Person 1' }));
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Select Person 2' }));
    const bar = screen.getByTestId('list-selection-bar');
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      BULK_ACTIONS,
      COMMON.dt_button_export,
      CLEAR_SELECTION,
    ]);
    await userEvent.click(within(bar).getByTestId('list-export'));
    expect((await screen.findByTestId('list-export-scope')).textContent).toBe('2 selected rows');
    await userEvent.click(await screen.findByRole('menuitem', { name: COMMON.dt_button_csv }));
    await waitFor(() => {
      expect(exportRequests()).toHaveLength(1);
    });
    expect(exportRequests()[0]?.searchParams.getAll('key')).toEqual(['1', '2']);
    expect(screen.getByTestId('list-selection-bar')).toBeTruthy();
  });

  it('"select all matching" on: the scope is every matching row and no key is sent', async () => {
    show(<ListPageTemplate {...bulk()} exportAction={EXPORT_ACTION} />);
    const table = await screen.findByTestId('list-table');
    await userEvent.click(within(table).getByRole('checkbox', { name: SELECT_ALL_ON_PAGE }));
    await userEvent.click(screen.getByRole('button', { name: 'Select all 1,240 matching' }));
    await userEvent.click(
      within(screen.getByTestId('list-selection-bar')).getByTestId('list-export'),
    );
    expect((await screen.findByTestId('list-export-scope')).textContent).toBe(
      'All 1,240 matching rows',
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: COMMON.dt_button_csv }));
    await waitFor(() => {
      expect(exportRequests()).toHaveLength(1);
    });
    expect(exportRequests()[0]?.searchParams.has('key')).toBe(false);
  });

  it('a list without bulk actions has no checkbox column and never sends key; its scope is every matching row', async () => {
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    const table = await screen.findByTestId('list-table');
    expect(within(table).queryAllByRole('checkbox')).toHaveLength(0);
    await userEvent.click(screen.getByTestId('list-export'));
    expect((await screen.findByTestId('list-export-scope')).textContent).toBe(
      'All 1,240 matching rows',
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: COMMON.dt_button_csv }));
    await waitFor(() => {
      expect(exportRequests()).toHaveLength(1);
    });
    expect(exportRequests()[0]?.searchParams.has('key')).toBe(false);
  });

  it('selectionLabel (opt-in) words the selection bar from the ticked rows', async () => {
    show(
      <ListPageTemplate
        {...bulk()}
        selectionLabel={({ rows, count }) => `${String(count)} rows of ${rows[0]?.name ?? ''}`}
      />,
    );
    const table = await screen.findByTestId('list-table');
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Select Person 2' }));
    expect(screen.getByTestId('list-selection-bar').textContent).toContain('1 rows of Person 2');
  });

  it('selectAllMatching={false} (opt-out) never offers "Select all {total} matching"', async () => {
    show(<ListPageTemplate {...bulk()} selectAllMatching={false} />);
    const table = await screen.findByTestId('list-table');
    await userEvent.click(within(table).getByRole('checkbox', { name: SELECT_ALL_ON_PAGE }));
    expect(screen.getByTestId('list-select-all')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Select all 1,240 matching' })).toBeNull();
  });

  it('while rows are ticked the ticked count decides the caps, not the total (D-06)', async () => {
    show(<ListPageTemplate {...bulk()} exportAction={EXPORT_ACTION} />);
    const table = await screen.findByTestId('list-table');
    await userEvent.click(screen.getByTestId('list-export'));
    expect((await screen.findByTestId('list-export-pdf')).getAttribute('aria-disabled')).toBe(
      'true',
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Select Person 3' }));
    await userEvent.click(
      within(screen.getByTestId('list-selection-bar')).getByTestId('list-export'),
    );
    expect((await screen.findByTestId('list-export-pdf')).hasAttribute('aria-disabled')).toBe(
      false,
    );
  });
});

interface Selection {
  readonly rows: readonly Row[];
  readonly allMatching: boolean;
}

describe('ListPageTemplate — bulk selection (D-27, UI-SPEC choice 17)', () => {
  const onBulk = vi.fn<(selection: Selection) => void>();
  const bulk = (): ListPageTemplateProps<Row> =>
    props({ bulkActions: [{ id: 'deactivate', label: 'Deactivate', onSelect: onBulk }] });

  beforeEach(() => {
    onBulk.mockClear();
    answer = () => ({
      status: HTTP_OK,
      body: page(people(PAGE), { nextCursor: 'n1', total: TOTAL, rangeStart: 1 }),
    });
  });

  it.each([
    ['absent', {}],
    ['[]', { bulkActions: [] }],
  ])(
    'bulkActions %s: no checkbox column, no selection bar, no select-all line',
    async (_label, extra) => {
      show(<ListPageTemplate {...props(extra)} />);
      const table = await screen.findByTestId('list-table');
      expect(within(table).queryAllByRole('checkbox')).toHaveLength(0);
      expect(screen.queryByTestId('list-selection-bar')).toBeNull();
      expect(screen.queryByTestId('list-select-all')).toBeNull();
    },
  );

  it('one bulk action: a 40 px checkbox column, "Select all on this page" and "Select <name>" per row', async () => {
    show(<ListPageTemplate {...bulk()} />);
    const table = await screen.findByTestId('list-table');
    expect(within(table).getByRole('checkbox', { name: SELECT_ALL_ON_PAGE })).toBeTruthy();
    const box = within(table).getByRole('checkbox', { name: 'Select Person 1' });
    expect(box.closest('td')?.className.split(' ')).toContain('w-10');
    expect(within(table).getAllByRole('checkbox')).toHaveLength(1 + PAGE);
  });

  it('checking one row replaces the toolbar with "1 selected", Bulk actions, Export and Clear selection; search stays', async () => {
    show(<ListPageTemplate {...bulk()} exportAction={EXPORT_ACTION} />);
    const table = await screen.findByTestId('list-table');
    expect(screen.queryByTestId('list-selection-bar')).toBeNull();
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Select Person 1' }));
    const bar = screen.getByTestId('list-selection-bar');
    expect(bar.textContent).toContain('1 selected');
    expect(within(bar).getByRole('button', { name: BULK_ACTIONS })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: CLEAR_SELECTION })).toBeTruthy();
    // Export stays reachable while rows are ticked: it moves into the bar (D-30).
    expect(within(bar).getByTestId('list-export')).toBeTruthy();
    expect(screen.getAllByTestId('list-export')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'New Staff Member' })).toBeNull();
    expect(screen.getByRole('textbox', { name: SEARCH })).toBeTruthy();
  });

  it('a click or Space on a selection checkbox, or a near miss in its cell, never opens the row', async () => {
    show(<ListPageTemplate {...bulk()} />);
    const table = await screen.findByTestId('list-table');
    const box = within(table).getByRole('checkbox', { name: 'Select Person 2' });
    await userEvent.click(box);
    expect(box.getAttribute('aria-checked')).toBe('true');
    box.focus();
    await userEvent.keyboard(' ');
    expect(box.getAttribute('aria-checked')).toBe('false');
    const cell = box.closest('td');
    if (cell === null) throw new Error('no selection cell');
    fireEvent.click(cell);
    expect(onRowOpen).not.toHaveBeenCalled();
    expect(followed).toEqual([]);
  });

  it('every row checked: "All 25 on this page are selected." and "Select all 1,240 matching"; then all matching, and the action gets { rows, allMatching: true }', async () => {
    show(<ListPageTemplate {...bulk()} />);
    const table = await screen.findByTestId('list-table');
    await userEvent.click(within(table).getByRole('checkbox', { name: SELECT_ALL_ON_PAGE }));
    const line = screen.getByTestId('list-select-all');
    expect(line.textContent).toContain('All 25 on this page are selected.');
    await userEvent.click(within(line).getByRole('button', { name: 'Select all 1,240 matching' }));
    expect(screen.getByTestId('list-select-all').textContent).toContain(
      'All 1,240 matching are selected.',
    );
    expect(screen.getByTestId('list-selection-bar').textContent).toContain('1,240 selected');
    await userEvent.click(screen.getByRole('button', { name: BULK_ACTIONS }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));
    expect(onBulk).toHaveBeenCalledTimes(1);
    const selection = onBulk.mock.calls[0]?.[0];
    expect(selection?.allMatching).toBe(true);
    expect(selection?.rows).toHaveLength(PAGE);
  });

  it('the menu sizes to its labels (never the trigger width), and a destructive entry sits after a separator, in red', async () => {
    show(
      <ListPageTemplate
        {...props({
          bulkActions: [
            { id: 'deactivate', label: 'Deactivate', onSelect: onBulk },
            { id: 'delete', label: 'Delete items', kind: 'destructive', onSelect: onBulk },
          ],
        })}
      />,
    );
    const table = await screen.findByTestId('list-table');
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Select Person 1' }));
    await userEvent.click(screen.getByRole('button', { name: BULK_ACTIONS }));
    const menu = await screen.findByRole('menu');
    expect(menu.className).toContain('w-auto');
    expect(menu.className).toContain('min-w-(--radix-dropdown-menu-trigger-width)');
    const children = [...menu.children];
    const remove = within(menu).getByRole('menuitem', { name: 'Delete items' });
    expect(children.indexOf(remove)).toBe(2);
    expect(children[1]?.getAttribute('role')).toBe('separator');
    expect(remove.getAttribute('data-variant')).toBe('destructive');
    expect(
      within(menu).getByRole('menuitem', { name: 'Deactivate' }).getAttribute('data-variant'),
    ).toBe('default');
  });

  it('a partial selection hands exactly the checked rows, allMatching false; the header box is mixed', async () => {
    show(<ListPageTemplate {...bulk()} />);
    const table = await screen.findByTestId('list-table');
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Select Person 3' }));
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Select Person 5' }));
    expect(
      within(table)
        .getByRole('checkbox', { name: SELECT_ALL_ON_PAGE })
        .getAttribute('aria-checked'),
    ).toBe('mixed');
    expect(screen.queryByTestId('list-select-all')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: BULK_ACTIONS }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));
    expect(onBulk.mock.calls[0]?.[0]).toEqual({
      rows: [...people(1, 3), ...people(1, 5)],
      allMatching: false,
    });
  });

  it('Clear selection empties it; a page change (Next) clears it too', async () => {
    show(<ListPageTemplate {...bulk()} />);
    const table = await screen.findByTestId('list-table');
    const first = () => within(table).getByRole('checkbox', { name: 'Select Person 1' });
    await userEvent.click(first());
    await userEvent.click(screen.getByRole('button', { name: CLEAR_SELECTION }));
    expect(screen.queryByTestId('list-selection-bar')).toBeNull();
    expect(first().getAttribute('aria-checked')).toBe('false');
    await userEvent.click(first());
    expect(screen.getByTestId('list-selection-bar')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: COMMON.next }));
    await waitFor(() => {
      expect(screen.queryByTestId('list-selection-bar')).toBeNull();
    });
  });

  it('uses no physical-direction class under ar (the selection bar, the select-all line and the export error included)', async () => {
    answer = (url) =>
      url.pathname === EXPORT_PATH
        ? blobProblem(SERVICE_UNAVAILABLE, [])
        : {
            status: HTTP_OK,
            body: page(people(PAGE), { nextCursor: 'n1', total: TOTAL, rangeStart: 1 }),
          };
    const { container } = show(<ListPageTemplate {...bulk()} exportAction={EXPORT_ACTION} />, {
      locale: 'ar',
    });
    const table = await screen.findByTestId('list-table');
    await chooseExport(COMMON.dt_button_csv);
    await screen.findByTestId('list-export-error');
    const [selectAll] = within(table).getAllByRole('checkbox');
    if (selectAll === undefined) throw new Error('no select-all checkbox');
    await userEvent.click(selectAll);
    expect(screen.getByTestId('list-selection-bar')).toBeTruthy();
    expect(screen.getByTestId('list-select-all')).toBeTruthy();
    expect(physicalClassesIn(container)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Lead decisions, 2026-09-26: sticky pager, the export limit with its numbers, stale cursors
// ---------------------------------------------------------------------------------------------

const EXPORT_LIMITED =
  'Export is limited to 10,000 rows. This list has 12,500. Narrow the search or filter to export.';
const EXPORT_TOO_MANY =
  'This list has more rows than an export allows. Narrow the search or filter to export.';
const PAGE_UNAVAILABLE = 'This page is no longer available';
const BACK_TO_FIRST_PAGE = 'Back to first page';

describe('ListPageTemplate — sticky pager (lead decision 1)', () => {
  it('the pager is a sticky bar at the bottom of the viewport, in flow after the table (so it never covers the last row), with logical classes only', async () => {
    answer = () => ({
      status: HTTP_OK,
      body: page(people(PAGE), { nextCursor: 'n1', total: TOTAL, rangeStart: 1 }),
    });
    const { container } = show(<ListPageTemplate {...props()} />, { locale: 'ar' });
    const table = await screen.findByTestId('list-table');
    const bar = screen.getByTestId('list-pager');
    expect(bar.className.split(' ')).toEqual(
      expect.arrayContaining(['sticky', 'bottom-0', 'bg-background', 'border-t']),
    );
    expect(within(bar).getByTestId('pager-range').textContent).toBe('Showing 1–25 of 1,240');
    expect(table.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(physicalClassesIn(container)).toEqual([]);
  });
});

describe('ListPageTemplate: the caps, told before the click (D-06, lead decision 2b)', () => {
  const createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
  beforeEach(() => {
    createObjectURL.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
  });

  it('total over meta.exportLimit: CSV and Excel are aria-disabled with the caption before any click, described by the sentence, and send nothing', async () => {
    answer = (url) =>
      url.pathname === EXPORT_PATH
        ? csv()
        : {
            status: HTTP_OK,
            body: page(people(3), { total: 12_500, exportLimit: 10_000, printLimit: 1000 }),
          };
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    await screen.findByTestId('list-table');
    // The trigger itself is never disabled for a cap: the menu must open to say why.
    const trigger = screen.getByTestId('list-export');
    expect(trigger.hasAttribute('aria-disabled')).toBe(false);
    await userEvent.click(trigger);
    const item = await screen.findByRole('menuitem', { name: COMMON.dt_button_csv });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(item.textContent).toContain('Limited to 10,000 rows');
    // The description is in the DOM all the time: a screen reader hears it without hovering.
    const describedBy = item.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toBe(EXPORT_LIMITED);
    await userEvent.click(item);
    await userEvent.click(screen.getByRole('menuitem', { name: COMMON.dt_button_print }));
    expect(exportRequests()).toHaveLength(0);
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('totals within both caps: every item is enabled and carries no description', async () => {
    answer = (url) =>
      url.pathname === EXPORT_PATH
        ? csv()
        : {
            status: HTTP_OK,
            body: page(people(3), { total: 3, exportLimit: 10_000, printLimit: 1000 }),
          };
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    await screen.findByTestId('list-table');
    await userEvent.click(screen.getByTestId('list-export'));
    for (const item of await screen.findAllByRole('menuitem')) {
      expect(item.hasAttribute('aria-disabled')).toBe(false);
      expect(item.hasAttribute('aria-describedby')).toBe(false);
    }
    await userEvent.click(screen.getByRole('menuitem', { name: COMMON.dt_button_csv }));
    await waitFor(() => {
      expect(exportRequests()).toHaveLength(1);
    });
  });

  it('the race: a CSV refusal with params says export_limited with the same numbers, with no Retry and never the code', async () => {
    answer = (url) =>
      url.pathname === EXPORT_PATH
        ? blobProblem(BAD_REQUEST, [
            {
              path: ['export'],
              message: 'too many rows to export',
              params: { limit: 10_000, total: 12_500 },
            },
          ])
        : { status: HTTP_OK, body: page(people(3), { total: 3, exportLimit: 10_000 }) };
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    await screen.findByTestId('list-table');
    await chooseExport(COMMON.dt_button_csv);
    const error = await screen.findByTestId('list-export-error');
    expect(error.textContent).toContain(EXPORT_LIMITED);
    expect(error.textContent).not.toMatch(/ERP-|\b400\b/);
    expect(within(error).queryByRole('button')).toBeNull();
  });

  it('the race on Print: a refusal with params says print_limited naming Print, with no Retry', async () => {
    spyPrint();
    answer = (url) =>
      url.pathname === EXPORT_PATH
        ? {
            status: BAD_REQUEST,
            body: {
              ...problem(BAD_REQUEST, 'ERP-VALIDATION-0001'),
              issues: [
                {
                  path: ['export'],
                  message: 'too many rows to export',
                  params: { limit: 1000, total: 1240 },
                },
              ],
            },
          }
        : { status: HTTP_OK, body: page(people(3), { total: 3, printLimit: 1000 }) };
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    await screen.findByTestId('list-table');
    await chooseExport(COMMON.dt_button_print);
    const error = await screen.findByTestId('list-export-error');
    expect(error.textContent).toContain(
      'Print is limited to 1,000 rows. This list has 1,240. Narrow the search or filter, or choose CSV or Excel.',
    );
    expect(within(error).queryByRole('button')).toBeNull();
    expect(document.body.querySelector('[data-print-view]')).toBeNull();
    Reflect.deleteProperty(window, 'print');
  });

  it('an older api (no limits): every item stays enabled even for a huge total; a refusal without params is a plain message without numbers and no Retry', async () => {
    answer = (url) =>
      url.pathname === EXPORT_PATH
        ? blobProblem(BAD_REQUEST, [{ path: ['export'], message: 'too many rows to export' }])
        : { status: HTTP_OK, body: page(people(3), { total: 50_000 }) };
    show(<ListPageTemplate {...props()} exportAction={EXPORT_ACTION} />);
    await screen.findByTestId('list-table');
    await userEvent.click(screen.getByTestId('list-export'));
    for (const item of await screen.findAllByRole('menuitem')) {
      expect(item.hasAttribute('aria-disabled')).toBe(false);
    }
    await userEvent.click(screen.getByRole('menuitem', { name: COMMON.dt_button_csv }));
    const error = await screen.findByTestId('list-export-error');
    expect(error.textContent).toContain(EXPORT_TOO_MANY);
    expect(error.textContent).not.toMatch(/\d/);
    expect(within(error).queryByRole('button')).toBeNull();
  });
});

describe('ListPageTemplate — a stale or tampered cursor (lead decision 3)', () => {
  it('a tampered cursor (400 on path cursor): "This page is no longer available"; Back to first page clears ONLY the cursor', async () => {
    answer = (url) =>
      url.searchParams.has('cursor')
        ? {
            status: BAD_REQUEST,
            body: {
              ...problem(BAD_REQUEST, 'ERP-VALIDATION-0001'),
              issues: [{ path: ['cursor'], message: 'cursor is not a cursor of this list' }],
            },
          }
        : { status: HTTP_OK, body: page(people(3)) };
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    show(<ListPageTemplate {...props()} />, {
      searchParams: '?cursor=tampered&q=ada&sort=-email&limit=50',
      onUrlUpdate,
    });
    const stale = await screen.findByTestId('list-stale-page');
    expect(within(stale).getByRole('heading', { name: PAGE_UNAVAILABLE })).toBeTruthy();
    for (const id of ['list-error', 'list-empty', 'list-no-results', 'list-table']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    await userEvent.click(within(stale).getByRole('button', { name: BACK_TO_FIRST_PAGE }));
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalled();
    });
    const update = onUrlUpdate.mock.lastCall?.[0];
    expect(update?.searchParams.has('cursor')).toBe(false);
    expect(update?.searchParams.get('q')).toBe('ada');
    expect(update?.searchParams.get('sort')).toBe('-email');
    expect(update?.searchParams.get('limit')).toBe('50');
  });

  it('a page with a cursor that came back empty (total known or not): the same message, not "nothing yet"', async () => {
    for (const meta of [{ total: 40 }, { total: undefined, rangeStart: undefined }]) {
      answer = () => ({ status: HTTP_OK, body: page([], meta) });
      show(<ListPageTemplate {...props()} />, { searchParams: '?cursor=stale' });
      const stale = await screen.findByTestId('list-stale-page');
      expect(within(stale).getByRole('button', { name: BACK_TO_FIRST_PAGE })).toBeTruthy();
      expect(screen.queryByTestId('list-empty')).toBeNull();
      expect(screen.queryByTestId('list-no-results')).toBeNull();
      cleanup();
    }
  });

  it('never on the first page: no cursor and no rows is the normal "nothing yet"', async () => {
    answer = () => ({ status: HTTP_OK, body: page([]) });
    show(<ListPageTemplate {...props()} />);
    await screen.findByTestId('list-empty');
    expect(screen.queryByTestId('list-stale-page')).toBeNull();
  });

  it('a validation refusal NOT about the cursor stays the ordinary inline error, even with a cursor', async () => {
    answer = () => ({
      status: BAD_REQUEST,
      body: {
        ...problem(BAD_REQUEST, 'ERP-VALIDATION-0001'),
        issues: [{ path: ['sort'], message: 'not a sort of this list' }],
      },
    });
    show(<ListPageTemplate {...props()} />, { searchParams: '?sort=lastLogin&cursor=c1' });
    await screen.findByTestId('list-error');
    expect(screen.queryByTestId('list-stale-page')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Kit A (plan 04.2-05): URL filters (K1), the filter bar (K2), the Columns menu feeding the export
// (K4, 4.1.1 D-13), the header slot and the toolbar slots (the K5 slot)
// ---------------------------------------------------------------------------------------------

const FILTER_DEFS: readonly ListFilterDef[] = [
  { key: 'role[in]' },
  { key: 'active[eq]', defaultValue: '1' },
];

/** A control that shows its trigger text and sets one fixed value, standing in for a picker. */
const pick = (key: string, label: string, next: string | readonly string[]): FilterControl => ({
  key,
  label,
  inline: true,
  render: ({ id, triggerText, onChange }) => (
    <button
      type="button"
      id={id}
      onClick={() => {
        onChange(next);
      }}
    >
      {triggerText}
    </button>
  ),
});

const FILTER_BAR = {
  defs: FILTER_DEFS,
  controls: [pick('role[in]', 'Role', ['3']), pick('active[eq]', 'Status', '0')],
};

const inlineFilters = () => screen.getByTestId('filter-bar-inline');

describe('ListPageTemplate: URL filters and the filter bar (K1, K2)', () => {
  it('the list request carries the effective filters in the api grammar; a default is sent too', async () => {
    show(<ListPageTemplate {...props({ filterBar: FILTER_BAR })} />, {
      searchParams: '?filter[role][in]=1,2',
    });
    await screen.findByTestId('list-table');
    const [sent] = listRequests();
    expect(sent?.searchParams.get('filter[role][in]')).toBe('1,2');
    expect(sent?.searchParams.get('filter[active][eq]')).toBe('1');
  });

  it('filterQuery turns the URL filters into the api query: what it answers is sent, never the raw URL value', async () => {
    const filterQuery = vi.fn((filters: Readonly<Record<string, string | readonly string[]>>) => ({
      'filter[role][in]': `mapped:${String(filters['role[in]'])}`,
    }));
    show(<ListPageTemplate {...props({ filterBar: FILTER_BAR, filterQuery })} />, {
      searchParams: '?filter[role][in]=1,2',
    });
    await screen.findByTestId('list-table');
    const [sent] = listRequests();
    expect(sent?.searchParams.get('filter[role][in]')).toBe('mapped:1,2');
    // The default it did not answer is not sent either: the screen's query is the whole query.
    expect(sent?.searchParams.has('filter[active][eq]')).toBe(false);
    expect(filterQuery).toHaveBeenCalledWith({ 'role[in]': ['1', '2'], 'active[eq]': '1' });
  });

  it('searchLabel names the search box and is its placeholder; without it the box reads Search', async () => {
    show(<ListPageTemplate {...props({ searchLabel: 'Search by recipient' })} />);
    await screen.findByTestId('list-table');
    const box = screen.getByRole('textbox', { name: 'Search by recipient' });
    expect(box.getAttribute('placeholder')).toBe('Search by recipient');
    cleanup();
    show(<ListPageTemplate {...props()} />);
    await screen.findByTestId('list-table');
    expect(screen.getByRole('textbox', { name: SEARCH })).toBeTruthy();
  });

  it('a filter change pushes the filter and drops the cursor in the same update', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    show(<ListPageTemplate {...props({ filterBar: FILTER_BAR })} />, {
      searchParams: '?cursor=c9&q=ada',
      onUrlUpdate,
    });
    await screen.findByTestId('list-table');
    await userEvent.click(within(inlineFilters()).getByRole('button', { name: 'Role' }));
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalled();
    });
    const update = onUrlUpdate.mock.lastCall?.[0];
    expect(update?.options.history).toBe('push');
    expect(update?.searchParams.get('filter[role][in]')).toBe('3');
    expect(update?.searchParams.has('cursor')).toBe(false);
    expect(update?.searchParams.get('q')).toBe('ada');
  });

  it('every export format carries the filter params (CSV and Print shown)', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
    const print = spyPrint();
    answer = (url) => {
      if (url.pathname !== EXPORT_PATH) return { status: HTTP_OK, body: page(people(3)) };
      return url.searchParams.get('format') === 'print'
        ? { status: HTTP_OK, body: PRINT_ROWS }
        : csv();
    };
    show(<ListPageTemplate {...props({ filterBar: FILTER_BAR })} exportAction={EXPORT_ACTION} />, {
      searchParams: '?filter[role][in]=1,2&filter[active][eq]=0',
    });
    await screen.findByTestId('list-table');
    await chooseExport(COMMON.dt_button_csv);
    await waitFor(() => {
      expect(exportRequests()).toHaveLength(1);
    });
    await chooseExport(COMMON.dt_button_print);
    await waitFor(() => {
      expect(exportRequests()).toHaveLength(2);
    });
    for (const sent of exportRequests()) {
      expect(sent.searchParams.get('filter[role][in]')).toBe('1,2');
      expect(sent.searchParams.get('filter[active][eq]')).toBe('0');
    }
    expect(print).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(window, 'print');
  });

  it('empty with a filter off its default (no q): "no results" with Clear search and filters, which clears q and every filter', async () => {
    answer = () => ({ status: HTTP_OK, body: page([]) });
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    show(<ListPageTemplate {...props({ filterBar: FILTER_BAR })} />, {
      searchParams: '?filter[role][in]=1&sort=-email',
      onUrlUpdate,
    });
    const none = await screen.findByTestId('list-no-results');
    expect(screen.queryByTestId('list-empty')).toBeNull();
    expect(within(none).queryByRole('button', { name: COMMON.clear_search })).toBeNull();
    await userEvent.click(
      within(none).getByRole('button', { name: COMMON.clear_search_and_filters }),
    );
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalled();
    });
    const update = onUrlUpdate.mock.lastCall?.[0];
    expect([...(update?.searchParams.keys() ?? [])].filter((k) => k.startsWith('filter['))).toEqual(
      [],
    );
    expect(update?.searchParams.has('q')).toBe(false);
    expect(update?.searchParams.get('sort')).toBe('-email');
  });

  it('empty with only q and every filter at its default: the existing "Clear search"', async () => {
    answer = () => ({ status: HTTP_OK, body: page([]) });
    show(<ListPageTemplate {...props({ filterBar: FILTER_BAR })} />, { searchParams: '?q=zzz' });
    const none = await screen.findByTestId('list-no-results');
    expect(within(none).getByRole('button', { name: COMMON.clear_search })).toBeTruthy();
    expect(
      within(none).queryByRole('button', { name: COMMON.clear_search_and_filters }),
    ).toBeNull();
  });

  it('while the list loads: the skeleton with its 32px filter row of four 192px bars, and no message (D-39)', () => {
    answer = () => 'pending';
    show(<ListPageTemplate {...props({ filterBar: FILTER_BAR })} />);
    const skeleton = screen.getByTestId('list-loading');
    const row = within(skeleton).getByTestId('skeleton-filter-row');
    expect(row.querySelectorAll('.h-8.w-48')).toHaveLength(4);
    for (const id of MESSAGE_IDS) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByTestId('filter-bar-inline')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offState (opt-in) replaces the whole page for the code it names, after the read failed; any other failure stays inline', async () => {
    answer = () => ({ status: 404, body: problem(404, 'ERP-SAMPLE-0019') });
    const offState = (code: string) =>
      code === 'ERP-SAMPLE-0019' ? <h1 data-testid="screen-off">Off</h1> : undefined;
    const { unmount } = show(<ListPageTemplate {...props()} offState={offState} />);
    expect(await screen.findByTestId('screen-off')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByTestId('list-error')).toBeNull();
    unmount();
    answer = () => ({ status: 503, body: problem(503, 'ERP-UPSTREAM-0001') });
    show(<ListPageTemplate {...props()} offState={offState} />);
    expect(await screen.findByTestId('list-error')).toBeTruthy();
    expect(screen.queryByTestId('screen-off')).toBeNull();
  });

  it('skeletonTriggers (opt-in) draws as many skeleton triggers as the screen has inline filters', () => {
    answer = () => 'pending';
    show(<ListPageTemplate {...props({ filterBar: { ...FILTER_BAR, skeletonTriggers: 2 } })} />);
    const row = within(screen.getByTestId('list-loading')).getByTestId('skeleton-filter-row');
    expect(row.querySelectorAll('.h-8.w-48')).toHaveLength(2);
  });

  it('without filterBar there is no filter row, in the skeleton or the page', async () => {
    answer = () => 'pending';
    const { unmount } = show(<ListPageTemplate {...props()} />);
    expect(screen.queryByTestId('skeleton-filter-row')).toBeNull();
    unmount();
    answer = () => ({ status: HTTP_OK, body: page(people(3)) });
    show(<ListPageTemplate {...props()} />);
    await screen.findByTestId('list-table');
    expect(screen.queryByTestId('filter-bar-inline')).toBeNull();
  });
});

describe('ListPageTemplate: header and toolbar slots (the K5 slot)', () => {
  it('header replaces the template <h1> and renders first; beforeColumns sits before Columns, beforeCreate before the create button', async () => {
    show(
      <ListPageTemplate
        {...props({
          header: (
            <div data-testid="record-header">
              <h1>Sample item 1</h1>
            </div>
          ),
          toolbar: {
            beforeColumns: <button type="button">More actions</button>,
            beforeCreate: <button type="button">Import items</button>,
          },
          columnsMenu: { storageKey: 'staff', fixed: ['name'] },
        })}
        exportAction={EXPORT_ACTION}
      />,
    );
    await screen.findByTestId('list-table');
    expect(screen.queryByRole('heading', { level: 1, name: 'Staff Members' })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const header = screen.getByTestId('record-header');
    expect(header.parentElement?.firstElementChild).toBe(header);
    const order = [
      screen.getByRole('button', { name: 'More actions' }),
      screen.getByTestId('list-columns'),
      screen.getByTestId('list-export'),
      screen.getByRole('button', { name: 'Import items' }),
      screen.getByRole('link', { name: 'New Staff Member' }),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]?.nextElementSibling, String(i)).toBe(order[i]);
    }
  });
});

describe('ListPageTemplate: the Columns menu feeding the export (K4, 4.1.1 D-13)', () => {
  const COLUMN_EXPORT = {
    path: EXPORT_PATH,
    columns: ['name', 'email', 'role'],
    labels: { name: 'Full Name', email: 'Email', role: 'Role' },
    blanks: { role: 'No role' },
  } as const;
  const COLUMNS_MENU = { storageKey: 'staff', fixed: ['name'] } as const;
  const openColumns = async () => {
    await userEvent.click(screen.getByTestId('list-columns'));
    return screen.findByRole('menu');
  };
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'print');
  });

  it('a checkbox item per hideable column in table order, the fixed one absent, Reset columns last', async () => {
    show(<ListPageTemplate {...props({ columnsMenu: COLUMNS_MENU })} />);
    await screen.findByTestId('list-table');
    expect(screen.getByTestId('list-columns').textContent).toContain(COMMON.columns);
    const menu = await openColumns();
    const boxes = within(menu).getAllByRole('menuitemcheckbox');
    expect(boxes.map((box) => box.textContent)).toEqual(['Email', 'Role']);
    expect(boxes.every((box) => box.getAttribute('aria-checked') === 'true')).toBe(true);
    const items = menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]');
    expect(items[items.length - 1]?.textContent).toBe(COMMON.reset_columns);
  });

  it('hiding a column removes it from the table and from the column, header and blank lists of Excel and Print, in table order', async () => {
    spyPrint();
    answer = (url) => {
      if (url.pathname !== EXPORT_PATH) return { status: HTTP_OK, body: page(people(3)) };
      return url.searchParams.get('format') === 'print'
        ? { status: HTTP_OK, body: PRINT_ROWS }
        : csv();
    };
    show(
      <ListPageTemplate {...props({ columnsMenu: COLUMNS_MENU })} exportAction={COLUMN_EXPORT} />,
    );
    const table = await screen.findByTestId('list-table');
    const menu = await openColumns();
    await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Email' }));
    await waitFor(() => {
      expect(within(table).queryByRole('columnheader', { name: /Email/ })).toBeNull();
    });
    expect(localStorage.getItem('erp.list.columns.staff.12')).toBe('["email"]');
    await userEvent.keyboard('{Escape}');
    await chooseExport(COMMON.dt_button_excel);
    await waitFor(() => {
      expect(exportRequests()).toHaveLength(1);
    });
    await chooseExport(COMMON.dt_button_print);
    await waitFor(() => {
      expect(exportRequests()).toHaveLength(2);
    });
    const [xlsx, printed] = exportRequests();
    expect(xlsx?.searchParams.getAll('column')).toEqual(['name', 'role']);
    expect(xlsx?.searchParams.getAll('header')).toEqual(['Full Name', 'Role']);
    expect(printed?.searchParams.getAll('column')).toEqual(['name', 'role']);
    expect(printed?.searchParams.getAll('header')).toEqual(['Full Name', 'Role']);
    expect(printed?.searchParams.getAll('blank')).toEqual(['', 'No role']);
  });

  it('a remembered choice is read on mount; Reset columns brings every column back', async () => {
    localStorage.setItem('erp.list.columns.staff.12', JSON.stringify(['role']));
    show(<ListPageTemplate {...props({ columnsMenu: COLUMNS_MENU })} />);
    const table = await screen.findByTestId('list-table');
    expect(within(table).queryByRole('columnheader', { name: 'Role' })).toBeNull();
    const menu = await openColumns();
    await userEvent.click(within(menu).getByRole('menuitem', { name: COMMON.reset_columns }));
    await waitFor(() => {
      expect(within(table).getByRole('columnheader', { name: 'Role' })).toBeTruthy();
    });
  });

  it('without columnsMenu there is no Columns button and every column shows', async () => {
    localStorage.setItem('erp.list.columns.staff.12', JSON.stringify(['role']));
    show(<ListPageTemplate {...props()} />);
    const table = await screen.findByTestId('list-table');
    expect(screen.queryByTestId('list-columns')).toBeNull();
    expect(within(table).getByRole('columnheader', { name: 'Role' })).toBeTruthy();
  });

  it('uses no physical-direction class under ar (filter bar, Columns and slots included)', async () => {
    const { container } = show(
      <ListPageTemplate
        {...props({
          filterBar: FILTER_BAR,
          columnsMenu: COLUMNS_MENU,
          toolbar: { beforeColumns: <span>x</span> },
        })}
      />,
      { locale: 'ar', searchParams: '?filter[role][in]=1' },
    );
    await screen.findByTestId('list-table');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Kit B (plan 04.2-06): the editable mode (K6) asks "Discard changes?" before any view change
// ---------------------------------------------------------------------------------------------

describe('ListPageTemplate: the editable mode guards every view change while dirty (K6)', () => {
  const editableSave = vi.fn(() => Promise.resolve({ ok: true as const }));
  const EDITABLE: EditableConfig<Row> = {
    mode: 'rows',
    columns: [{ id: 'name', kind: 'text', label: 'Full Name' }],
    rowId: (r) => String(r.id),
    toDraft: (r) => ({ name: r.name }),
    etagOf: (r) => `e${String(r.id)}`,
    rowName: (draft) => (typeof draft.name === 'string' ? draft.name : ''),
    issueText: () => 'Refused.',
    save: editableSave,
    labels: {
      listLabel: 'Staff',
      submit: 'Save staff',
      pending: 'Saving staff…',
      savedToast: 'Staff saved',
    },
    canEdit: true,
    canAdd: false,
  };
  const editableProps = (overrides: Partial<ListPageTemplateProps<Row>> = {}) =>
    props({ rowActions: () => [], editable: EDITABLE, ...overrides });

  async function makeDirty(): Promise<void> {
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Person 1' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Person 1: Full Name' }), 'x');
    expect(screen.getByTestId('save-bar')).toBeTruthy();
  }
  const discardDialog = () => screen.findByTestId('confirm-dialog');

  beforeEach(() => {
    answer = () => ({ status: HTTP_OK, body: page(people(3), { nextCursor: 'c2', total: 9 }) });
  });

  it('the pager Next while dirty asks first: Keep editing stays, Discard changes moves on and clears the edits', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    show(<ListPageTemplate {...editableProps()} />, { onUrlUpdate });
    await makeDirty();
    await userEvent.click(screen.getByRole('button', { name: COMMON.next }));
    const dialog = await discardDialog();
    expect(within(dialog).getByRole('heading').textContent).toBe(COMMON.discard_title);
    await userEvent.click(within(dialog).getByRole('button', { name: COMMON.keep_editing }));
    expect(onUrlUpdate).not.toHaveBeenCalled();
    expect(screen.getByTestId('save-bar')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: COMMON.next }));
    await userEvent.click(
      within(await discardDialog()).getByRole('button', { name: COMMON.discard_changes }),
    );
    await waitFor(() => {
      expect(onUrlUpdate.mock.lastCall?.[0].searchParams.get('cursor')).toBe('c2');
    });
    expect(screen.queryByTestId('save-bar')).toBeNull();
  });

  it('a sort header while dirty asks first; while clean it sorts at once', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    show(<ListPageTemplate {...editableProps()} />, { onUrlUpdate });
    await screen.findByTestId('editable-table');
    await userEvent.click(screen.getByRole('button', { name: 'Sort by Email' }));
    await waitFor(() => {
      expect(onUrlUpdate.mock.lastCall?.[0].searchParams.get('sort')).toBe('email');
    });
    onUrlUpdate.mockClear();
    await makeDirty();
    await userEvent.click(screen.getByRole('button', { name: 'Sort by Full Name' }));
    await discardDialog();
    expect(onUrlUpdate).not.toHaveBeenCalled();
  });

  it('typing in the search box while dirty asks first, and the search runs only on Discard changes', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    show(<ListPageTemplate {...editableProps()} />, { onUrlUpdate });
    await makeDirty();
    await userEvent.type(screen.getByRole('textbox', { name: SEARCH }), 'a');
    const dialog = await discardDialog();
    expect(onUrlUpdate).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: COMMON.discard_changes }));
    await waitFor(() => {
      expect(onUrlUpdate.mock.lastCall?.[0].searchParams.get('q')).toBe('a');
    });
  });

  it('a filter change while dirty asks first', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    show(<ListPageTemplate {...editableProps({ filterBar: FILTER_BAR })} />, { onUrlUpdate });
    await makeDirty();
    await userEvent.click(within(inlineFilters()).getByRole('button', { name: 'Role' }));
    await discardDialog();
    expect(onUrlUpdate).not.toHaveBeenCalled();
  });

  it('an in-app link while dirty goes through the same dialog (useUnsavedChanges)', async () => {
    show(<ListPageTemplate {...editableProps()} />);
    await makeDirty();
    await userEvent.click(screen.getByRole('link', { name: 'Person 2' }));
    const dialog = await discardDialog();
    expect(within(dialog).getByRole('heading').textContent).toBe(COMMON.discard_title);
    expect(followed).toEqual([]);
  });

  const ADDING: EditableConfig<Row> = {
    ...EDITABLE,
    canAdd: true,
    blankDraft: () => ({ name: '' }),
    labels: { ...EDITABLE.labels, addLabel: 'Add multiple' },
  };

  it('the editable table replaces the rows table; without a create link the add button is the one primary button', async () => {
    show(<ListPageTemplate {...editableProps({ editable: ADDING, createAction: null })} />);
    await screen.findByTestId('editable-table');
    expect(screen.queryByTestId('list-table')).toBeNull();
    expect(screen.queryByRole('link', { name: 'New Staff Member' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add multiple' }).className).toContain('bg-primary');
  });

  it('beside a create link the add button is outline and comes first: one primary button per toolbar (quick 261003-ovf)', async () => {
    show(<ListPageTemplate {...editableProps({ editable: ADDING })} />);
    await screen.findByTestId('editable-table');
    const add = screen.getByRole('button', { name: 'Add multiple' });
    const create = screen.getByRole('link', { name: 'New Staff Member' });
    expect(add.className).not.toContain('bg-primary');
    expect(add.getAttribute('data-variant')).toBe('outline');
    expect(create.className).toContain('bg-primary');
    expect(add.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
// Quick 261003-ovf: the row actions column is sticky; the compact row actions
// ---------------------------------------------------------------------------------------------

describe('ListPageTemplate: the row actions column (quick 261003-ovf)', () => {
  const classes = (element: Element | null | undefined): string[] =>
    (element?.getAttribute('class') ?? '').split(' ');

  it('is sticky at the inline end, header too, over a solid row: Edit and the menu stay in the frame', async () => {
    show(<ListPageTemplate {...props()} />);
    const table = await screen.findByTestId('list-table');
    expect(classes([...table.querySelectorAll('th')].at(-1))).toEqual(
      expect.arrayContaining(['sticky-actions', 'bg-muted']),
    );
    const row = within(table).getAllByRole('row')[1];
    const cells = [...(row?.querySelectorAll('td') ?? [])];
    expect(classes(cells.at(-1))).toEqual(expect.arrayContaining(['sticky-actions', 'bg-inherit']));
    expect(cells.filter((td) => classes(td).includes('sticky-actions'))).toHaveLength(1);
    expect(classes(row)).toContain('bg-background');
  });

  it('without row actions the frame fades at its inline end instead (no sticky column to cut against)', async () => {
    const { rowActions, ...withoutActions } = props();
    expect(rowActions).toBeDefined();
    const { unmount } = show(<ListPageTemplate {...withoutActions} />);
    const plain = await screen.findByTestId('list-table');
    expect(classes(plain.parentElement?.parentElement)).toContain('table-frame-fade');
    expect(plain.querySelector('.sticky-actions')).toBeNull();
    unmount();
    show(<ListPageTemplate {...props()} />);
    const withActions = await screen.findByTestId('list-table');
    expect(classes(withActions.parentElement?.parentElement)).not.toContain('table-frame-fade');
  });

  it('compactRowActions: one quiet outline main action inline, the destructive one only in the row menu', async () => {
    show(<ListPageTemplate {...props({ compactRowActions: true })} />);
    const table = await screen.findByTestId('list-table');
    const edit = within(table).getByRole('button', { name: 'Edit Person 1' });
    expect(edit.closest('[data-testid="row-actions-inline"]')).not.toBeNull();
    expect(edit.getAttribute('data-variant')).toBe('outline');
    expect(within(table).queryByRole('button', { name: 'Delete Person 1' })).toBeNull();
    await userEvent.click(within(table).getByRole('button', { name: 'Actions for Person 1' }));
    expect(await screen.findByRole('menuitem', { name: 'Delete Person 1' })).toBeTruthy();
  });
});
