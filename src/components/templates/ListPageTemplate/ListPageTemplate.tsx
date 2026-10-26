'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Fragment,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import { Icon } from '@/components/atoms/Icon';
import { EmptyState } from '@/components/molecules/EmptyState';
import { InlineError } from '@/components/molecules/InlineError';
import { Pager } from '@/components/molecules/Pager';
import { RowActions, type RowAction } from '@/components/molecules/RowActions';
import { SortableHeader, ariaSortFor } from '@/components/molecules/SortableHeader';
import { ExportMenu, type ExportFormat } from '@/components/organisms/ExportMenu';
import { FilterBar, type FilterControl } from '@/components/organisms/FilterBar';
import { PageSkeleton } from '@/components/organisms/PageSkeleton';
import { PrintView } from '@/components/organisms/PrintView';
import {
  BulkSetButton,
  EditableFlow,
  EditableTable,
  EmptyAsNone,
  INDETERMINATE,
  FRAME_FADE,
  OPAQUE_ROW,
  STICKY_ACTIONS_CELL,
  STICKY_ACTIONS_HEAD,
  columnClass,
  type EditableConfig,
  type HeldAction,
} from '@/components/templates/EditableTable';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { HTTP_SERVER_ERROR_FLOOR } from '@/lib/api/api-error';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { downloadFile, type DownloadFormat } from '@/lib/api/download-file';
import { readExportRows, type ExportRows } from '@/lib/api/export-rows';
import type { Params } from '@/lib/api/keys';
import { useCommonApi, useList } from '@/lib/api/use-common-api';
import { isRetryableCode, type FeatureErrorCodes } from '@/lib/errors/error-messages';
import { useErrorText } from '@/lib/errors/use-error-text';
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility';
import { useEditableRows } from '@/lib/hooks/use-editable-rows';
import { usePageSize } from '@/lib/hooks/use-page-size';
import { recordListReturn, useRestoreListScroll } from '@/lib/hooks/use-return-to-list';
import { useRowClick } from '@/lib/hooks/use-row-click';
import { useSettledValue } from '@/lib/hooks/use-settled-value';
import { DEPLOYMENT_TIME_ZONE, useFormat } from '@/lib/i18n/format';
import { useFormatSettings } from '@/lib/i18n/FormatSettingsProvider';
import {
  filterParams,
  isDefaultFilter,
  useListQueryState,
  type FilterValue,
  type ListFilterDef,
} from '@/lib/url/use-query-state';
import { cn } from '@/lib/utils';

/** The api path type, taken from the read door (a component never imports `call-api`, FE-08). */
type ApiPath = Exclude<Parameters<typeof useList>[0], null>;

export interface ListColumn<Row> {
  readonly id: string;
  readonly header: string;
  /** The header text is visually hidden (an image column); it still names the column. */
  readonly headerHidden?: boolean;
  /** A BE-19 keyset sort field: present → a SortableHeader and `aria-sort`; absent → a plain header (D-41). */
  readonly sortField?: string;
  /** The local sort value when this column is sorted in an unpaginated list. */
  readonly sortValue?: (row: Row) => string | number | null;
  readonly hideBelow?: 'md' | 'lg' | 'xl';
  /** `'end'`: amounts and counts, `text-end tabular-nums`. */
  readonly align?: 'start' | 'end';
  /** Exactly one column: its cell is the row's link, the keyboard path to the record. */
  readonly primary?: boolean;
  /**
   * Opt-in (plan 04.7-11): the header wraps at its words, so a long legacy header does not push the state columns out of the frame; default one line.
   */
  readonly wrapHeader?: boolean;
  /**
   * `options` (opt-in, plan 04.7-23): the list answer's `meta.options`, the deployment settings an
   * api sends beside the rows; `{}` when it sends none. The feature parses it.
   */
  readonly cell: (row: Row, options?: ListOptions) => ReactNode;
}

/** The list answer's `meta.options`, unparsed: each feature reads its own keys with its own schema. */
export type ListOptions = Readonly<Record<string, unknown>>;
const NO_OPTIONS: ListOptions = {};

/** A module's bulk action (D-27): it receives the checked rows, or "all matching" the current query. */
export interface BulkAction<Row> {
  readonly id: string;
  readonly label: string;
  /** Drawn in red after a separator (the row menus' `kind: 'destructive'`), e.g. Delete items. */
  readonly kind?: 'destructive';
  /**
   * `allMatching: true` means every row matching the current search and filters, not only `rows`
   * (the page): the module must send the QUERY to an api endpoint that re-applies it server-side
   * under the list's own gate, never act on ids it cannot see (T-3.2-58).
   */
  readonly onSelect: (selection: {
    readonly rows: readonly Row[];
    readonly allMatching: boolean;
  }) => void;
}

/**
 * The list's export (D-26, D-42; 4.1.1 D-01, D-13, D-26): CSV, Excel, PDF and Print from one
 * endpoint. `columns` is the api's export column list, in its order (plan 05: members 7, roles 3),
 * or a subset of it (a Columns menu's visible ones), sent as `column`; `labels` translates each one.
 * The header labels sent are `columns.map(label)`, so their count IS the column count: a label
 * missing for a column, or one for a column the list does not export, fails to compile, so a screen
 * cannot send the wrong number (the api answers a 400 on `header` if it could).
 */
export interface ListExport<Column extends string> {
  readonly path: ApiPath;
  readonly columns: readonly Column[];
  readonly labels: Readonly<Record<NoInfer<Column>, string>>;
  /** PDF and Print: how an empty cell of a column reads ("Never"); a column absent here reads empty (D-26). */
  readonly blanks?: Readonly<Partial<Record<NoInfer<Column>, string>>>;
}

/** The list's filters (K1, K2): the URL keys it reads, and the control each one shows. */
export interface ListFilterBar {
  /** A module constant: the parsers are built from its keys. */
  readonly defs: readonly ListFilterDef[];
  readonly controls: readonly FilterControl[];
  /** Opt-in (plan 04.6-06): the skeleton's filter row draws this many triggers, the inline filters (default four). */
  readonly skeletonTriggers?: number;
}

/** The toolbar's slots (UI-SPEC § Item list): "More actions" before Columns, "Import items" before create. */
export interface ListToolbarSlots {
  readonly beforeColumns?: ReactNode;
  readonly beforeCreate?: ReactNode;
}

