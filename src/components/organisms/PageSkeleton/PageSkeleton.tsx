'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { FieldBlocksSkeleton } from '@/components/molecules/FieldBlocksSkeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** The page shapes a guard or a screen waits in: a list, a form, a record with tabs, a settings page. */
export type PageSkeletonVariant = 'list' | 'form' | 'record' | 'settings';

export interface PageSkeletonProps {
  readonly variant: PageSkeletonVariant;
  /** List (and a record's list body): the page size, capped at `LIST_ROWS_MAX` (default `LIST_ROWS_MAX`). */
  readonly rows?: number;
  /** List, record list and settings table: one bar per visible column (default 4). */
  readonly columns?: number;
  /** List only: a 40 px square in the image column of every row. */
  readonly hasImage?: boolean;
  /** List only: the filter row under the toolbar (K2): four 192px triggers at md+, the Filters button below. */
  readonly filterRow?: boolean;
  /** List only, opt-in (plan 04.6-06): how many 192px triggers the filter row draws, its inline filters (default four). */
  readonly filterTriggers?: number;
  /** Form only: the detail header's badge shape after the title bar. */
  readonly withBadge?: boolean;
  /** Record only: one 96px bar per tab (default 2). */
  readonly tabs?: number;
  /** Record only: the shape under the tab bar (default `'form'`). */
  readonly recordBody?: 'form' | 'list';
  /** Settings only: the bars of the tab row (default 9). */
  readonly navRows?: number;
  readonly testId?: string;
}

/** A list skeleton never draws more rows than one screen of a list shows (UI-SPEC § Skeletons). */
const LIST_ROWS_MAX = 10;
const LIST_COLUMNS_DEFAULT = 4;
const FORM_FIELDS = 6;
/** UI-SPEC § States: a 32px filter row of four 192px triggers (the inline maximum, K2). */
const FILTER_TRIGGERS = 4;
const RECORD_TABS_DEFAULT = 2;
/** The settings tab row: eight tabs, then "More". */
const SETTINGS_NAV_ROWS_DEFAULT = 9;
/** 4.2 UI-SPEC § States: the settings page's compact table. */
const SETTINGS_TABLE_ROWS = 8;
const PAGER_CONTROLS = ['previous', 'size', 'next'] as const;

/** Plan 08's contract names it here; it lives one layer down so a molecule (`ChoiceField`) can use it (FE-06). */
export { FieldBlocksSkeleton };

/** Cell bars cycle through 40–80 % of the column, so the rows read as data, not as stripes. */
const CELL_BAR_WIDTHS = ['w-3/5', 'w-4/5', 'w-2/5', 'w-3/4'] as const;

const placeholders = (count: number): readonly number[] =>
  Array.from({ length: Math.max(0, count) }, (_, index) => index);

