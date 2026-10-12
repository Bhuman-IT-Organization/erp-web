import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from 'next-intl';
import { SWRConfig } from 'swr';
import { expect, fn, screen, userEvent, within } from 'storybook/test';
import { z } from 'zod';
import {
  ListPageTemplate,
  type ListColumn,
  type ListPageTemplateProps,
} from '@/components/templates/ListPageTemplate';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import type { Draft } from '@/lib/hooks/use-editable-rows';
import type { EditableConfig, EditableSaveResult } from './EditableTable';

// The list is served by a fake axios adapter on the shared instance (set by a decorator before the
// story renders, the ListPageTemplate stories' seam); the save is a fake `save` per story. Fixture
// data only ("Unit 1", "Item 2"); every literal here is a story arg, as kit stories pass.
const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;
const PATH = '/api/v1/demo/units';

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

const unitSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  group: z.string(),
  color: z.string(),
  display: z.boolean(),
  note: z.string(),
  etag: z.string(),
});
type Unit = z.infer<typeof unitSchema>;

const GROUPS = [
  { value: '1', label: 'Group 1' },
  { value: '2', label: 'Group 2' },
];
const units: Unit[] = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  code: `U${String(i + 1)}`,
  name: `Unit ${String(i + 1)}`,
  group: String((i % 2) + 1),
  color: i % 2 === 0 ? '#1f6feb' : '#2da44e',
  display: i % 3 !== 2,
  note: '',
  etag: `e${String(i + 1)}`,
}));

const levelSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  sku: z.string(),
  minimum: z.string(),
  maximum: z.string(),
  etag: z.string(),
});
type Level = z.infer<typeof levelSchema>;
const levels: Level[] = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1,
  code: `I${String(i + 1)}`,
  name: `Item ${String(i + 1)}`,
  sku: `SKU-${String(i + 1)}`,
  minimum: String(i + 1),
  maximum: String((i + 1) * 10),
  etag: `l${String(i + 1)}`,
}));

const listPage = (rows: readonly unknown[]) => ({
  data: rows,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: rows.length,
    rangeStart: rows.length === 0 ? 0 : 1,
    exportLimit: 10_000,
    printLimit: 1000,
  },
});

type Answer = { readonly status: number; readonly body: unknown } | 'pending';