/** The Columns menu (K4): its memory key, the ids that cannot be hidden, and those hidden at first. */
export interface ListColumnsMenu {
  /** `'expense-categories'`: stored as `erp.list.columns.<storageKey>.<staffId>`. */
  readonly storageKey: string;
  readonly fixed: readonly string[];
  readonly defaultHidden?: readonly string[];
}

/** A list endpoint that returns all rows as `{ data }`, without server-side query parameters. */
export interface UnpaginatedList<Row> {
  readonly responseSchema: z.ZodType<{ readonly data: readonly Row[] }>;
  readonly matchesSearch: (row: Row, query: string) => boolean;
  /** Shows the shared pager over the rows already returned by the endpoint. */
  readonly clientPagination?: boolean;
}

export interface ListPageTemplateProps<Row, ExportColumn extends string = string> {
  /** The page's `<h1>` (and the PDF and Print title). */
  readonly title: string;
  /** Replaces the `<h1>`: a record page's title row and tabs; the node must hold the page's `<h1>`. */
  readonly header?: ReactNode;
  readonly path: ApiPath;
  readonly rowSchema: z.ZodType<Row>;
  /** Opt-in for endpoints whose strict contract is an unpaginated `{ data }` response. */
  readonly unpaginated?: UnpaginatedList<Row>;
  /** Fixed query parameters a screen adds to every request and the export (`'filter[active]': true`). */
  readonly filters?: Params;
  /** Filters the member chooses, in the URL (K1) and shown by the filter bar (K2). */
  readonly filterBar?: ListFilterBar;
  /**
   * The api's query for the URL's filters, when a screen keeps a readable value in the URL that the
   * api takes in another form (the sent-email log's days, sent as the member's local day bounds);
   * absent, `filterParams`. Its answer is the whole filter query of the list and every export.
   */
  readonly filterQuery?: (filters: Readonly<Record<string, FilterValue>>) => Params;
  /** The search box's name and placeholder when the search covers one field ("Search by recipient"); absent, `common.search`. */
  readonly searchLabel?: string;
  readonly toolbar?: ListToolbarSlots;
  /** A Columns menu: hidden columns leave the table and every export format (K4, 4.1.1 D-13). */
  readonly columnsMenu?: ListColumnsMenu;
  /** The list's own route (`/staff`): where the return-to-list record is written and restored (D-28). */
  readonly listBase: string;
  readonly rowKey: (row: Row) => string;
  readonly rowHref: (row: Row) => string;
  readonly recordName: (row: Row) => string;
  /** Called when a row opens, after the return is recorded: `seedRow(detailPath, row)` (D-35). */
  readonly onRowOpen?: (row: Row) => void;
  readonly columns: readonly ListColumn<Row>[];
  /** `options`: the list answer's `meta.options` (opt-in, plan 04.7-23), as `ListColumn.cell`. */
  readonly rowActions?: (row: Row, options: ListOptions) => readonly RowAction[];
  /**
   * The row actions in the approved compact form (lead 2026-10-03): one quiet outline main action
   * and the rest in the row menu, as the editable tables draw them; absent, the full-size pair.
   */
  readonly compactRowActions?: boolean;
  /**
   * `null` hides the create button (the user lacks its gate): hidden, never disabled. In the
   * editable mode it is the toolbar's one primary button, and the add button turns outline before
   * it ("Add multiple", then "Add a record").
   */
  readonly createAction?: CreateAction | null;
  /** `null` or absent: no Export button. */
  readonly exportAction?: ListExport<ExportColumn> | null;
  /** Absent or `[]`: no checkbox column, no selection bar, no select-all line (UI-SPEC choice 17). */
  readonly bulkActions?: readonly BulkAction<Row>[];
  /**
   * Opt-in (plan 04.6-06): the selection bar's words for the ticked rows, when a row is not the thing
   * counted ("3 batches selected (2 items)"); absent, "{count} selected".
   */
  readonly selectionLabel?: (selection: {
    readonly rows: readonly Row[];
    readonly count: number;
  }) => string;
  /**
   * Opt-out (plan 04.6-06): `false` offers no "Select all {total} matching", for a list whose rows the
   * bulk api cannot re-select by query; default `true`.
   */
  readonly selectAllMatching?: boolean;
  /**
   * Opt-in (plan 04.6-06): a refusal of the list read that means the screen itself is off (a setting
   * switched off) answers the node shown in place of the whole page, its own `<h1>`
   * included; `undefined` keeps the inline error. Only after the read failed (D-39).
   */
  readonly offState?: (code: string) => ReactNode;
  readonly empty: {
    readonly nothingYetHeading: string;
    readonly nothingYetBody: string;
    readonly noResultsHeading: (query: string) => string;
    readonly noResultsBody: string;
    /**
     * Opt-in (04.6-14): the nothing-yet state's action when it is not the toolbar's create (a
     * document of another screen); absent, the create action as before.
     */
    readonly nothingYetAction?: ReactNode;
    /**
     * Opt-in (04.8-16): while the nothing-yet state shows, the toolbar's create is hidden and the
     * state's own is the page's one primary; absent, both.
     */
    readonly createOnlyInEmpty?: boolean;
  };
  /** `common.list_failed`'s `{records}`: "We couldn't load {records}." */
  readonly recordsNoun: string;
  readonly featureErrors?: FeatureErrorCodes;
  /** The skeleton draws the 40 px square of an image column. */
  readonly imageColumn?: boolean;
  /**
   * The editable mode (K6): the rows become the `EditableTable`, the add button joins the toolbar
   * (the primary one, or outline before `createAction`), and a dirty table guards every view change;
   * absent, the list is read-only.
   */
  readonly editable?: EditableConfig<Row> | undefined;
}

/** One choice of a create menu: its words and the page it opens. */
export interface CreateChoice {
  readonly label: string;
  readonly href: string;
}

/**
 * The toolbar's create: a link, or (opt-in, 04.8-17) a menu of the documents it can create, as
 * Perfex's "Add" dropdowns (`plus` and `chevron-down`, one primary button either way).
 */
export type CreateAction =
  | { readonly label: string; readonly href: string }
  | { readonly label: string; readonly items: readonly CreateChoice[] };