/** The table and the pager: a list page's body, a record tab's list, a settings table. */
function TableShape({
  rows,
  columns,
  hasImage,
  compact = false,
}: {
  readonly rows: number;
  readonly columns: number;
  readonly hasImage: boolean;
  readonly compact?: boolean;
}): ReactElement {
  return (
    <>
      <div className="rounded-lg border">
        <div className="bg-muted h-10 rounded-t-lg" />
        {placeholders(compact ? rows : Math.min(rows, LIST_ROWS_MAX)).map((row) => (
          <div
            // A fixed list of placeholders that never reorders: the index is its identity.
            key={row}
            className={cn('flex items-center border-t', compact ? 'h-9' : 'h-12')}
            data-testid="skeleton-row"
          >
            {hasImage ? (
              <div className="px-4">
                <Skeleton className="size-10" data-testid="skeleton-thumbnail" />
              </div>
            ) : null}
            {placeholders(columns).map((column) => (
              <div
                // A fixed list of placeholders that never reorders: the index is its identity.
                key={column}
                className="flex-1 px-4"
              >
                <Skeleton
                  className={cn('h-3.5', CELL_BAR_WIDTHS[(row + column) % CELL_BAR_WIDTHS.length])}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4" data-testid="skeleton-pager">
        <Skeleton className="h-3 w-40" />
        <div className="flex gap-2">
          {PAGER_CONTROLS.map((control) => (
            <Skeleton key={control} className="size-8" />
          ))}
        </div>
      </div>
    </>
  );
}

function ListShape({
  rows,
  columns,
  hasImage,
  filterRow,
  filterTriggers = FILTER_TRIGGERS,
}: {
  readonly rows: number;
  readonly columns: number;
  readonly hasImage: boolean;
  readonly filterRow: boolean;
  readonly filterTriggers: number | undefined;
}): ReactElement {
  return (
    <>
      <Skeleton className="h-6 w-48" />
      <div className="flex items-center justify-between gap-4" data-testid="skeleton-toolbar">
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="h-9 w-32" />
      </div>
      {filterRow ? (
        <div data-testid="skeleton-filter-row">
          <div className="hidden gap-2 md:flex">
            {placeholders(filterTriggers).map((bar) => (
              <Skeleton key={bar} className="h-8 w-48" />
            ))}
          </div>
          <div className="md:hidden">
            <Skeleton className="h-8 w-24" data-testid="skeleton-filter-button" />
          </div>
        </div>
      ) : null}
      <TableShape rows={rows} columns={columns} hasImage={hasImage} />
    </>
  );
}

/** The detail header: a 24 × 256 px title bar, then the 20 × 64 px badge when there is one. */
function TitleShape({ withBadge }: { readonly withBadge: boolean }): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-6 w-64" data-testid="skeleton-title" />
      {withBadge ? <Skeleton className="h-5 w-16" data-testid="skeleton-badge" /> : null}
    </div>
  );
}

/** A form's one section of labelled field blocks, then the 68 px save bar. */
function FormBodyShape(): ReactElement {
  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border p-6">
        <Skeleton className="h-4.5 w-40" />
        <FieldBlocksSkeleton count={FORM_FIELDS} />
      </div>
      <div
        className="flex h-17 items-center justify-end gap-2 border-t"
        data-testid="skeleton-save-bar"
      >
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
    </>
  );
}

/** A record page (K13): the detail header, a 36px tab bar of 96px bars, then the form or a list. */
function RecordShape({
  tabs,
  body,
  rows,
  columns,
}: {
  readonly tabs: number;
  readonly body: 'form' | 'list';
  readonly rows: number;
  readonly columns: number;
}): ReactElement {
  return (
    <>
      <TitleShape withBadge />
      <div
        className="flex h-9 items-center gap-2 overflow-hidden border-b"
        data-testid="skeleton-tabs"
      >
        {placeholders(tabs).map((tab) => (
          <Skeleton key={tab} className="h-4 w-24 shrink-0" data-testid="skeleton-tab" />
        ))}
      </div>
      {body === 'list' ? (
        <TableShape rows={rows} columns={columns} hasImage={false} />
      ) : (
        <FormBodyShape />
      )}
    </>
  );
}

/**
 * A settings page (K13): the title bar, one 36px tab row of 96px bars at every width (it clips what
 * does not fit, as the tabs scroll), and a compact table of 8 rows at the full width.
 */
function SettingsShape({
  navRows,
  columns,
}: {
  readonly navRows: number;
  readonly columns: number;
}): ReactElement {
  return (
    <>
      <Skeleton className="h-6 w-64" data-testid="skeleton-title" />
      <div
        className="flex h-9 items-center gap-2 overflow-hidden border-b"
        data-testid="skeleton-settings-nav"
      >
        {placeholders(navRows).map((tab) => (
          <Skeleton key={tab} className="h-4 w-24 shrink-0" data-testid="skeleton-nav-row" />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <TableShape rows={SETTINGS_TABLE_ROWS} columns={columns} hasImage={false} compact />
      </div>
    </>
  );
}

/**
 * The page-level loading state (D-14, D-39): the SHAPE of the page it waits for — a list page's
 * title, toolbar, header row, rows and pager, or a form page's title, labelled field blocks and save
 * bar — never a spinner on a blank page and never a bare `h-32` bar. `withAuth`, `withPermission`
 * and the screen's own first load render this same component in the same variant, so the shape
 * never jumps between the three phases (UI-SPEC § Access gating states). Every dimension is a
 * literal class from UI-SPEC § Skeletons (Tailwind sees only literal names, RESEARCH Pitfall 11).
 *
 * Two more shapes (K13, 4.2 UI-SPEC § States and stories): `record`, a record page with tabs (the
 * detail header, a 36px tab bar with one 96px bar per tab, then the form or a list), and `settings`
 * (the title bar, one tab row of 96px bars, a compact 8-row table at the full width).
 */
export function PageSkeleton({
  variant,
  rows = LIST_ROWS_MAX,
  columns = LIST_COLUMNS_DEFAULT,
  hasImage = false,
  filterRow = false,
  filterTriggers,
  withBadge = false,
  tabs = RECORD_TABS_DEFAULT,
  recordBody = 'form',
  navRows = SETTINGS_NAV_ROWS_DEFAULT,
  testId = 'page-skeleton',
}: PageSkeletonProps): ReactElement {
  const t = useTranslations('common');
  const shape = {
    list: () => (
      <ListShape
        rows={rows}
        columns={columns}
        hasImage={hasImage}
        filterRow={filterRow}
        filterTriggers={filterTriggers}
      />
    ),
    form: () => (
      <>
        <TitleShape withBadge={withBadge} />
        <FormBodyShape />
      </>
    ),
    record: () => <RecordShape tabs={tabs} body={recordBody} rows={rows} columns={columns} />,
    settings: () => <SettingsShape navRows={navRows} columns={columns} />,
  } as const;
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid={testId}
      data-variant={variant}
      className="flex flex-col gap-4"
    >
      <span className="sr-only">{t('loading')}</span>
      {shape[variant]()}
    </div>
  );
}
