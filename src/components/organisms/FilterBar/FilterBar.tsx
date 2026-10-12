'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { direction } from '@/i18n/direction';
import { toSupportedLocale } from '@/i18n/locales';
import { useFormat } from '@/lib/i18n/format';
import type { FilterValue } from '@/lib/url/use-query-state';

/** What a filter's control receives: its id, value, setter, trigger text and where it sits. */
export interface FilterControlProps {
  readonly id: string;
  readonly value: FilterValue | undefined;
  readonly onChange: (next: FilterValue | null) => void;
  /** The label while at its default or empty, "{label} ({count})" while it holds a value. */
  readonly triggerText: string;
  /** The plain label, no count: a control that shows its value itself (a date box) reads this. */
  readonly label?: string;
  /** `inline`: a 192px trigger (or its content's width, `fit`) named by a visually hidden label; `sheet`: full width under a visible one. */
  readonly layout: 'inline' | 'sheet';
}

/** One filter of a list: its `ListFilterDef` key, its translated legacy label and its control. */
export interface FilterControl {
  readonly key: string;
  readonly label: string;
  /** In the first row at `md`+ (at most four); the others sit behind "More filters". */
  readonly inline?: boolean;
  /**
   * Opt-in (4.2 gap round): the inline slot takes its content's width (`w-auto max-w-full`, never under 192 px)
   * instead of the fixed 192 px, so a long label shows whole and the row wraps. The sheet layout is unchanged.
   */
  readonly fit?: 'content';
  readonly render: (props: FilterControlProps) => ReactNode;
}

/** The filter values and the list's answers about them; the owner (`ListPageTemplate`) writes the URL. */
export interface FilterBarProps {
  readonly controls: readonly FilterControl[];
  readonly values: Readonly<Record<string, FilterValue>>;
  readonly isDefault: (key: string) => boolean;
  readonly onChange: (key: string, next: FilterValue | null) => void;
  readonly onClear: () => void;
  /** The list's `meta.total`, for "Show {total} results". */
  readonly total: number | undefined;
}

/** UI-SPEC § Filter bar: the four most used filters inline, the rest behind "More filters". */
const INLINE_MAX = 4;

/** An array counts its items; a single value counts once. */
function countOf(value: FilterValue | undefined): number {
  if (value === undefined) return 0;
  if (typeof value === 'string') return value === '' ? 0 : 1;
  return value.length;
}

/** A key such as `currency[in]` made safe for an element id. */
const idPart = (key: string): string => key.replace(/[^a-zA-Z0-9]/g, '-');

/**
 * The list's filter bar (K2, UI-SPEC § Filter bar). Presentational: the owner passes the values,
 * whether each is at its default, and the URL writes (K1, `useListQueryState`).
 *
 * - **At `md` and up** a wrapping row (8px gap, items aligned to the bottom so a select lines up
 *   with a date box whose words sit above it) of at most four inline filters, each a 192px trigger
 *   named by a visually hidden `<label>` (a `fit: 'content'` filter takes its content's width, at
 *   least 192px), reading its label, or "{label} ({count})" while it holds a value (an emptied
 *   filter reads its label alone, though it is off its default); then
 *   "More filters" (outline, `filter` icon, `aria-expanded`), which toggles a second row with the
 *   rest and opens by itself when one of them is set (the toggle is not in the URL); then "Clear
 *   filters" (ghost) while any filter is off its default.
 * - **Below `md`** one outline "Filters" button, "Filters ({count})" while any is set, opening a
 *   `Sheet` (320px) from the inline end (the side follows the locale's direction, never a
 *   comparison with `'ar'`): "Clear filters" above every filter stacked under its visible label,
 *   and a primary "Show {total} results" that only closes it (filters apply as they change).
 * - The switch is CSS (`hidden md:flex` and `md:hidden`): no effect, no media-query hook. The
 *   sheet's controls mount only while it is open, so the ids never collide with the row's.
 */