function respond(config: InternalAxiosRequestConfig, answer: Answer) {
  if (answer === 'pending') return new Promise<never>(() => undefined);
  const response = {
    data: answer.body,
    status: answer.status,
    statusText: String(answer.status),
    headers: new AxiosHeaders(),
    config,
  };
  if (answer.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

function api(list: Answer): ApiAdapter {
  return (config) => {
    const path = (config.url ?? '').split('?')[0];
    if (path === '/api/v1/auth/me') return respond(config, { status: HTTP_OK, body: ME });
    return respond(config, list);
  };
}

/** The transport before the story renders (no effect), a private cache, and the feature's stale text. */
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

/** `demo.errors.ERP-CORE-0013` stands for the feature's own stale text (a feature maps the code). */
const withFeatureErrors: Decorator = function FeatureErrors(Story) {
  const locale = useLocale();
  const messages = useMessages();
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={{
        ...messages,
        demo: {
          errors: {
            'ERP-CORE-0013': 'These units were changed by someone else since you opened them.',
          },
        },
      }}
    >
      <Story />
    </NextIntlClientProvider>
  );
};

const answered = (result: EditableSaveResult) => (): Promise<EditableSaveResult> =>
  Promise.resolve(result);
const SAVED = answered({ ok: true });
const STALE = answered({
  ok: false,
  status: 412,
  code: 'ERP-CORE-0013',
  retryAfterS: null,
  issues: [{ id: '2' }],
});

const UNIT_COLUMNS: readonly ListColumn<Unit>[] = [
  { id: 'id', header: 'ID', align: 'end', cell: (r) => String(r.id) },
  { id: 'code', header: 'Unit code', sortField: 'code', cell: (r) => <bdi>{r.code}</bdi> },
  { id: 'name', header: 'Unit Name', sortField: 'name', cell: (r) => r.name },
  {
    id: 'group',
    header: 'Group name',
    hideBelow: 'md',
    cell: (r) => GROUPS.find((g) => g.value === r.group)?.label ?? '',
  },
  { id: 'color', header: 'Color hex', hideBelow: 'md', cell: (r) => <bdi>{r.color}</bdi> },
  {
    id: 'display',
    header: 'Display',
    hideBelow: 'lg',
    cell: (r) => (r.display ? 'Display' : 'Not display'),
  },
  { id: 'note', header: 'Note', hideBelow: 'lg', cell: (r) => r.note },
];

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const UNITS: EditableConfig<Unit> = {
  mode: 'rows',
  columns: [
    { id: 'code', kind: 'text', label: 'Unit code' },
    { id: 'name', kind: 'text', label: 'Unit Name', required: true },
    { id: 'group', kind: 'choice', label: 'Group name', options: GROUPS },
    { id: 'color', kind: 'color', label: 'Color hex' },
    { id: 'display', kind: 'checkbox', label: 'Display' },
    { id: 'note', kind: 'textarea', label: 'Note' },
  ],
  rowId: (r) => String(r.id),
  toDraft: (r) => ({
    code: r.code,
    name: r.name,
    group: r.group,
    color: r.color,
    display: r.display,
    note: r.note,
  }),
  etagOf: (r) => r.etag,
  blankDraft: () => ({ code: '', name: '', group: '', color: '', display: true, note: '' }),
  rowName: (draft) => text(draft.name),
  validate: (draft) => (text(draft.name).trim() === '' ? { name: 'Enter a unit name.' } : {}),
  issueText: () => 'This value was refused.',
  save: SAVED,
  labels: {
    listLabel: 'Units',
    submit: 'Save units',
    pending: 'Saving units…',
    savedToast: 'Units saved',
    addLabel: 'Add unit',
  },
  canEdit: true,
  canAdd: true,
};

const LEVELS: EditableConfig<Level> = {
  mode: 'grid',
  columns: [
    { id: 'minimum', kind: 'number', label: 'Minimum value' },
    { id: 'maximum', kind: 'number', label: 'Maximum Qty' },
  ],
  rowId: (r) => String(r.id),
  toDraft: (r) => ({ minimum: r.minimum, maximum: r.maximum }),
  etagOf: (r) => r.etag,
  rowName: () => '',
  issueText: () => 'This value was refused.',
  save: SAVED,
  labels: {
    listLabel: 'Levels',
    submit: 'Save levels',
    pending: 'Saving levels…',
    savedToast: 'Levels saved',
    countLabel: (count) => `${String(count)} items changed`,
    summaryTitle: (count) => `Save levels for ${String(count)} items?`,
  },
  canEdit: true,
  canAdd: false,
  bulkSet: {
    label: 'Set levels',
    title: 'Set levels',
    applyLabel: (count) => `Apply to ${String(count)} items`,
    columns: ['minimum', 'maximum'],
  },
};

const LEVEL_COLUMNS: readonly ListColumn<Level>[] = [
  { id: 'id', header: 'ID', align: 'end', cell: (r) => String(r.id) },
  { id: 'code', header: 'Items Code', cell: (r) => <bdi>{r.code}</bdi> },
  { id: 'name', header: 'Items Name', cell: (r) => r.name },
  { id: 'sku', header: 'SKU Code', hideBelow: 'md', cell: (r) => <bdi>{r.sku}</bdi> },
  { id: 'minimum', header: 'Minimum value', align: 'end', cell: (r) => r.minimum },
  { id: 'maximum', header: 'Maximum Qty', align: 'end', cell: (r) => r.maximum },
];

const EMPTY = {
  nothingYetHeading: 'No units yet',
  nothingYetBody: 'Add the first unit so items can use it.',
  noResultsHeading: (q: string) => `No units match “${q}”`,
  noResultsBody: 'Check the spelling or clear the search.',
};

const unitArgs: ListPageTemplateProps<Unit> = {
  title: 'Units',
  path: PATH,
  rowSchema: unitSchema,
  listBase: '/setup/units',
  rowKey: (r) => String(r.id),
  rowHref: () => '/setup/units',
  recordName: (r) => r.name,
  columns: UNIT_COLUMNS,
  editable: UNITS,
  // A feature passes only its Delete; the kit prepends its own Edit.
  rowActions: (r) => [
    {
      id: 'delete',
      kind: 'destructive',
      icon: 'trash-can',
      label: 'Delete',
      ariaLabel: `Delete unit ${r.name}`,
      onSelect: fn(),
    },
  ],
  empty: EMPTY,
  recordsNoun: 'units',
  featureErrors: { namespace: 'demo', codes: ['ERP-CORE-0013'] },
};

/** A level is digits only; the message is the kit's `enter_number`, as the settings features use it. */
const digitsOnly =
  (message: string) =>
  (draft: Draft): Readonly<Record<string, string>> =>
    Object.fromEntries(
      Object.entries(draft)
        .filter(([, value]) => !/^\d*$/.test(text(value)))
        .map(([field]) => [field, message]),
    );

/** The levels grid: the same template with grid props (the story's args are its own rows). */
function LevelsGrid(props: {
  readonly editable: EditableConfig<Level>;
  readonly columns?: readonly ListColumn<Level>[];
}) {
  const t = useTranslations('common');
  return (
    <ListPageTemplate<Level>
      title="Minimum, maximum levels"
      path={PATH}
      rowSchema={levelSchema}
      listBase="/setup/levels"
      rowKey={(r) => String(r.id)}
      rowHref={() => '/setup/levels'}
      recordName={(r) => r.name}
      columns={props.columns ?? LEVEL_COLUMNS}
      editable={{ ...props.editable, validate: digitsOnly(t('enter_number')) }}
      empty={EMPTY}
      recordsNoun="items"
    />
  );
}

const meta = {
  title: 'Templates/EditableTable',
  component: ListPageTemplate<Unit>,
  args: unitArgs,
  // useUnsavedChanges reads the App Router (the reload and link guard of a dirty table).
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/units' } },
  },
  decorators: [
    withFeatureErrors,
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ListPageTemplate<Unit>>;

export default meta;
type Story = StoryObj<typeof meta>;

const LOADED = withApi(api({ status: HTTP_OK, body: listPage(units) }));
const LEVELS_LOADED = withApi(api({ status: HTTP_OK, body: listPage(levels) }));

/** The inline Edit is a md+ control (below md it is in the row's Actions menu): these plays run at 1280. */
const DESKTOP = {
  parameters: {
    viewport: {
      options: {
        desktop1280: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' } },
      },
    },
  },
  globals: { viewport: { value: 'desktop1280', isRotated: false } },
};

const MOBILE = {
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

async function edit(canvasElement: HTMLElement, name: string, value: string): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: `Edit ${name}` }));
  const input = canvas.getByRole('textbox', { name: `${name}: Unit Name` });
  await userEvent.clear(input);
  if (value !== '') await userEvent.type(input, value);
}

