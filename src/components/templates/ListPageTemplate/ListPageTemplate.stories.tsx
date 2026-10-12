import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import { z } from 'zod';
import { ImageThumbnail } from '@/components/molecules/ImageThumbnail';
import { SearchableMultiSelect } from '@/components/molecules/SearchableMultiSelect';
import { SearchableSelect } from '@/components/molecules/SearchableSelect';
import type { FilterControl } from '@/components/organisms/FilterBar';
import { Button } from '@/components/ui/button';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import type { ListFilterDef } from '@/lib/url/use-query-state';
import { ListPageTemplate, type ListColumn } from './ListPageTemplate';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, with a private SWR cache per story. `src/test/axios-fakes.ts` imports
// `vi` and cannot enter a Storybook bundle, so the helpers live here. The session is seeded in the
// same decorator: a request is held until the tab's session is known (WR-08). Fixture data only.
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVICE_UNAVAILABLE = 503;
const TOTAL = 1240;
const PAGE = 25;
const PATH = '/api/v1/identity/members';
const EXPORT_PATH = '/api/v1/identity/members/export';

const rowSchema = z.object({
  staffId: z.number().int(),
  fullName: z.string(),
  email: z.string(),
  roleName: z.string().nullable(),
  hasPhoto: z.boolean(),
});
type Row = z.infer<typeof rowSchema>;

const FIRST = ['Ada', 'Grace', 'Alan', 'Katherine', 'Edsger', 'Barbara', 'Donald', 'Frances'];
const LAST = ['Lovelace', 'Hopper', 'Turing', 'Johnson', 'Dijkstra', 'Liskov', 'Knuth', 'Allen'];
const ROLES = ['Support', 'Finance', null, 'Warehouse Supervisor'];

