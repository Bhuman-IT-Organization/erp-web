import type { ReactElement, ReactNode } from 'react';
import { EmptyAsNone } from '@/components/molecules/EmptyAsNone';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** One term and its value; `full` spans both columns (a note). */
export interface RecordSummaryRow {
  /** Already translated. */
  readonly term: string;
  /** Text, a `<bdi>` code, a link or a badge; an empty text reads "None". */
  readonly value: ReactNode;
  readonly full?: boolean;
}

export interface RecordSummaryProps {
  /** `undefined` while the record loads: label and value bars, no text (D-39). */
  readonly rows: readonly RecordSummaryRow[] | undefined;
  /** How many bar pairs the skeleton draws; 8 by default. */
  readonly skeletonRows?: number;
}

const DEFAULT_SKELETON_ROWS = 8;
const LIST = 'grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2';
/** At md+ the label sits in a 160px track before its value, 4px apart; below md it sits above. */
const ITEM = 'grid min-w-0 grid-cols-1 gap-1 md:grid-cols-[10rem_minmax(0,1fr)]';

/**
 * K16 (04.6 UI-SPEC § Kit additions, § Detail tab, § Spacing Scale "Record summary"): a record's
 * read-only fields as a definition list. Two columns at `md`+ with a 24px column gap and a 16px row
 * gap, one below; each label 14/600, each value 14/400 through `EmptyAsNone`, so an empty value reads
 * "None". A molecule (FE-06): it imports only `ui/`, `lib/` and the `EmptyAsNone` molecule. Values
 * render as React children, never HTML (T-4.6-28). Replaces the hand-rolled `<dl>` in
 * `SentEmailDetail`, `ImportResult` and `ModuleDisabledState` when each is next touched.
 */
export function RecordSummary({
  rows,
  skeletonRows = DEFAULT_SKELETON_ROWS,
}: RecordSummaryProps): ReactElement {
  if (rows === undefined) {
    return (
      <div data-testid="record-summary-loading" aria-hidden="true" className={LIST}>
        {Array.from({ length: skeletonRows }, (_, index) => (
          <div key={index} className={ITEM}>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-40" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <dl className={LIST}>
      {rows.map((row, index) => (
        // Two rows may share a term (Perfex's two "Requester" fields), so the place keys it.
        <div
          key={`${String(index)}:${row.term}`}
          className={cn(ITEM, row.full === true && 'md:col-span-2')}
        >
          <dt className="text-sm font-semibold">{row.term}</dt>
          <dd className="min-w-0 text-sm wrap-anywhere">
            <EmptyAsNone value={row.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