/** FE-27 `Loading`: the list skeleton, and no message of any kind (D-39). */
export const Loading: Story = { decorators: [withApi(api('pending'))] };

/** FE-27 `Empty`: nothing yet, with the add button in place of a create link. */
export const Empty: Story = {
  decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))],
};

/** The search matched nothing: "no results" with Clear search. */
export const NoResults: Story = {
  parameters: { nuqs: { searchParams: '?q=zzz' } },
  decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))],
};

/** FE-27 `Error`: the read failed; the inline error with Retry. */
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

/**
 * FE-27 `Loaded`: read cells centred on the row's buttons, one quiet outline Edit and the row menu
 * per row, Add unit in the toolbar; no required star while nothing is in edit.
 */
export const Loaded: Story = { ...DESKTOP, decorators: [LOADED] };

/** The row menu "Actions for Unit 1" open: Edit, then Delete in red after a separator. */
export const RowMenu: Story = {
  ...DESKTOP,
  decorators: [LOADED],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Actions for Unit 1' }));
    await expect(
      await screen.findByRole('menuitem', { name: 'Delete unit Unit 1' }),
    ).toBeInTheDocument();
  },
};

/** Two new rows at the top, "New" in the ID cell, Remove new row, Add another row under them. */
export const Adding: Story = {
  decorators: [LOADED],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Add unit' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Add another row' }));
    await expect(canvas.getByTestId('save-bar')).toHaveTextContent('2 rows changed');
  },
};

/** Two rows in edit at once: inputs in place, the muted fill and Undo; the required star in the header. */
export const Editing: Story = {
  ...DESKTOP,
  decorators: [LOADED],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await edit(canvasElement, 'Unit 1', 'Unit One');
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Unit 2' }));
    await expect(canvas.getByTestId('save-bar')).toHaveTextContent('1 row changed');
  },
};

/** A cell that fails: aria-invalid, the message under it, and "Check these fields" above the table. */
export const CellErrors: Story = {
  ...DESKTOP,
  decorators: [LOADED],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await edit(canvasElement, 'Unit 1', '');
    await userEvent.click(canvas.getByRole('button', { name: 'Save units' }));
    await expect(await canvas.findByTestId('error-summary')).toBeInTheDocument();
  },
};

/** One summary per save: "Added: {name}" and "{row}: {column}: {old} → {new}". */
export const SaveSummary: Story = {
  ...DESKTOP,
  decorators: [LOADED],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await edit(canvasElement, 'Unit 2', 'Unit Two');
    await userEvent.click(canvas.getByRole('button', { name: 'Add unit' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'New: Unit Name' }), 'Crate');
    await userEvent.click(canvas.getByRole('button', { name: 'Save units' }));
    await expect(await screen.findByTestId('confirm-dialog')).toBeInTheDocument();
  },
};