const people = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => {
    const first = FIRST[i % FIRST.length] ?? 'Ada';
    // Unique for 25 rows: row i and row i + 8 never share a surname.
    const last = LAST[(i * 3 + Math.floor(i / FIRST.length)) % LAST.length] ?? 'Lovelace';
    return {
      staffId: i + 1,
      fullName: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${String(i + 1)}@example.invalid`,
      roleName: ROLES[i % ROLES.length] ?? null,
      hasPhoto: i % 3 !== 2,
    };
  });

const ME = {
  staffId: 1,
  email: 'admin@example.invalid',
  firstName: 'Admin',
  lastName: 'Person',
  isAdmin: true,
  roleId: null,
  permissions: [],
  locale: null,
};

/** The api's export cap (erp-api `EXPORT_MAX_ROWS`), sent on every list page as `meta.exportLimit`. */
const EXPORT_LIMIT = 10_000;
/** The cap of PDF and Print (D-06), sent as `meta.printLimit`. */
const PRINT_LIMIT = 1000;

const listPage = (rows: readonly Row[], total = rows.length) => ({
  data: rows,
  meta: {
    nextCursor: rows.length < total ? 'next' : null,
    prevCursor: null,
    total,
    rangeStart: rows.length === 0 ? 0 : 1,
    exportLimit: EXPORT_LIMIT,
    printLimit: PRINT_LIMIT,
  },
});

type Answer = { readonly status: number; readonly body: unknown } | 'pending';

const LOADED: Answer = { status: HTTP_OK, body: listPage(people(PAGE), TOTAL) };
/** Under the print cap (1,000), so PDF and Print are enabled in the menu. */
const UNDER_PRINT_LIMIT: Answer = { status: HTTP_OK, body: listPage(people(PAGE), 640) };
const CSV: Answer = {
  status: HTTP_OK,
  body: new Blob(['﻿Staff ID\r\n'], { type: 'text/csv' }),
};

function respond(config: InternalAxiosRequestConfig, answer: Answer) {
  if (answer === 'pending') return new Promise<never>(() => undefined);
  const response = {
    data: answer.body,
    status: answer.status,
    statusText: String(answer.status),
    headers: new AxiosHeaders({ 'content-disposition': 'attachment; filename="staff.csv"' }),
    config,
  };
  if (answer.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

/** `/me` answers the admin; the list path answers `list`; the export path answers `exported`. */
function api(list: Answer, exported: Answer = CSV): ApiAdapter {
  return (config) => {
    const path = (config.url ?? '').split('?')[0];
    if (path === '/api/v1/auth/me') return respond(config, { status: HTTP_OK, body: ME });
    if (path === EXPORT_PATH) return respond(config, exported);
    return respond(config, list);
  };
}

/** Sets the transport BEFORE the story renders (synchronously, no effect) and isolates the cache. */
function withApi(adapter: ApiAdapter): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = adapter;
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

const COLUMNS: readonly ListColumn<Row>[] = [
  {
    id: 'fullName',
    header: 'Full Name',
    sortField: 'firstName',
    primary: true,
    cell: (r) => r.fullName,
  },
  {
    id: 'email',
    header: 'Email',
    sortField: 'email',
    hideBelow: 'md',
    cell: (r) => <bdi>{r.email}</bdi>,
  },
  // D-41: Role is not a keyset key, so it has no sort control.
  { id: 'role', header: 'Role', hideBelow: 'lg', cell: (r) => r.roleName ?? 'No role' },
];

// A story may not render an image element (`check:brand`, FE-17): the feature passes the real
// `<img>`; here a neutral grey block of the same role stands in, as in ImageThumbnail's stories.
const photo = <span aria-hidden="true" className="bg-muted-foreground/40 block size-full" />;
const largePhoto = (name: string) => (
  <span role="img" aria-label={name} className="bg-muted-foreground/40 block aspect-[4/5] w-80" />
);

const WITH_PHOTO: readonly ListColumn<Row>[] = [
  {
    id: 'photo',
    header: 'Photo',
    headerHidden: true,
    cell: (r) => (
      <ImageThumbnail
        name={r.fullName}
        thumbnail={r.hasPhoto ? photo : null}
        preview={r.hasPhoto ? largePhoto(r.fullName) : null}
        placeholderIcon="user"
      />
    ),
  },
  ...COLUMNS,
];

const MEMBER_EXPORT = {
  path: EXPORT_PATH,
  columns: ['staffId', 'firstName', 'lastName', 'email', 'roleName', 'active', 'lastLogin'],
  labels: {
    staffId: 'Staff ID',
    firstName: 'First Name',
    lastName: 'Last Name',
    email: 'Email',
    roleName: 'Role',
    active: 'Active',
    lastLogin: 'Last Login',
  },
} as const;

const meta = {
  title: 'Templates/ListPageTemplate',
  component: ListPageTemplate<Row, (typeof MEMBER_EXPORT.columns)[number]>,
  args: {
    title: 'Staff Members',
    path: PATH,
    rowSchema,
    listBase: '/setup/staff',
    rowKey: (r) => String(r.staffId),
    rowHref: (r) => `/setup/staff/${String(r.staffId)}`,
    recordName: (r) => r.fullName,
    onRowOpen: fn(),
    columns: COLUMNS,
    rowActions: (r) => [
      {
        id: 'view',
        label: 'View',
        ariaLabel: `View ${r.fullName}`,
        icon: 'eye',
        kind: 'main',
        href: `/setup/staff/${String(r.staffId)}`,
      },
    ],
    createAction: { label: 'New Staff Member', href: '/setup/staff/new' },
    exportAction: MEMBER_EXPORT,
    empty: {
      nothingYetHeading: 'No staff members yet',
      nothingYetBody: 'Add the first staff member to give someone access.',
      noResultsHeading: (q) => `No staff members match “${q}”`,
      noResultsBody: 'Check the spelling or clear the search to see everyone.',
    },
    recordsNoun: 'staff members',
  },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ListPageTemplate<Row, (typeof MEMBER_EXPORT.columns)[number]>>;

export default meta;
type Story = StoryObj<typeof meta>;

const BULK = [{ id: 'deactivate', label: 'Deactivate', onSelect: fn() }];

/** FE-27 `Loading`: the api has not answered — the list skeleton, and no message of any kind (D-39). */
export const Loading: Story = {
  decorators: [withApi(api('pending'))],
};

/** FE-27 `Empty`: nothing yet — the heading, the body and the create button (D-30). */
export const Empty: Story = {
  decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))],
};

/**
 * Opt-in (04.8-17): the create is a menu of the documents it makes (Perfex's "Add" dropdown), held
 * by the nothing-yet state with the feature's own action after it (`createOnlyInEmpty`).
 */
export const CreateMenuInEmpty: Story = {
  args: {
    createAction: {
      label: 'Add document',
      items: [
        { label: 'Credit note', href: '/setup/sample/new?kind=credit' },
        {
          label: 'Refund to a vendor',
          href: '/setup/sample/new?kind=refund',
        },
      ],
    },
    empty: {
      nothingYetHeading: 'No documents in the last 15 days',
      nothingYetBody: 'Credit a customer, or refund a vendor.',
      noResultsHeading: (q) => `No documents match “${q}”`,
      noResultsBody: 'Check the spelling.',
      createOnlyInEmpty: true,
      nothingYetAction: (
        <Button type="button" variant="outline">
          Clear dates
        </Button>
      ),
    },
  },
  decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))],
};

/** The other empty state: the search matched nobody — "no results for …" and Clear search (D-30). */
export const NoResults: Story = {
  parameters: { nuqs: { searchParams: '?q=zzz' } },
  decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))],
};

/** FE-27 `Error`: a retryable failure — the inline error with Retry; the title and toolbar stay (D-31). */
export const Error: Story = {
  decorators: [
    withApi(
      api({
        status: HTTP_SERVICE_UNAVAILABLE,
        body: { type: 'about:blank', status: HTTP_SERVICE_UNAVAILABLE, code: 'ERP-UPSTREAM-0001' },
      }),
    ),
  ],
};

/** FE-27 `Loaded`: 25 of 1,240, the pager's range, a sortable Full Name and Email, a plain Role (D-41). */
export const Loaded: Story = {
  decorators: [withApi(api(LOADED))],
};

/** Sorted by e-mail, descending: `aria-sort` on the header, the arrow and weight 600 (D-18). */
export const Sorted: Story = {
  parameters: { nuqs: { searchParams: '?sort=-email' } },
  decorators: [withApi(api(LOADED))],
};

/** An image column (D-23): a 40 px thumbnail or the placeholder; the header is visually hidden. */
export const WithImageColumn: Story = {
  args: { columns: WITH_PHOTO, imageColumn: true },
  decorators: [withApi(api(LOADED))],
};

/** A module registered a bulk action (D-27): the checkbox column; two rows checked show the bar. */
export const WithBulkActions: Story = {
  args: { bulkActions: BULK },
  decorators: [withApi(api(LOADED))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Select Ada Lovelace' }));
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Select Grace Johnson' }));
    await expect(canvas.getByTestId('list-selection-bar')).toHaveTextContent('2 selected');
  },
};

/** Every row on the page checked, then "Select all 1,240 matching". */
export const SelectAllMatching: Story = {
  args: { bulkActions: BULK },
  decorators: [withApi(api(LOADED))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Select all on this page' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Select all 1,240 matching' }));
    await expect(canvas.getByTestId('list-select-all')).toHaveTextContent(
      'All 1,240 matching are selected.',
    );
  },
};

/** A problem-details refusal as it arrives under `responseType: 'blob'`: a Blob too. */
const blobProblem = (status: number, code: string, issues: readonly unknown[] = []): Answer => ({
  status,
  body: new Blob([JSON.stringify({ type: 'about:blank', status, code, issues })], {
    type: 'application/problem+json',
  }),
});

/** Opens the Export menu and chooses an item by its test id (the items are portalled). */
async function choose(canvasElement: HTMLElement, item: string): Promise<void> {
  await userEvent.click(await within(canvasElement).findByTestId('list-export'));
  await userEvent.click(await screen.findByTestId(item));
}

/** Waits for the inline export error under the toolbar. */
async function exportError(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await waitFor(async () => {
    await expect(canvas.getByTestId('list-export-error')).toBeVisible();
  });
}

/** Export, then CSV, is running: the trigger reads "Exporting…" and is disabled; nothing else changes. */
export const Exporting: Story = {
  decorators: [withApi(api(LOADED, 'pending'))],
  play: async ({ canvasElement }) => {
    await choose(canvasElement, 'list-export-csv');
    await expect(await within(canvasElement).findByTestId('list-export')).toBeDisabled();
  },
};

/** A failure retrying can fix (a 503): a plain inline error under the toolbar with Retry. */
export const ExportFailed: Story = {
  decorators: [withApi(api(LOADED, blobProblem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001')))],
  play: async ({ canvasElement }) => {
    await choose(canvasElement, 'list-export-xlsx');
    await exportError(canvasElement);
  },
};

/**
 * More rows match than a format allows (D-06, lead decision 2b): the over-cap items carry
 * "Limited to" BEFORE any click, stay focusable and are described by the full sentence.
 */
export const ExportOverLimit: Story = {
  decorators: [withApi(api({ status: HTTP_OK, body: listPage(people(PAGE), 12_500) }))],
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByTestId('list-export'));
    await expect(await screen.findByTestId('list-export-csv')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(screen.getByTestId('list-export-print')).toHaveAttribute('aria-disabled', 'true');
  },
};

/** Two rows ticked (D-30): Export sits in the selection bar and exports "2 selected rows". */
export const ExportFromSelection: Story = {
  args: { bulkActions: BULK },
  decorators: [withApi(api(LOADED))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Select Ada Lovelace' }));
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Select Grace Johnson' }));
    const bar = canvas.getByTestId('list-selection-bar');
    await userEvent.click(within(bar).getByTestId('list-export'));
    await expect(await screen.findByTestId('list-export-scope')).toHaveTextContent(
      '2 selected rows',
    );
  },
};

/** A PDF with text its font cannot draw (D-24): the reason, and Print offered in the text. */
export const PdfRefused: Story = {
  decorators: [
    withApi(
      api(
        UNDER_PRINT_LIMIT,
        blobProblem(HTTP_BAD_REQUEST, 'ERP-VALIDATION-0001', [
          { path: ['font'], message: 'text the PDF font cannot draw' },
        ]),
      ),
    ),
  ],
  play: async ({ canvasElement }) => {
    await choose(canvasElement, 'list-export-pdf');
    await exportError(canvasElement);
  },
};

/** Print could not read its rows (a 503): "We couldn't prepare the list for printing." with Retry. */
export const PrintFailed: Story = {
  decorators: [
    withApi(
      api(UNDER_PRINT_LIMIT, {
        status: HTTP_SERVICE_UNAVAILABLE,
        body: { type: 'about:blank', status: HTTP_SERVICE_UNAVAILABLE, code: 'ERP-UPSTREAM-0001' },
      }),
    ),
  ],
  play: async ({ canvasElement }) => {
    await choose(canvasElement, 'list-export-print');
    await exportError(canvasElement);
  },
};

/** The race: the list said 640, rows were added since, and the api refuses Print over its cap. */
export const PrintOverLimit: Story = {
  decorators: [
    withApi(
      api(UNDER_PRINT_LIMIT, {
        status: HTTP_BAD_REQUEST,
        body: {
          type: 'about:blank',
          status: HTTP_BAD_REQUEST,
          code: 'ERP-VALIDATION-0001',
          issues: [
            {
              path: ['export'],
              message: 'too many rows to export',
              params: { limit: PRINT_LIMIT, total: TOTAL },
            },
          ],
        },
      }),
    ),
  ],
  play: async ({ canvasElement }) => {
    await choose(canvasElement, 'list-export-print');
    await exportError(canvasElement);
  },
};

/** A stale or tampered link (lead decision 3): the page is gone; Back to first page keeps the search. */
export const StalePage: Story = {
  parameters: { nuqs: { searchParams: '?cursor=stale&q=ada' } },
  decorators: [withApi(api({ status: HTTP_OK, body: listPage([], 40) }))],
};

/** 375 px: search on its own row, Export and create below it at the end; Email and Role hidden. */
export const Mobile: Story = {
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
  decorators: [withApi(api(LOADED))],
};

/** Arabic: the toolbar, the table and the pager mirror; the range and e-mail stay in 0-9 (D-34). */
export const Rtl: Story = {
  args: {
    title: 'الموظفون',
    createAction: { label: 'موظف جديد', href: '/setup/staff/new' },
  },
  globals: { locale: 'ar' },
  decorators: [withApi(api(LOADED))],
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByTestId('list-export'));
    await expect(await screen.findByTestId('list-export-print')).toBeInTheDocument();
    await expect(screen.queryByTestId('list-export-pdf')).toBeNull();
  },
};

// ---------------------------------------------------------------------------------------------
// Kit A (plan 04.2-05): filters (K1, K2), the Columns menu feeding the export (K4), the slots
// ---------------------------------------------------------------------------------------------

const ROLE_OPTIONS = [
  { value: 'support', label: 'Support' },
  { value: 'finance', label: 'Finance' },
  { value: 'warehouse', label: 'Warehouse Supervisor' },
];
const STATUS_OPTIONS = [
  { value: '1', label: 'Active' },
  { value: '0', label: 'Inactive' },
];

const FILTER_DEFS: readonly ListFilterDef[] = [
  { key: 'role[in]' },
  { key: 'active[eq]', defaultValue: '1' },
];

const FILTER_BAR = {
  defs: FILTER_DEFS,
  controls: [
    {
      key: 'role[in]',
      label: 'Role',
      inline: true,
      render: ({ id, value, onChange, triggerText }) => (
        <SearchableMultiSelect
          id={id}
          options={ROLE_OPTIONS}
          value={value === undefined || typeof value === 'string' ? [] : value}
          onChange={(next) => {
            onChange(next);
          }}
          triggerText={triggerText}
          showChips={false}
        />
      ),
    },
    {
      key: 'active[eq]',
      label: 'Status',
      inline: true,
      render: ({ id, value, onChange, triggerText }) => (
        <SearchableSelect
          id={id}
          options={STATUS_OPTIONS}
          value={typeof value === 'string' ? value : null}
          onChange={(next) => {
            onChange(next);
          }}
          triggerText={triggerText}
        />
      ),
    },
  ] satisfies readonly FilterControl[],
};

/** K1 and K2: two roles chosen in the URL; the trigger reads "Role (2)" and "Clear filters" shows. */
export const WithFilters: Story = {
  args: { filterBar: FILTER_BAR },
  parameters: { nuqs: { searchParams: '?filter[role][in]=support,finance' } },
  decorators: [withApi(api(LOADED))],
};

/** 375 px: one "Filters (1)" button; the sheet opens from the inline end with every filter. */
export const FiltersMobileSheet: Story = {
  args: { filterBar: FILTER_BAR },
  parameters: {
    nuqs: { searchParams: '?filter[role][in]=support' },
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
  decorators: [withApi(api(LOADED))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Filters (1)' }));
    const sheet = await screen.findByRole('dialog');
    await expect(
      within(sheet).getByRole('button', { name: 'Show 1,240 results' }),
    ).toBeInTheDocument();
  },
};

const COLUMNS_MENU = { storageKey: 'story-staff', fixed: ['fullName'] };
const SLOTS = {
  beforeColumns: (
    <Button type="button" variant="outline" size="lg">
      More actions
    </Button>
  ),
  beforeCreate: (
    <Button type="button" variant="outline" size="lg">
      Import staff
    </Button>
  ),
};

/** K4 and the toolbar slots: More actions, Columns, Export, Import, create; the menu opened. */
export const ColumnsMenu: Story = {
  args: { columnsMenu: COLUMNS_MENU, toolbar: SLOTS },
  decorators: [
    (Story) => {
      localStorage.removeItem('erp.list.columns.story-staff.1');
      return <Story />;
    },
    withApi(api(LOADED)),
  ],
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByTestId('list-columns'));
    const menu = await screen.findByRole('menu');
    await expect(within(menu).getByRole('menuitem', { name: 'Reset columns' })).toBeInTheDocument();
  },
};

/** Every export request the ColumnsExport story sent, read by its play. */
const exportsSent: URL[] = [];

/** K4 feeding 4.1.1's export: Email hidden, so Excel asks for every member column but email. */
export const ColumnsExport: Story = {
  args: { columnsMenu: COLUMNS_MENU },
  decorators: [
    (Story) => {
      localStorage.removeItem('erp.list.columns.story-staff.1');
      exportsSent.length = 0;
      return <Story />;
    },
    withApi((config) => {
      const url = new URL(http.getUri(config), 'http://erp.invalid');
      if (url.pathname === EXPORT_PATH) exportsSent.push(url);
      // The file never arrives: nothing is saved by the story; the request is what it shows.
      return api(LOADED, 'pending')(config);
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByTestId('list-columns'));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Email' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(async () => {
      await expect(canvas.queryByRole('columnheader', { name: /Email/ })).toBeNull();
    });
    await choose(canvasElement, 'list-export-xlsx');
    await waitFor(async () => {
      await expect(exportsSent).toHaveLength(1);
    });
    await expect(exportsSent[0]?.searchParams.getAll('column')).toEqual([
      'staffId',
      'firstName',
      'lastName',
      'roleName',
      'active',
      'lastLogin',
    ]);
  },
};

/** The header slot: a record's title row and section links replace the template's own title. */
export const RecordHeader: Story = {
  args: {
    header: (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Sample item 1</h1>
        <nav aria-label="Sample item 1 sections" className="flex gap-2 border-b">
          <a href="#detail" className="px-4 py-2">
            Detail
          </a>
          <a
            href="#usage"
            aria-current="page"
            className="border-foreground border-b-2 px-4 py-2 font-semibold"
          >
            Usage
          </a>
        </nav>
      </div>
    ),
    createAction: null,
  },
  decorators: [withApi(api(LOADED))],
};
