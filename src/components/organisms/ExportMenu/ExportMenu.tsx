'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId, type ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { direction } from '@/i18n/direction';
import { toSupportedLocale } from '@/i18n/locales';
import { useFormat } from '@/lib/i18n/format';

/** What the list can export (4.1.1 D-07): three files and Print. */
export type ExportFormat = 'csv' | 'xlsx' | 'pdf' | 'print';

export interface ExportMenuProps {
  /** The ticked count while rows are ticked, else the list's `meta.total`; unknown on an older api. */
  readonly count: number | undefined;
  /** True only while rows are ticked and "select all matching" is off (D-03). */
  readonly selected: boolean;
  /** `meta.exportLimit`, the cap of CSV and Excel; `undefined` shows no cap. */
  readonly exportLimit: number | undefined;
  /** `meta.printLimit`, the cap of PDF and Print; `undefined` shows no cap. */
  readonly printLimit: number | undefined;
  /** A format in flight: the trigger is disabled and says what is running. */
  readonly running: 'export' | 'print' | null;
  readonly onSelect: (format: ExportFormat) => void;
}

interface MenuItemSpec {
  readonly format: ExportFormat;
  readonly label: 'dt_button_csv' | 'dt_button_excel' | 'dt_button_pdf' | 'dt_button_print';
  /** Which cap the item answers to, and which sentence describes it when over. */
  readonly cap: 'export' | 'print';
}

/** Perfex's order (`app.js` DataTables buttons): CSV, Excel, PDF, Print. */
const ITEMS: readonly MenuItemSpec[] = [
  { format: 'csv', label: 'dt_button_csv', cap: 'export' },
  { format: 'xlsx', label: 'dt_button_excel', cap: 'export' },
  { format: 'pdf', label: 'dt_button_pdf', cap: 'print' },
  { format: 'print', label: 'dt_button_print', cap: 'print' },
];

const RUNNING_LABEL = { export: 'exporting', print: 'preparing_print' } as const;

interface OverCap {
  readonly item: MenuItemSpec;
  readonly limit: number;
  readonly count: number;
}

/**
 * The list's one Export menu (4.1.1 D-01, UI-SPEC § The Export menu): an outline trigger, then a
 * scope label and CSV, Excel, PDF and Print. Presentational: the owner (`ListPageTemplate`) runs the
 * format it is called back with.
 *
 * - **Caps told before the click** (D-06, lead decision 2b kept): an item whose cap the count
 *   exceeds stays focusable (`aria-disabled`, never `disabled`, which Radix skips), shows a visible
 *   "Limited to" caption, and is described by a sentence that is always in the DOM beside the
 *   trigger, outside the portalled menu; choosing it keeps the menu open and calls nothing. No
 *   tooltip: a touch user cannot open one, and the caption says the same on every device.
 * - **No PDF under a right-to-left locale** (D-09): decided by `direction(...)`, never by comparing
 *   with `'ar'`; Print covers Arabic.
 * - **Non-modal** (`modal={false}`): a modal menu aria-hides the page while its trigger stays
 *   focusable (axe `aria-hidden-focus`).
 */
export function ExportMenu({
  count,
  selected,
  exportLimit,
  printLimit,
  running,
  onSelect,
}: ExportMenuProps): ReactElement {
  const t = useTranslations('common');
  const f = useFormat();
  const hintId = useId();
  const rtl = direction(toSupportedLocale(useLocale())) === 'rtl';
  const items = rtl ? ITEMS.filter((item) => item.format !== 'pdf') : ITEMS;

  const overCap = (item: MenuItemSpec): OverCap | null => {
    const limit = item.cap === 'export' ? exportLimit : printLimit;
    if (count === undefined || limit === undefined || count <= limit) return null;
    return { item, limit, count };
  };
  const sentence = ({ item, limit, count: rows }: OverCap): string => {
    const numbers = { limitCount: limit, limit: f.number(limit), total: f.number(rows) };
    return item.cap === 'export'
      ? t('export_limited', numbers)
      : t('print_limited', { ...numbers, format: t(item.label) });
  };
  const scope = (rows: number): string =>
    selected
      ? t('export_scope_selected', { count: rows, countText: f.number(rows) })
      : t('export_scope_all', { totalCount: rows, total: f.number(rows) });
  const over = items.map(overCap).filter((entry) => entry !== null);

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="lg"
            data-testid="list-export"
            disabled={running !== null}
          >
            <Icon name="download" />
            {running === null ? t('dt_button_export') : t(RUNNING_LABEL[running])}
            <Icon name="chevron-down" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {count === undefined ? null : (
            <DropdownMenuLabel data-testid="list-export-scope" className="text-xs font-normal">
              {scope(count)}
            </DropdownMenuLabel>
          )}
          {items.map((item) => {
            const capped = overCap(item);
            return (
              <DropdownMenuItem
                key={item.format}
                data-testid={`list-export-${item.format}`}
                {...(capped === null
                  ? {}
                  : {
                      'aria-disabled': true,
                      'data-over-limit': '',
                      'aria-describedby': `${hintId}-${item.format}`,
                      className: 'flex-col items-start gap-1 text-muted-foreground',
                    })}
                onSelect={(event) => {
                  if (capped !== null) {
                    event.preventDefault();
                    return;
                  }
                  onSelect(item.format);
                }}
              >
                <span>{t(item.label)}</span>
                {capped === null ? null : (
                  <span aria-hidden="true" className="text-xs text-muted-foreground">
                    {t('export_item_limited', {
                      limitCount: capped.limit,
                      limit: f.number(capped.limit),
                    })}
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {over.map((entry) => (
        <span key={entry.item.format} id={`${hintId}-${entry.item.format}`} className="sr-only">
          {sentence(entry)}
        </span>
      ))}
    </>
  );
}
