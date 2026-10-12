'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { usePrint } from '@/lib/hooks/use-print';
import { useFormat } from '@/lib/i18n/format';
import { cn } from '@/lib/utils';

export interface PrintViewProps {
  /** The list's `<h1>` text, the same string sent to the api as `title`. */
  readonly title: string;
  /** The api's export moment (P6: the kit reads no clock). */
  readonly exportedAt: string;
  /** The translated column labels, in the exported order. */
  readonly headers: readonly string[];
  /** Display rows from the api: every cell already a string (D-25). */
  readonly rows: readonly (readonly string[])[];
  /** Called on `afterprint`, whether the user printed or cancelled. */
  readonly onDone: () => void;
  /** Stories only: rendered in place (no portal), shown on screen and never printed, so axe audits it. */
  readonly preview?: boolean;
  /** The print seam (FE-25): a story passes a no-op, a test a spy; defaults to `window.print`. */
  readonly print?: () => void;
}

/** At five columns or fewer every column takes an equal share, as the PDF does (D-14). */
const EQUAL_WIDTH_MAX_COLUMNS = 5;

/** `wrap-anywhere`: a long e-mail or number wraps inside its column instead of widening the table. */
const CELL = 'px-2 py-1 text-start align-top wrap-anywhere';

/** One display row. Its own component so the cell loop is not nested in the row loop (TS-12). */
function PrintRow({ cells }: { readonly cells: readonly string[] }): ReactElement {
  return (
    <tr className="border-border border-b">
      {cells.map((cell, index) => (
        // Display cells carry no id; the column position is the cell's identity.
        <td key={index} className={cn(CELL, 'whitespace-pre-line')}>
          {cell}
        </td>
      ))}
    </tr>
  );
}

/**
 * The print table (4.1.1 D-08, UI-SPEC § Print): a portal on `document.body` holding the title, the
 * export moment in the user's format and a plain semantic `<table>` of the rows the api answered,
 * hidden on screen and the only thing on paper (the `@media print` block in `app/globals.css`).
 * It opens the print dialog once through `usePrint` and reports back on `afterprint`, so the list,
 * its URL, scroll and selection never change.
 *
 * Every cell is React text, never `dangerouslySetInnerHTML` (T-4.1.1-21). No `dir` is set: the view
 * inherits `<html dir>`, so under Arabic the table reads right to left and the browser shapes the
 * text. A plain `<table>`, not the `ui/table` primitive, so its hover and overflow wrapper never
 * reach paper. With `preview` (stories) it renders in place instead of in the portal, so the story
 * root holds it and the a11y run audits it.
 */
export function PrintView({
  title,
  exportedAt,
  headers,
  rows,
  onDone,
  preview = false,
  print,
}: PrintViewProps): ReactElement {
  const t = useTranslations('common');
  const f = useFormat();
  usePrint(!preview, onDone, print);
  const equalWidths = headers.length <= EQUAL_WIDTH_MAX_COLUMNS;

  const view = (
    <div
      data-print-view=""
      className={cn('bg-background text-foreground', preview ? 'block' : 'hidden print:block')}
    >
      <div data-print-heading="" className="mb-4">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p data-testid="print-view-date" className="text-muted-foreground mt-1 text-xs">
          {f.dateTime(exportedAt)}
        </p>
      </div>
      <table className={cn('w-full border-collapse text-xs', equalWidths ? 'table-fixed' : null)}>
        <thead>
          <tr className="border-foreground border-b">
            {headers.map((header) => (
              <th key={header} scope="col" className={cn(CELL, 'font-semibold')}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(headers.length, 1)} className={CELL}>
                {t('print_no_rows')}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              // Display rows carry no id; the order is the api's answer.
              <PrintRow key={index} cells={row} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
  return preview ? view : createPortal(view, document.body);
}