/** The create link, or its menu (non-modal, like the Export menu). */
function CreateButton({ action }: { readonly action: CreateAction }): ReactElement {
  if ('href' in action) {
    return (
      <Button asChild size="lg">
        <Link href={action.href}>
          <Icon name="plus" />
          {action.label}
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="lg" data-testid="list-create-menu">
          <Icon name="plus" />
          {action.label}
          <Icon name="chevron-down" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {action.items.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function compareSortValues(left: string | number | null, right: string | number | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function sortUnpaginatedRows<Row>(
  rows: readonly Row[],
  sort: string | null,
  columns: readonly ListColumn<Row>[],
): readonly Row[] {
  if (sort === null) return rows;
  const descending = sort.startsWith('-');
  const field = descending ? sort.slice(1) : sort;
  const valueOf = columns.find((column) => column.sortField === field)?.sortValue;
  if (valueOf === undefined) return rows;
  return rows
    .map((row, index) => ({ row, index, value: valueOf(row) }))
    .sort(
      (left, right) =>
        (descending ? -1 : 1) * compareSortValues(left.value, right.value) ||
        left.index - right.index,
    )
    .map(({ row }) => row);
}

/**
 * The nothing-yet state's action: the feature's own, else the create. With `createOnlyInEmpty` the
 * state holds the page's one create, so a feature's own action follows it (04.8-17: "Add" then
 * "Clear dates") instead of replacing it.
 */
function nothingYetActionOf(
  empty: { readonly nothingYetAction?: ReactNode; readonly createOnlyInEmpty?: boolean },
  primaryAction: ReactNode,
): ReactNode {
  const own = empty.nothingYetAction;
  if (own === undefined) return primaryAction ?? undefined;
  if (empty.createOnlyInEmpty !== true || primaryAction === null) return own;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {primaryAction}
      {own}
    </div>
  );
}

/**
 * The export's state, one at a time (UI-SPEC § States of an export): running and failed carry their
 * format so Retry repeats it; printing carries the rows the print view shows; a refusal carries what
 * its message needs, the cap with its numbers when the api sent them.
 */
type ExportState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly format: ExportFormat }
  | { readonly kind: 'printing'; readonly rows: ExportRows }
  | { readonly kind: 'failed'; readonly format: ExportFormat }
  | {
      readonly kind: 'over-limit';
      readonly format: ExportFormat;
      readonly limit: number;
      readonly total: number;
    }
  | { readonly kind: 'too-many' }
  | { readonly kind: 'pdf-unsupported' }
  | { readonly kind: 'refused'; readonly code: string; readonly retryAfterS: number | null };

const IDLE: ExportState = { kind: 'idle' };

const NO_IDS: readonly string[] = [];
const NO_DEFS: readonly ListFilterDef[] = [];
const NONE_HIDDEN: ReadonlySet<string> = new Set();

/**
 * A validation refusal's issues (untrusted `unknown`: parsed, never rendered raw). The row cap is an
 * issue on path `export`, with `params: { limit, total }` since the lead's decision 2a; a stale or
 * tampered link is an issue on path `cursor` (plan 01).
 */
const issuesSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    params: z
      .object({ limit: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
      .optional(),
  }),
);

/** A failed export as both doors answer it (`downloadFile`, `readExportRows`). */
interface ExportFailure {
  readonly status: number;
  readonly code: string;
  readonly retryAfterS: number | null;
  readonly issues?: unknown;
}

const HTTP_CLIENT_ERROR_FLOOR = 400;
const VALIDATION_CODE = 'ERP-VALIDATION-0001';

/**
 * What a failed export tells the member. The cap is an issue on `export` (with its numbers since
 * lead decision 2a, else "too many"); a PDF the standard font cannot draw is an issue on `font`
 * (D-24). Any other 4xx but a validation refusal (a 403 after a permission change) is the api's
 * plain-language refusal, with no Retry; everything else (network, timeout, 5xx, or a request the
 * kit built wrong) is "we couldn't export", with Retry.
 */
function exportFailure(format: ExportFormat, failure: ExportFailure): ExportState {
  const parsed = issuesSchema.safeParse(failure.issues);
  const issues = parsed.success ? parsed.data : [];
  const cap = issues.find((issue) => issue.path[0] === 'export');
  if (cap !== undefined) {
    return cap.params === undefined
      ? { kind: 'too-many' }
      : { kind: 'over-limit', format, ...cap.params };
  }
  if (issues.some((issue) => issue.path[0] === 'font')) return { kind: 'pdf-unsupported' };
  const refused =
    failure.status >= HTTP_CLIENT_ERROR_FLOOR &&
    failure.status < HTTP_SERVER_ERROR_FLOOR &&
    failure.code !== VALIDATION_CODE;
  return refused
    ? { kind: 'refused', code: failure.code, retryAfterS: failure.retryAfterS }
    : { kind: 'failed', format };
}

/** The Export trigger's running label: Print says "Preparing print…" while it reads and prints. */
function runningOf(state: ExportState): 'export' | 'print' | null {
  if (state.kind === 'printing') return 'print';
  if (state.kind !== 'running') return null;
  return state.format === 'print' ? 'print' : 'export';
}

/** Each format's menu label: `print_limited` names the format it refuses. */
const FORMAT_LABEL = {
  csv: 'dt_button_csv',
  xlsx: 'dt_button_excel',
  pdf: 'dt_button_pdf',
  print: 'dt_button_print',
} as const;
/** The retryable failure's message: Print has its own. */
const FAILED_KEY = {
  csv: 'export_failed',
  xlsx: 'export_failed',
  pdf: 'export_failed',
  print: 'print_failed',
} as const;
/** The cap sentence: CSV and Excel answer to `exportLimit`, PDF and Print to `printLimit`. */
const CAP_KEY = {
  csv: 'export_limited',
  xlsx: 'export_limited',
  pdf: 'print_limited',
  print: 'print_limited',
} as const;

interface ExportErrorProps {
  readonly state: ExportState;
  readonly onRetry: (format: ExportFormat) => void;
  readonly errorText: ReturnType<typeof useErrorText>;
}

/**
 * The export's message under the toolbar, from one lookup (no nested ternary): only after its
 * answer (D-39), Retry only when retrying can help, never the code (D-32).
 */
function ExportError({ state, onRetry, errorText }: ExportErrorProps): ReactElement | null {
  const t = useTranslations('common');
  const f = useFormat();
  const refusal = (): string | null => {
    switch (state.kind) {
      case 'over-limit':
        return t(CAP_KEY[state.format], {
          limitCount: state.limit,
          limit: f.number(state.limit),
          total: f.number(state.total),
          format: t(FORMAT_LABEL[state.format]),
        });
      case 'too-many':
        return t('export_too_many');
      case 'pdf-unsupported':
        return t('pdf_unsupported_text');
      case 'refused':
        return errorText(state);
      case 'idle':
      case 'running':
      case 'printing':
      case 'failed':
        return null;
    }
  };
  if (state.kind === 'failed') {
    return (
      <InlineError
        testId="list-export-error"
        message={t(FAILED_KEY[state.format])}
        onRetry={() => {
          onRetry(state.format);
        }}
      />
    );
  }
  const message = refusal();
  return message === null ? null : <InlineError testId="list-export-error" message={message} />;
}

function refusesCursor(issues: unknown): boolean {
  const parsed = issuesSchema.safeParse(issues);
  return parsed.success && parsed.data.some((issue) => issue.path[0] === 'cursor');
}

function localPageOf(cursor: string | null): number {
  const match = /^client:(\d+)$/.exec(cursor ?? '');
  if (match === null) return 0;
  const page = Number(match[1]);
  return Number.isSafeInteger(page) ? page : 0;
}

/** The checked rows, remembered for ONE view of the list (its query, sort, page and size). */
interface Picked {
  readonly view: string;
  readonly keys: ReadonlySet<string>;
  readonly allMatching: boolean;
}

interface RowSelection {
  readonly keys: ReadonlySet<string>;
  readonly page: boolean | 'indeterminate';
  readonly toggleRow: (key: string, checked: boolean) => void;
  readonly togglePage: (checked: boolean) => void;
}

interface RowsTableProps<Row> {
  readonly rows: readonly Row[];
  readonly columns: readonly ListColumn<Row>[];
  readonly rowKey: (row: Row) => string;
  readonly rowHref: (row: Row) => string;
  readonly recordName: (row: Row) => string;
  readonly rowActions: ((row: Row) => readonly RowAction[]) | undefined;
  readonly compactRowActions: boolean;
  /** `null`: the list has no bulk action, so no checkbox column at all. */
  readonly selection: RowSelection | null;
  readonly sort: string | null;
  readonly onSort: (next: string | null) => void;
  readonly busy: boolean;
  readonly onOpen: (row: Row) => void;
}

/**
 * The rows. Its own component so the row-click listener mounts WITH the `<tbody>` it listens to:
 * the page first renders the skeleton, and a listener registered then would find no table.
 */
function RowsTable<Row>({
  rows,
  columns,
  rowKey,
  rowHref,
  recordName,
  rowActions,
  compactRowActions,
  selection,
  sort,
  onSort,
  busy,
  onOpen,
}: RowsTableProps<Row>): ReactElement {
  const t = useTranslations('common');
  const tbody = useRef<HTMLTableSectionElement>(null);
  useRowClick(tbody);
  return (
    // Without the sticky actions, the frame's inline end fades while more of the table is that way.
    <div className={rowActions === undefined ? FRAME_FADE : undefined}>
      <Table data-testid="list-table" aria-busy={busy}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selection === null ? null : (
              <TableHead className="bg-muted h-10 w-10 px-4">
                <Checkbox
                  className={INDETERMINATE}
                  aria-label={t('select_all_on_page')}
                  checked={selection.page}
                  onCheckedChange={(next) => {
                    selection.togglePage(next === true);
                  }}
                />
              </TableHead>
            )}
            {columns.map((column) => (
              <TableHead
                key={column.id}
                className={cn(
                  'bg-muted h-10 px-4',
                  column.wrapHeader === true && 'h-auto min-h-10 py-1 whitespace-normal',
                  columnClass(column),
                )}
                {...(column.sortField === undefined
                  ? {}
                  : { 'aria-sort': ariaSortFor(column.sortField, sort) })}
              >
                {column.sortField === undefined ? (
                  <span className={column.headerHidden === true ? 'sr-only' : undefined}>
                    {column.header}
                  </span>
                ) : (
                  <SortableHeader
                    label={column.header}
                    field={column.sortField}
                    sort={sort}
                    onSort={onSort}
                    wrap={column.wrapHeader === true}
                  />
                )}
              </TableHead>
            ))}
            {rowActions === undefined ? null : (
              <TableHead className={cn('bg-muted h-10 px-4 text-end', STICKY_ACTIONS_HEAD)}>
                <span className="sr-only">{t('actions')}</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody ref={tbody}>
          {rows.map((row) => {
            const key = rowKey(row);
            const checked = selection?.keys.has(key) === true;
            return (
              <TableRow
                key={key}
                className={cn('h-12 cursor-pointer', OPAQUE_ROW)}
                {...(checked ? { 'data-state': 'selected' } : {})}
              >
                {selection === null ? null : (
                  // A near miss beside the box is not "open the row" either.
                  <TableCell data-row-ignore="" className="w-10 px-4 py-1">
                    <Checkbox
                      aria-label={t('select_row', { name: recordName(row) })}
                      checked={checked}
                      onCheckedChange={(next) => {
                        selection.toggleRow(key, next === true);
                      }}
                    />
                  </TableCell>
                )}
                {columns.map((column) => (
                  <TableCell key={column.id} className={cn('px-4 py-1', columnClass(column))}>
                    {column.primary === true ? (
                      <Link
                        data-row-link=""
                        href={rowHref(row)}
                        className="hover:underline focus-visible:underline"
                        onClick={() => {
                          onOpen(row);
                        }}
                      >
                        <EmptyAsNone value={column.cell(row)} />
                      </Link>
                    ) : (
                      <EmptyAsNone value={column.cell(row)} />
                    )}
                  </TableCell>
                ))}
                {rowActions === undefined ? null : (
                  <TableCell className={cn('px-4 py-1', STICKY_ACTIONS_CELL)}>
                    <RowActions
                      compact={compactRowActions}
                      recordName={recordName(row)}
                      actions={rowActions(row)}
                    />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The one list page (UIK-01; UI-SPEC § List page): a screen passes its endpoint, row schema and
 * columns, and this owns everything else: the title, the toolbar (server search, the Export menu,
 * the create button last), the table, the pager and every state.
 *
 * - **URL state (D-20).** Search, sort, cursor and page size live in the URL through the FE-15 door,
 *   so refresh, Back and a shared link land on the same view. The search box writes `q` (history
 *   replace, 300 ms); the REQUEST follows the settled `q`, never each keystroke (D-19), and at once
 *   on Enter or Clear search. Only a keyset column sorts (D-41).
 * - **States, in the D-39 precedence.** The first load is the list skeleton, and nothing else — no
 *   message before its answer. Then a failure is an inline error where the table is, keeping the
 *   title and toolbar and anything already loaded (D-31), in plain language (D-32), with Retry only
 *   when retrying can help. Then an empty answer: "no results for …" with Clear search when there
 *   is a search, else "nothing yet" with the create button (D-30). Then the rows. A refetch keeps
 *   the old rows and only marks the table `aria-busy`.
 * - **Rows.** The whole row opens the record by clicking its primary link (`useRowClick`); the link
 *   records the return (D-28) and hands the row to `onRowOpen` to seed the detail (D-35).
 * - **Export (D-26, D-42; 4.1.1).** One Export menu with CSV, Excel, PDF and Print (no PDF under a
 *   right-to-left locale, D-09), second to last in the toolbar and, while rows are ticked, in the
 *   selection bar (D-30). It exports everything matching the current search, filters and sort,
 *   never the page (no cursor, no limit), or only the ticked rows, sent as `key` (D-03); with the
 *   column labels in the user's language, and for PDF and Print the title, the yes and no words,
 *   the blank labels and the customer's date and time formats and zone (D-25). Each format's cap
 *   is told on its item before the click (D-06). Files download through the one axios instance;
 *   Print reads its rows and opens the browser's dialog over a hidden print view (D-08, D-28), so
 *   the list, its URL, scroll and selection never change. A running label while it runs, nothing
 *   on success, a plain inline error under the toolbar on failure (Retry when retrying can help).
 * - **Bulk selection (D-27).** Only when a module registers an action: a checkbox column, a
 *   selection bar in place of the toolbar's buttons, and "select all matching". A selection belongs
 *   to one view: a new search, sort, page or page size starts empty.
 * - **Requests (D-36).** A heavy list does not refetch on window focus; SWR deduplicates identical
 *   requests; a page change keeps the previous rows until the next page answers.
 * - **Filters (K1, K2; 4.2 D-21).** With `filterBar`, each declared filter lives in the URL in the
 *   api's grammar (`filter[<field>][<op>]`, `useListQueryState(filterBar.defs)`), and
 *   `filterParams(url.filters)` joins the list request and every export format. The filter bar sits
 *   under the toolbar; a change drops the cursor. Empty with a filter off its default is "no
 *   results" with "Clear search and filters" (q and every filter), else today's "Clear search". The
 *   skeleton adds the 32px filter row.
 * - **Columns (K4, 4.1.1 D-13).** With `columnsMenu`, an outline "Columns" menu before Export: a
 *   checkbox per hideable column in table order (the `fixed` ones absent), "Reset columns" last,
 *   remembered per member (`useColumnVisibility`). A hidden column leaves the table and the
 *   `column`, `header` and `blank` lists of every format (`visibleExportColumns`), so a list with a
 *   Columns menu names its export columns with its list column ids.
 * - **Slots (the K5 slot).** `header` replaces the `<h1>` (a record page's title row and tabs);
 *   the toolbar reads: search, spacer, `toolbar.beforeColumns`, Columns, Export,
 *   `toolbar.beforeCreate`, the create button.
 * - **Editable mode (K6, 4.2 UI-SPEC § Editable table).** With `editable`, the same URL state,
 *   pager, search, filters and skeleton render the `EditableTable` (rows, grid or add-only), the
 *   add button joins the toolbar (outline before the create link when there is one), and
 *   `EditableFlow` owns one save: one summary, one batch request in ADR-0040's wire
 *   (`{ rows: [{ id?, etag?, ...fields }] }`, every changed row with its etag), per-cell errors
 *   from a 400, and a 412 refused whole (L-08: nothing written, the stale rows marked, "Reload
 *   list"). While anything is dirty, paging, page size, sorting, searching, a filter
 *   change or a link waits behind "Discard changes?", and the pager stops being the pinned bar.
 */
export function ListPageTemplate<Row, ExportColumn extends string = string>({
  title,
  header,
  path,
  rowSchema,
  unpaginated,
  filters,
  filterBar,
  filterQuery = filterParams,
  searchLabel,
  toolbar,
  columnsMenu,
  listBase,
  rowKey,
  rowHref,
  recordName,
  onRowOpen,
  columns,
  rowActions,
  compactRowActions = false,
  createAction = null,
  exportAction = null,
  bulkActions = [],
  selectionLabel,
  selectAllMatching = true,
  offState,
  empty,
  recordsNoun,
  featureErrors,
  imageColumn = false,
  editable,
}: ListPageTemplateProps<Row, ExportColumn>): ReactElement {
  const t = useTranslations('common');
  const f = useFormat();
  const errorText = useErrorText(featureErrors);
  const defs = filterBar?.defs ?? NO_DEFS;
  const [url, actions] = useListQueryState(defs);
  const chosen = filterQuery(url.filters);
  const filtersActive = defs.some((def) => !isDefaultFilter(def, url.filters[def.key]));
  const visibility = useColumnVisibility(columnsMenu?.storageKey ?? '', {
    fixed: columnsMenu?.fixed ?? NO_IDS,
    defaultHidden: columnsMenu?.defaultHidden ?? NO_IDS,
  });
  const hidden = columnsMenu === undefined ? NONE_HIDDEN : visibility.hidden;
  const shownColumns = columns.filter((column) => !hidden.has(column.id));
  // The export follows the Columns menu (4.1.1 D-13): the visible columns, in table order.
  const visibleExportColumns =
    exportAction === null ? [] : exportAction.columns.filter((column) => !hidden.has(column));
  const [pageSize, setPageSize] = usePageSize();
  const [q, settleQ] = useSettledValue(url.search, CLIENT_TIMINGS.list.searchDebounceMs);
  const view = JSON.stringify([filters, chosen, q, url.sort, url.cursor, pageSize]);
  const [picked, setPicked] = useState<Picked>({ view, keys: new Set(), allMatching: false });
  const [exportState, setExportState] = useState<ExportState>(IDLE);
  const settings = useFormatSettings();
  // The editable mode's rows (K6): always held, so the hook order never changes with the prop.
  const editor = useEditableRows();
  const editFormId = useId();
  const [held, setHeld] = useState<HeldAction | null>(null);
  const dirty = editable === undefined ? 0 : editor.dirty;
  // A view change while anything is dirty waits behind "Discard changes?" (UI-SPEC § Editable table).
  const guarded = (run: () => void): void => {
    if (dirty > 0) setHeld({ run });
    else run();
  };
  const unpaginatedResponseSchema = useMemo<z.ZodType<{ readonly data: readonly Row[] }>>(
    () => unpaginated?.responseSchema ?? z.object({ data: z.array(rowSchema).readonly() }),
    [rowSchema, unpaginated?.responseSchema],
  );
  const paged = useList(
    unpaginated === undefined ? path : null,
    rowSchema,
    {
      ...filters,
      ...chosen,
      q: q === '' ? undefined : q,
      sort: url.sort ?? undefined,
      cursor: url.cursor ?? undefined,
      limit: pageSize,
    },
    { revalidateOnFocus: false, keepPreviousData: true },
  );
  const unpaged = useCommonApi<{ readonly data: readonly Row[] }>(
    unpaginated === undefined ? null : path,
    unpaginatedResponseSchema,
    undefined,
    { revalidateOnFocus: false, keepPreviousData: true },
  );
  let data = paged.data;
  if (unpaginated !== undefined) {
    data =
      unpaged.data === undefined
        ? undefined
        : {
            data: unpaged.data.data,
            meta: {
              nextCursor: null,
              prevCursor: null,
              total: unpaged.data.data.length,
              rangeStart: unpaged.data.data.length === 0 ? 0 : 1,
            },
          };
  }
  const error = unpaginated === undefined ? paged.error : unpaged.error;
  const isLoading = unpaginated === undefined ? paged.isLoading : unpaged.isLoading;
  const isValidating = unpaginated === undefined ? paged.isValidating : unpaged.isValidating;
  const mutate = unpaginated === undefined ? paged.mutate : unpaged.mutate;
  useRestoreListScroll(listBase, data !== undefined);

  if (isLoading && data === undefined) {
    return (
      <PageSkeleton
        variant="list"
        rows={pageSize}
        columns={shownColumns.length}
        hasImage={imageColumn}
        filterRow={filterBar !== undefined}
        {...(filterBar?.skeletonTriggers === undefined
          ? {}
          : { filterTriggers: filterBar.skeletonTriggers })}
        testId="list-loading"
      />
    );
  }

  const off = data === undefined && error !== undefined ? offState?.(error.code) : undefined;
  if (off !== undefined && off !== null) return <>{off}</>;

  const responseRows = data?.data ?? [];
  const searchedRows =
    unpaginated !== undefined && q !== ''
      ? responseRows.filter((row) => unpaginated.matchesSearch(row, q))
      : responseRows;
  let rows = searchedRows;
  if (unpaginated !== undefined) {
    rows = sortUnpaginatedRows(searchedRows, url.sort, columns);
  }
  let pageMeta = data?.meta;
  if (unpaginated?.clientPagination === true && data !== undefined) {
    const pageCount = Math.ceil(rows.length / pageSize);
    const page = Math.min(localPageOf(url.cursor), Math.max(0, pageCount - 1));
    rows = rows.slice(page * pageSize, (page + 1) * pageSize);
    pageMeta = {
      ...data.meta,
      nextCursor: page + 1 < pageCount ? `client:${String(page + 1)}` : null,
      prevCursor: page > 0 ? `client:${String(page - 1)}` : null,
      total: searchedRows.length,
      rangeStart: rows.length === 0 ? 0 : page * pageSize + 1,
    };
  }
  const total = pageMeta?.total;
  // The api's per-list options reach each cell and row menu (opt-in, plan 04.7-23).
  const listOptions = data?.meta.options ?? NO_OPTIONS;
  const bodyColumns = shownColumns.map((column) => ({
    ...column,
    cell: (row: Row) => column.cell(row, listOptions),
  }));
  const bodyActions =
    rowActions === undefined ? undefined : (row: Row) => rowActions(row, listOptions);
  // Derived, not reset by an effect: a selection made for another view reads as empty.
  const current = picked.view === view ? picked : { keys: new Set<string>(), allMatching: false };
  const selectedRows = rows.filter((row) => current.keys.has(rowKey(row)));
  const allOnPage = rows.length > 0 && selectedRows.length === rows.length;
  const selectedCount = current.allMatching && total !== undefined ? total : selectedRows.length;
  const selectable = bulkActions.length > 0 || editable?.bulkSet !== undefined;
  // Ticked rows are exported by their keys (D-03); "select all matching" exports the query.
  const ticked = selectable && !current.allMatching && selectedRows.length > 0;
  const exportKeys = ticked ? selectedRows.map(rowKey) : null;
  // A cursor that names no page any more: a refusal on `cursor`, or an empty answer to a cursor.
  // Never on the first page (no cursor), where the ordinary empty states apply (lead decision 3).
  const stalePage =
    unpaginated === undefined &&
    url.cursor !== null &&
    (error === undefined
      ? data !== undefined && rows.length === 0
      : error.code === 'ERP-VALIDATION-0001' && refusesCursor(error.issues));

  // The nothing-yet state: an answered first page, empty, with no search and every filter default.
  const nothingYet =
    !stalePage &&
    data !== undefined &&
    rows.length === 0 &&
    editor.state.added.length === 0 &&
    q === '' &&
    !filtersActive;

  const select = (keys: ReadonlySet<string>, allMatching = false): void => {
    setPicked({ view, keys, allMatching });
  };
  const clearSelection = (): void => {
    select(new Set());
  };
  const clearSearchNow = (): void => {
    actions.clearSearch();
    settleQ('');
  };
  const clearSearch = (): void => {
    guarded(clearSearchNow);
  };
  const clearSearchAndFilters = (): void => {
    guarded(() => {
      clearSearchNow();
      actions.clearFilters();
    });
  };
  // The ONE file download (CSV, Excel, PDF) and the one Print read, each with its query written out
  // in place, so both literals' keys can be read off this file.
  const runDownload = (format: DownloadFormat): void => {
    if (exportAction === null) return;
    setExportState({ kind: 'running', format });
    void downloadFile(
      exportAction.path,
      {
        ...filters,
        ...chosen,
        ...(q === '' ? {} : { q }),
        ...(url.sort === null ? {} : { sort: url.sort }),
        format,
        column: visibleExportColumns,
        header: visibleExportColumns.map((column) => exportAction.labels[column]),
        ...(exportKeys === null ? {} : { key: exportKeys }),
        ...(format === 'pdf'
          ? {
              title,
              yes: t('is_active_export'),
              no: t('is_not_active_export'),
              blank: visibleExportColumns.map((column) => exportAction.blanks?.[column] ?? ''),
              dateFormat: settings.dateFormat,
              timeFormat: settings.timeFormat,
              timeZone: settings.timeZone ?? DEPLOYMENT_TIME_ZONE,
            }
          : {}),
      },
      undefined,
      format,
    ).then((result) => {
      setExportState(result.ok ? IDLE : exportFailure(format, result));
    });
  };
  const runPrint = (): void => {
    if (exportAction === null) return;
    setExportState({ kind: 'running', format: 'print' });
    void readExportRows(exportAction.path, {
      ...filters,
      ...chosen,
      ...(q === '' ? {} : { q }),
      ...(url.sort === null ? {} : { sort: url.sort }),
      format: 'print',
      column: visibleExportColumns,
      header: visibleExportColumns.map((column) => exportAction.labels[column]),
      ...(exportKeys === null ? {} : { key: exportKeys }),
      title,
      yes: t('is_active_export'),
      no: t('is_not_active_export'),
      blank: visibleExportColumns.map((column) => exportAction.blanks?.[column] ?? ''),
      dateFormat: settings.dateFormat,
      timeFormat: settings.timeFormat,
      timeZone: settings.timeZone ?? DEPLOYMENT_TIME_ZONE,
    }).then((result) => {
      setExportState(
        result.ok ? { kind: 'printing', rows: result.data } : exportFailure('print', result),
      );
    });
  };
  const runExport = (format: ExportFormat): void => {
    if (format === 'print') runPrint();
    else runDownload(format);
  };
  // One menu, in the toolbar or in the selection bar: the ticked count decides the caps (D-06).
  const exportMenu =
    exportAction === null ? null : (
      <ExportMenu
        count={ticked ? selectedRows.length : total}
        selected={ticked}
        exportLimit={data?.meta.exportLimit}
        printLimit={data?.meta.printLimit}
        running={runningOf(exportState)}
        onSelect={runExport}
      />
    );

  // Non-modal, like the Export menu: a modal menu aria-hides the page while its trigger stays focusable.
  const columnsButton =
    columnsMenu === undefined ? null : (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="lg" data-testid="list-columns">
            {t('columns')}
            <Icon name="chevron-down" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {columns
            .filter((column) => !columnsMenu.fixed.includes(column.id))
            .map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={!hidden.has(column.id)}
                onCheckedChange={(checked) => {
                  visibility.setHidden(column.id, !checked);
                }}
                // Several columns in one visit: the menu stays open after each tick.
                onSelect={(event) => {
                  event.preventDefault();
                }}
              >
                {column.header}
              </DropdownMenuCheckboxItem>
            ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={visibility.reset}>{t('reset_columns')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const createButton = createAction === null ? null : <CreateButton action={createAction} />;
  // The editable mode adds rows in place (K6): "Add unit" inserts a blank row at the top. Beside a
  // create link it is the outline button before it: one primary button per toolbar.
  const addLabel = editable?.labels.addLabel;
  const blankDraft = editable?.canAdd === true ? editable.blankDraft : undefined;
  const addButton =
    editable === undefined || blankDraft === undefined || addLabel === undefined ? null : (
      <Button
        type="button"
        size="lg"
        variant={createButton === null ? 'default' : 'outline'}
        onClick={() => {
          editor.dispatch({ type: 'add', draft: blankDraft() });
        }}
      >
        <Icon name="plus" />
        {addLabel}
      </Button>
    );
  const primaryAction = createButton ?? addButton;

  const selection: RowSelection | null = selectable
    ? {
        keys: current.keys,
        page: allOnPage ? true : selectedRows.length > 0 ? 'indeterminate' : false,
        toggleRow: (key: string, checked: boolean) => {
          const keys = new Set(current.keys);
          if (checked) keys.add(key);
          else keys.delete(key);
          select(keys);
        },
        togglePage: (checked: boolean) => {
          select(checked ? new Set(rows.map(rowKey)) : new Set());
        },
      }
    : null;
  const onSort = (next: string | null): void => {
    guarded(() => {
      actions.setSort(next);
    });
  };
  const onOpen = (row: Row): void => {
    recordListReturn(listBase);
    onRowOpen?.(row);
  };
  // Pinned to the bottom of the viewport like the SaveBar (lead decision 1), except while the
  // editable table is dirty: then the save bar is the pinned bar. In flow after the table, so at the
  // end of the scroll it sits below the last row and never covers it.
  const pager =
    (unpaginated !== undefined && unpaginated.clientPagination !== true) ||
    data === undefined ||
    pageMeta === undefined ||
    rows.length === 0 ? null : (
      <div
        data-testid="list-pager"
        className={cn('bg-background border-t py-3', dirty === 0 && 'sticky bottom-0 z-10')}
      >
        <Pager
          meta={pageMeta}
          rowsOnPage={rows.length}
          pageSize={pageSize}
          onPageSize={(size) => {
            guarded(() => {
              setPageSize(size);
            });
          }}
          onPrevious={() => {
            guarded(() => {
              actions.setCursor(pageMeta.prevCursor);
            });
          }}
          onNext={() => {
            guarded(() => {
              actions.setCursor(pageMeta.nextCursor);
            });
          }}
        />
      </div>
    );
  const listBody =
    editable === undefined ? (
      <>
        <RowsTable
          rows={rows}
          columns={bodyColumns}
          rowKey={rowKey}
          rowHref={rowHref}
          recordName={recordName}
          rowActions={bodyActions}
          compactRowActions={compactRowActions}
          selection={selection}
          sort={url.sort}
          onSort={onSort}
          busy={isValidating}
          onOpen={onOpen}
        />
        {pager}
      </>
    ) : (
      <EditableFlow
        formId={editFormId}
        config={editable}
        rows={rows}
        recordName={recordName}
        state={editor.state}
        dispatch={editor.dispatch}
        dirty={dirty}
        held={held}
        onHold={setHeld}
        revalidate={() => {
          void mutate();
        }}
        featureErrors={featureErrors}
      >
        <EditableTable
          formId={editFormId}
          rows={rows}
          config={editable}
          state={editor.state}
          dispatch={editor.dispatch}
          columns={bodyColumns}
          recordName={recordName}
          rowHref={rowHref}
          rowActions={bodyActions}
          selection={selection}
          sort={url.sort}
          onSort={onSort}
          busy={isValidating}
          onOpen={onOpen}
        />
        {pager}
      </EditableFlow>
    );

  return (
    <section className="flex flex-col gap-4">
      {header ?? <h1 className="text-2xl font-semibold">{title}</h1>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full md:w-80">
          <Icon
            name="magnifying-glass"
            className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2"
          />
          <Input
            aria-label={searchLabel ?? t('search')}
            placeholder={searchLabel ?? t('search')}
            autoComplete="off"
            className="ps-8 pe-8"
            value={url.q}
            onChange={(event) => {
              const next = event.target.value;
              guarded(() => {
                actions.setSearch(next);
              });
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              actions.flushSearch(event.currentTarget.value);
              settleQ(event.currentTarget.value.trim());
            }}
          />
          {url.q === '' ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('clear_search')}
              className="absolute end-1 top-1/2 -translate-y-1/2"
              onClick={clearSearch}
            >
              <Icon name="xmark" />
            </Button>
          )}
        </div>
        {selectable && selectedCount > 0 ? (
          <div
            data-testid="list-selection-bar"
            className="ms-auto flex flex-wrap items-center gap-2"
          >
            <span className="text-sm font-semibold tabular-nums">
              {selectionLabel === undefined
                ? t('selected_count', { count: f.number(selectedCount) })
                : selectionLabel({ rows: selectedRows, count: selectedCount })}
            </span>
            {/* Non-modal: a modal menu aria-hides the page while its trigger stays focusable (axe aria-hidden-focus). */}
            {bulkActions.length === 0 ? null : (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="lg">
                    {t('bulk_actions')}
                    <Icon name="chevron-down" />
                  </Button>
                </DropdownMenuTrigger>
                {/* Sized to its labels (the primitive takes the trigger's width, which wraps them). */}
                <DropdownMenuContent
                  align="end"
                  className="w-auto min-w-(--radix-dropdown-menu-trigger-width)"
                >
                  {bulkActions.map((action, index) => (
                    <Fragment key={action.id}>
                      {action.kind === 'destructive' &&
                      index > 0 &&
                      bulkActions[index - 1]?.kind !== 'destructive' ? (
                        <DropdownMenuSeparator />
                      ) : null}
                      <DropdownMenuItem
                        variant={action.kind ?? 'default'}
                        onSelect={() => {
                          action.onSelect({ rows: selectedRows, allMatching: current.allMatching });
                        }}
                      >
                        {action.label}
                      </DropdownMenuItem>
                    </Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {editable === undefined ? null : (
              <BulkSetButton config={editable} rows={selectedRows} dispatch={editor.dispatch} />
            )}
            {exportMenu}
            <Button type="button" variant="ghost" size="lg" onClick={clearSelection}>
              {t('clear_selection')}
            </Button>
          </div>
        ) : (
          <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
            {toolbar?.beforeColumns}
            {columnsButton}
            {exportMenu}
            {toolbar?.beforeCreate}
            {createButton === null ? null : addButton}
            {nothingYet && empty.createOnlyInEmpty === true ? null : primaryAction}
          </div>
        )}
      </div>

      {filterBar === undefined ? null : (
        <FilterBar
          controls={filterBar.controls}
          values={url.filters}
          isDefault={(key) => {
            const def = defs.find((candidate) => candidate.key === key);
            return def === undefined || isDefaultFilter(def, url.filters[key]);
          }}
          onChange={(key, next) => {
            guarded(() => {
              actions.setFilter(key, next);
            });
          }}
          onClear={() => {
            guarded(() => {
              actions.clearFilters();
            });
          }}
          total={total}
        />
      )}

      <ExportError state={exportState} onRetry={runExport} errorText={errorText} />
      {exportState.kind === 'printing' ? (
        <PrintView
          title={title}
          exportedAt={exportState.rows.exportedAt}
          headers={exportState.rows.headers}
          rows={exportState.rows.rows}
          onDone={() => {
            setExportState(IDLE);
          }}
        />
      ) : null}

      {selectable && allOnPage ? (
        <div
          data-testid="list-select-all"
          className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-md px-4 py-2 text-sm"
        >
          {current.allMatching && total !== undefined ? (
            <>
              <span>{t('all_matching_selected', { total: f.number(total) })}</span>
              <Button type="button" variant="link" className="h-auto p-0" onClick={clearSelection}>
                {t('clear_selection')}
              </Button>
            </>
          ) : (
            <>
              <span>{t('all_on_page_selected', { count: f.number(rows.length) })}</span>
              {selectAllMatching && total !== undefined && total > rows.length ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => {
                    select(current.keys, true);
                  }}
                >
                  {t('select_all_matching', { total: f.number(total) })}
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {stalePage ? (
        <EmptyState
          testId="list-stale-page"
          heading={t('page_unavailable')}
          body={t('page_unavailable_body')}
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                guarded(() => {
                  actions.setCursor(null);
                });
              }}
            >
              {t('back_to_first_page')}
            </Button>
          }
        />
      ) : null}

      {error === undefined || stalePage ? null : (
        <InlineError
          testId="list-error"
          message={
            isRetryableCode(error.code)
              ? t('list_failed', { records: recordsNoun })
              : errorText(error)
          }
          busy={isValidating}
          {...(isRetryableCode(error.code)
            ? {
                onRetry: () => {
                  void mutate();
                },
              }
            : {})}
        />
      )}

      {!stalePage && data !== undefined && rows.length === 0 && editor.state.added.length === 0 ? (
        q === '' && !filtersActive ? (
          <EmptyState
            heading={empty.nothingYetHeading}
            body={empty.nothingYetBody}
            action={nothingYetActionOf(empty, primaryAction)}
          />
        ) : (
          <EmptyState
            testId="list-no-results"
            heading={empty.noResultsHeading(q)}
            body={empty.noResultsBody}
            action={
              filtersActive ? (
                <Button type="button" variant="outline" onClick={clearSearchAndFilters}>
                  {t('clear_search_and_filters')}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={clearSearch}>
                  {t('clear_search')}
                </Button>
              )
            }
          />
        )
      ) : null}

      {!stalePage && data !== undefined && (rows.length > 0 || editor.state.added.length > 0)
        ? listBody
        : null}
    </section>
  );
}