/** L-08: one stale row refuses the whole save; the row is marked and "Reload list" offered. */
export const Stale: Story = {
  ...DESKTOP,
  args: { editable: { ...UNITS, save: STALE } },
  decorators: [LOADED],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await edit(canvasElement, 'Unit 1', 'Unit One');
    await edit(canvasElement, 'Unit 2', 'Unit Two');
    await userEvent.click(canvas.getByRole('button', { name: 'Save units' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save units' }));
    await expect(await within(dialog).findByTestId('confirm-dialog-error')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await expect(await canvas.findByTestId('editable-stale')).toBeInTheDocument();
  },
};

/** D-26: the level columns are always inputs; no per-row Edit. */
export const Grid: Story = {
  decorators: [LEVELS_LOADED],
  render: () => <LevelsGrid editable={LEVELS} />,
};

/** Two changed cells: the muted fill, "2 items changed" and "Save levels". */
export const GridDirty: Story = {
  decorators: [LEVELS_LOADED],
  render: () => <LevelsGrid editable={LEVELS} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByRole('textbox', { name: 'Item 1: Minimum value' }),
      '5',
    );
    await userEvent.type(canvas.getByRole('textbox', { name: 'Item 3: Maximum Qty' }), '0');
    await expect(canvas.getByTestId('save-bar')).toHaveTextContent('2 items changed');
  },
};

/** K15 (04.6): a date column is a native date input (the browser's picker), its draft `YYYY-MM-DD`. */
const DATED: EditableConfig<Level> = {
  ...LEVELS,
  columns: [
    { id: 'minimum', kind: 'number', label: 'Minimum value' },
    { id: 'expiry', kind: 'date', label: 'Expiry Date' },
  ],
  toDraft: (r) => ({ minimum: r.minimum, expiry: r.id % 2 === 0 ? '2027-03-31' : '' }),
  bulkSet: {
    label: 'Set levels',
    title: 'Set levels',
    applyLabel: (count) => `Apply to ${String(count)} items`,
    columns: ['minimum'],
  },
};
const DATED_COLUMNS: readonly ListColumn<Level>[] = [
  ...LEVEL_COLUMNS.slice(0, 5),
  { id: 'expiry', header: 'Expiry Date', cell: () => '' },
];

export const GridWithDate: Story = {
  decorators: [LEVELS_LOADED],
  render: () => <LevelsGrid editable={DATED} columns={DATED_COLUMNS} />,
};

/** "Set levels" for the checked rows: a small dialog; an empty input leaves a cell unchanged. */
export const SetForSelected: Story = {
  decorators: [LEVELS_LOADED],
  render: () => <LevelsGrid editable={LEVELS} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Select Item 1' }));
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Select Item 2' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Set levels' }));
    await expect(await screen.findByRole('dialog')).toBeInTheDocument();
  },
};

/** "Add multiple": existing rows stay read-only; only new rows are inputs. */
export const AddOnly: Story = {
  args: { editable: { ...UNITS, addOnly: true } },
  decorators: [LOADED],
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Add unit' }));
  },
};

/** `labels.countLabel` replaces "{count} rows changed" (levels: "{count} items changed"). */
export const CustomCountLabel: Story = {
  ...DESKTOP,
  args: {
    editable: {
      ...UNITS,
      labels: { ...UNITS.labels, countLabel: (count) => `${String(count)} units changed` },
    },
  },
  decorators: [LOADED],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await edit(canvasElement, 'Unit 1', 'Unit One');
    await edit(canvasElement, 'Unit 2', 'Unit Two');
    await expect(canvas.getByTestId('save-bar')).toHaveTextContent('2 units changed');
  },
};

/** `labels.summaryTitle` replaces "Save changes to {list}?". */
export const CustomSummaryTitle: Story = {
  ...DESKTOP,
  args: {
    editable: {
      ...UNITS,
      labels: { ...UNITS.labels, summaryTitle: (count) => `Save ${String(count)} units?` },
    },
  },
  decorators: [LOADED],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await edit(canvasElement, 'Unit 1', 'Unit One');
    await userEvent.click(canvas.getByRole('button', { name: 'Save units' }));
    await expect(await screen.findByRole('heading', { name: 'Save 1 units?' })).toBeInTheDocument();
  },
};

/** 375px: every editable column is kept and the table scrolls inside its wrapper. */
export const Mobile: Story = {
  ...MOBILE,
  decorators: [LOADED],
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Add unit' }));
  },
};

/** Arabic: the table, the undo and remove buttons and the save bar mirror. */
export const Rtl: Story = {
  globals: { locale: 'ar' },
  decorators: [LOADED],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Add unit' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Add another row' }));
  },
};