export function FilterBar({
  controls,
  values,
  isDefault,
  onChange,
  onClear,
  total,
}: FilterBarProps): ReactElement {
  const t = useTranslations('common');
  const f = useFormat();
  const baseId = useId();
  const rtl = direction(toSupportedLocale(useLocale())) === 'rtl';
  // `null` until the member toggles it: then "opens by itself" follows the hidden filters.
  const [moreToggled, setMoreToggled] = useState<boolean | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const inline = controls.filter((control) => control.inline === true).slice(0, INLINE_MAX);
  const rest = controls.filter((control) => !inline.includes(control));
  const setCount = controls.filter((control) => !isDefault(control.key)).length;
  const moreOpen = moreToggled ?? rest.some((control) => !isDefault(control.key));
  const moreId = `${baseId}-more`;

  // An emptied filter WITH a default is written empty (K1) and is off its default, so "Clear
  // filters" still shows; its trigger reads the label alone, never "{label} (0)" (UAT 4.2 gap 4).
  const triggerText = (control: FilterControl): string => {
    const count = countOf(values[control.key]);
    return isDefault(control.key) || count === 0
      ? control.label
      : t('filter_count', { label: control.label, count });
  };
  const field = (control: FilterControl, layout: 'inline' | 'sheet'): ReactElement => {
    const id = `${baseId}-${layout}-${idPart(control.key)}`;
    const props: FilterControlProps = {
      id,
      value: values[control.key],
      onChange: (next) => {
        onChange(control.key, next);
      },
      triggerText: triggerText(control),
      label: control.label,
      layout,
    };
    return layout === 'inline' ? (
      <div
        key={control.key}
        data-filter-slot=""
        className={control.fit === 'content' ? 'w-auto max-w-full min-w-48' : 'w-48'}
      >
        <Label htmlFor={id} className="sr-only">
          {control.label}
        </Label>
        {control.render(props)}
      </div>
    ) : (
      <div key={control.key} data-filter-slot="" className="flex w-full flex-col gap-1">
        <Label htmlFor={id}>{control.label}</Label>
        {control.render(props)}
      </div>
    );
  };
  const clear =
    setCount === 0 ? null : (
      <Button type="button" variant="ghost" onClick={onClear}>
        {t('clear_filters')}
      </Button>
    );

  return (
    <div data-testid="filter-bar">
      <div data-testid="filter-bar-inline" className="hidden flex-col gap-2 md:flex">
        <div className="flex flex-wrap items-end gap-2">
          {inline.map((control) => field(control, 'inline'))}
          {rest.length === 0 ? null : (
            <Button
              type="button"
              variant="outline"
              aria-expanded={moreOpen}
              aria-controls={moreId}
              onClick={() => {
                setMoreToggled(!moreOpen);
              }}
            >
              <Icon name="filter" />
              {t('more_filters')}
            </Button>
          )}
          {clear}
        </div>
        {rest.length > 0 && moreOpen ? (
          <div id={moreId} className="flex flex-wrap items-end gap-2">
            {rest.map((control) => field(control, 'inline'))}
          </div>
        ) : null}
      </div>
      <div data-testid="filter-bar-mobile" className="md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="outline">
              <Icon name="filter" />
              {setCount === 0 ? t('filters') : t('filters_count', { count: setCount })}
            </Button>
          </SheetTrigger>
          <SheetContent
            side={rtl ? 'left' : 'right'}
            showCloseButton={false}
            aria-describedby={undefined}
            className="data-[side=left]:w-80 data-[side=right]:w-80"
          >
            <SheetHeader>
              <SheetTitle>{t('filters')}</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col items-start gap-4 overflow-y-auto px-4">
              {clear}
              {controls.map((control) => field(control, 'sheet'))}
            </div>
            {/* ponytail: no total (an older api) means no Show button; Escape and the overlay still close it. */}
            {total === undefined ? null : (
              <SheetFooter>
                <Button
                  type="button"
                  size="lg"
                  onClick={() => {
                    setSheetOpen(false);
                  }}
                >
                  {t('show_results', { total: f.number(total) })}
                </Button>
              </SheetFooter>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

/**
 * A filter that is one date (opt-in, plan 04.6-06: a list's "on or before" date such as Posting
 * Date): a native date input, 192 px like a select trigger. A date box has no placeholder to name
 * it, so inline its plain label shows above the box, never a "(1)" count since the box shows the
 * date itself (lead 2026-10-07; pair the control with
 * `fit: 'content'` so a long label widens the slot instead of wrapping); in the sheet the sheet's
 * own label names it. The visible words are aria-hidden: the slot's label names the box.
 */
export function DateFilterInput({
  id,
  value,
  onChange,
  triggerText,
  label,
  layout,
}: FilterControlProps): ReactElement {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      {layout === 'inline' ? (
        <span aria-hidden="true" className="text-sm leading-none font-medium whitespace-nowrap">
          {label ?? triggerText}
        </span>
      ) : null}
      <Input
        id={id}
        type="date"
        className="w-48"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => {
          onChange(event.target.value === '' ? null : event.target.value);
        }}
      />
    </span>
  );
}
