'use client';

import { useTranslations } from 'next-intl';
import { useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import type { z } from 'zod';
import { InlineError } from '@/components/molecules/InlineError';
import { PickedChips } from '@/components/molecules/SearchableMultiSelect';
import { SearchPopover } from '@/components/molecules/SearchableSelect';
import { Badge } from '@/components/ui/badge';
import { CommandItem } from '@/components/ui/command';
import { Skeleton } from '@/components/ui/skeleton';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import type { Params } from '@/lib/api/keys';
import { useListPages, type ListPages } from '@/lib/api/use-list-pages';
import { isRetryableCode } from '@/lib/errors/error-messages';
import { useErrorText } from '@/lib/errors/use-error-text';
import { useSettledValue } from '@/lib/hooks/use-settled-value';

/** The api path type, taken from the read door (a component never imports `call-api`, FE-08). */
type ApiPath = NonNullable<Parameters<typeof useListPages>[0]>;

/** One row as the picker shows it: line 1 `label`, line 2 `meta` (12px muted); `inactive` badges the trigger. */
export interface AsyncOption {
  readonly value: string;
  readonly label: string;
  readonly meta?: string;
  readonly inactive?: boolean;
}

export interface AsyncSearchableSelectProps<Row> {
  readonly id: string;
  /** A BE-19 keyset list endpoint (`q`, `limit`, `cursor`). */
  readonly path: ApiPath;
  /** Fixed filters sent with every page, e.g. `{ 'filter[active][eq]': '1' }`. */
  readonly params?: Params;
  readonly rowSchema: z.ZodType<Row>;
  readonly toOption: (row: Row) => AsyncOption;
  readonly multiple?: boolean;
  /** One element when single. */
  readonly value: readonly string[];
  /** The new values and, in the same order, their options (store them as `selected`). */
  readonly onChange: (values: string[], options: readonly AsyncOption[]) => void;
  /** The picked values' options, shown even when off the loaded page. */
  readonly selected: readonly AsyncOption[];
  /** The trigger's muted text while nothing is picked ("Select item"). */
  readonly placeholder: string;
  /** The search box's placeholder ("Search by name, SKU or barcode"). */
  readonly searchPlaceholder: string;
  readonly noMatchText: (query: string) => string;
  /** The row whose scan code equals the typed text exactly: Enter picks it (a hardware scanner). */
  readonly exactMatch?: (query: string, rows: readonly Row[]) => Row | undefined;
  /** Multiple only; default true. */
  readonly showChips?: boolean;
  /** The badge beside a picked option that has become inactive ("Inactive"). */
  readonly inactiveLabel?: string;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly describedBy?: string;
}

export const ASYNC_PAGE_SIZE = 25;

/** The cmdk value of the "Show more results" row: outside any option value. */
const SHOW_MORE = '__show-more__';
const SKELETON_ROWS = ['a', 'b', 'c'] as const;

/** A focus move after "Show more", or an Enter waiting for its query's first page (the scanner). */
type Pending =
  | { readonly kind: 'focus'; readonly index: number }
  | { readonly kind: 'enter'; readonly query: string }
  | null;

type RowRef = ((node: HTMLDivElement | null) => void) | undefined;

const isOption = (option: AsyncOption | undefined): option is AsyncOption => option !== undefined;

/** Brings the row into view when a ref callback hands it over (FE-04: no effect). */
function scrollIntoView(node: HTMLElement): void {
  if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' });
}

/** The row an Enter waits for: the scan's one match, once the page for that exact text is in. */
function scannedRow<Row>(
  pending: Pending,
  q: string,
  pages: ListPages<Row>,
  exactMatch: AsyncSearchableSelectProps<Row>['exactMatch'],
): Row | undefined {
  if (pending?.kind !== 'enter' || pending.query !== q || pages.isLoading) return undefined;
  return exactMatch?.(pending.query, pages.rows);
}

/** The index of the first row "Show more results" asked for, once it has arrived. */
function focusIndexOf(pending: Pending, loaded: number): number | null {
  return pending?.kind === 'focus' && loaded > pending.index ? pending.index : null;
}

/** The state and the handlers: the box, the settled query, the pages, picking and the two ref moves. */
function useAsyncPicker<Row>({
  path,
  params,
  rowSchema,
  toOption,
  multiple = false,
  value,
  onChange,
  selected,
  exactMatch,
}: AsyncSearchableSelectProps<Row>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  const [settled, settle] = useSettledValue(query, CLIENT_TIMINGS.list.searchDebounceMs);
  const q = settled.trim();
  const pages = useListPages(
    open ? path : null,
    rowSchema,
    { ...params, q: q === '' ? undefined : q },
    ASYNC_PAGE_SIZE,
  );
  const options = pages.rows.map(toOption);
  // `selected` last, so a caller's label wins over the loaded row's.
  const byValue = new Map([...options, ...selected].map((o) => [o.value, o] as const));
  const optionsFor = (values: readonly string[]): AsyncOption[] =>
    values.map((v) => byValue.get(v)).filter(isOption);

  const reset = (): void => {
    setQuery('');
    settle('');
    setPending(null);
  };
  const close = (): void => {
    setOpen(false);
    reset();
  };
  /** Single: pick and close. Multiple: toggle, or (a scan) add and clear the box. */
  const pick = (option: AsyncOption, scanned: boolean): void => {
    if (!multiple) {
      onChange([option.value], [option]);
      close();
      return;
    }
    const has = value.includes(option.value);
    if (scanned) reset();
    if (scanned && has) return;
    const next = has ? value.filter((kept) => kept !== option.value) : [...value, option.value];
    onChange(next, optionsFor(next));
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return;
    const typed = query.trim();
    if (typed === q && !pages.isLoading) {
      const match = exactMatch?.(typed, pages.rows);
      if (match === undefined) return; // cmdk picks the highlighted row
      event.preventDefault();
      pick(toOption(match), true);
      return;
    }
    event.preventDefault();
    settle(query);
    if (exactMatch !== undefined) setPending({ kind: 'enter', query: typed });
  };

  const scanned = scannedRow(pending, q, pages, exactMatch);
  const scannedValue = scanned === undefined ? undefined : toOption(scanned).value;
  const focusIndex = focusIndexOf(pending, pages.rows.length);
  /** The scan's match picks itself as it renders; the first new row takes the highlight. */
  const refFor = (option: AsyncOption, index: number): RowRef => {
    if (option.value === scannedValue) {
      return (node) => {
        if (node !== null) pick(option, true);
      };
    }
    if (index !== focusIndex) return undefined;
    return (node) => {
      if (node === null) return;
      setActive(option.value);
      setPending(null);
      scrollIntoView(node);
    };
  };

  return {
    open,
    onOpenChange: (next: boolean) => {
      if (next) setOpen(true);
      else close();
    },
    query,
    onSearchChange: (next: string) => {
      setQuery(next);
      setPending(null);
    },
    onSearchKeyDown,
    active,
    setActive,
    q,
    pages,
    options,
    optionsFor,
    pick,
    refFor,
    showMore: pages.hasMore
      ? () => {
          if (pages.isLoadingMore) return;
          setPending({ kind: 'focus', index: pages.rows.length });
          pages.loadMore();
        }
      : undefined,
  };
}

/** Three 36px skeleton rows while the first answer is unknown, the kit error after a failure (D-39). */
function pickerStatus<Row>(
  pages: ListPages<Row>,
  loadingLabel: string,
  errorText: ReturnType<typeof useErrorText>,
): ReactNode {
  if (pages.isLoading) {
    return (
      <div
        data-testid="async-select-loading"
        role="status"
        aria-label={loadingLabel}
        className="flex flex-col gap-1 p-1"
      >
        {SKELETON_ROWS.map((key) => (
          <Skeleton key={key} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (pages.error === undefined) return undefined;
  return (
    <div className="p-1">
      <InlineError
        testId="async-select-error"
        message={errorText(pages.error)}
        {...(isRetryableCode(pages.error.code) ? { onRetry: pages.retry } : {})}
      />
    </div>
  );
}

/** The trigger's text: "{count} selected" (multiple), else the picked label in `<bdi>` with its badge. */
function triggerSummary(
  picked: readonly AsyncOption[],
  count: string | undefined,
  inactiveLabel: string | undefined,
): ReactNode {
  if (count !== undefined) return count;
  const current = picked[0];
  if (current === undefined) return undefined;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <bdi className="truncate">{current.label}</bdi>
      {current.inactive === true && inactiveLabel !== undefined ? (
        <Badge variant="secondary">{inactiveLabel}</Badge>
      ) : null}
    </span>
  );
}

interface PickerRowsProps {
  readonly options: readonly AsyncOption[];
  readonly value: readonly string[];
  readonly refFor: (option: AsyncOption, index: number) => RowRef;
  readonly onPick: (option: AsyncOption) => void;
  readonly showMore: (() => void) | undefined;
  readonly loadingMore: boolean;
}

/** The two-line rows, then "Show more results" while the list has more: every one an option. */
function PickerRows({
  options,
  value,
  refFor,
  onPick,
  showMore,
  loadingMore,
}: PickerRowsProps): ReactElement {
  const t = useTranslations('common');
  return (
    <>
      {options.map((option, index) => {
        const checked = value.includes(option.value);
        return (
          <CommandItem
            key={option.value}
            value={option.value}
            ref={refFor(option, index)}
            data-checked={checked}
            aria-checked={checked}
            onSelect={() => {
              onPick(option);
            }}
          >
            <span className="flex min-w-0 flex-col">
              <bdi className="truncate">{option.label}</bdi>{' '}
              {option.meta === undefined ? null : (
                // Muted on the highlighted row's muted fill fails AA, so the line darkens there.
                <span className="text-muted-foreground group-data-selected/command-item:text-foreground truncate text-xs">
                  {option.meta}
                </span>
              )}
            </span>
          </CommandItem>
        );
      })}
      {showMore === undefined ? null : (
        <CommandItem
          value={SHOW_MORE}
          forceMount
          // Keeps the search box focused when clicked, so the arrow keys go on from the new rows.
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onSelect={showMore}
        >
          {loadingMore ? t('loading') : t('show_more_results')}
        </CommandItem>
      )}
    </>
  );
}

/**
 * K7: a picker over a server list too long to load at once (the item picker, D-30; UI-SPEC § Item
 * picker). It composes `SearchPopover` with cmdk's own filtering off: the box is controlled and the
 * request is keyed on the SETTLED text (300 ms, `CLIENT_TIMINGS.list.searchDebounceMs`; Enter
 * settles at once), and nothing is requested until the popover opens. Pages of 25 through
 * `useListPages`; "Show more results" is the last option (an option, so the arrow keys reach it and
 * the listbox holds only options) and, once the next page arrives, the first new row is highlighted
 * from a ref callback. The answer is shown in order: three 36px skeleton rows while the first answer
 * is unknown, the kit error with Retry (retryable failures) after a failure, "No items match" only
 * after an empty answer (D-39).
 *
 * Scanner friendly: with `exactMatch`, Enter on a code that equals exactly one row picks that row
 * (single: and closes; multiple: adds it and clears the box). Enter before the typed text's page has
 * arrived settles the text and the pick happens when that page renders (from the matched row's ref
 * callback), so a scanner's fast "digits then Enter" works.
 *
 * The trigger shows the picked label (in `<bdi>`, codes read left to right in Arabic) with the
 * `inactiveLabel` badge when that option is inactive, or "{count} selected" with chips; labels come
 * from `selected` first, then the loaded rows. Every label is React text (T-4.2-49).
 */
export function AsyncSearchableSelect<Row>(props: AsyncSearchableSelectProps<Row>): ReactElement {
  const { id, multiple = false, value, onChange, showChips = true, disabled } = props;
  const t = useTranslations('common');
  const errorText = useErrorText();
  const picker = useAsyncPicker(props);
  const picked = picker.optionsFor(value);
  const count =
    multiple && value.length > 0 ? t('selected_count', { count: value.length }) : undefined;
  return (
    <div className="flex flex-col gap-1">
      <SearchPopover
        id={id}
        options={[]}
        disabled={disabled}
        invalid={props.invalid}
        describedBy={props.describedBy}
        placeholder={props.placeholder}
        searchPlaceholder={props.searchPlaceholder}
        contentClassName="md:min-w-96"
        open={picker.open}
        onOpenChange={picker.onOpenChange}
        summary={triggerSummary(picked, count, props.inactiveLabel)}
        // The rows are the footer's (two lines, refs); the popover's own option list stays empty.
        isChecked={() => false}
        onPick={() => undefined}
        shouldFilter={false}
        search={picker.query}
        onSearchChange={picker.onSearchChange}
        onSearchKeyDown={picker.onSearchKeyDown}
        activeValue={picker.active}
        onActiveValueChange={picker.setActive}
        emptyText={props.noMatchText(picker.q)}
        status={pickerStatus(picker.pages, t('loading'), errorText)}
        footer={
          <PickerRows
            options={picker.options}
            value={value}
            refFor={picker.refFor}
            onPick={(option) => {
              picker.pick(option, false);
            }}
            showMore={picker.showMore}
            loadingMore={picker.pages.isLoadingMore}
          />
        }
      />
      {multiple && showChips ? (
        <PickedChips
          picked={picked}
          disabled={disabled}
          onRemove={(removed) => {
            const next = value.filter((kept) => kept !== removed);
            onChange(next, picker.optionsFor(next));
          }}
        />
      ) : null}
    </div>
  );
}
