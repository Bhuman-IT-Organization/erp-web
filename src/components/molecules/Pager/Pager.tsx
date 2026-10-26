'use client';

import { useTranslations } from 'next-intl';
import { useId, type ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ListPage } from '@/lib/api/use-common-api';
import { useFormat } from '@/lib/i18n/format';
import { LIST_PAGE_SIZES, type ListPageSize } from '@/lib/url/use-query-state';

export interface PagerProps {
  readonly meta: ListPage<unknown>['meta'];
  readonly rowsOnPage: number;
  /**
   * The page-size picker: shown only when BOTH are given. A list with a fixed page (a role's members,
   * 10 at a time) passes neither and gets the range and Previous / Next only.
   */
  readonly pageSize?: ListPageSize | undefined;
  readonly onPageSize?: ((size: ListPageSize) => void) | undefined;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}

const toPageSize = (value: string): ListPageSize | undefined =>
  LIST_PAGE_SIZES.find((size) => String(size) === value);

/**
 * The list's footer (D-17): "Showing 26–50 of 1,240", a 25 / 50 / 100 page-size picker, and
 * Previous / Next over BE-19 keyset cursors (no jump-to-page).
 *
 * "From" is the api's `meta.rangeStart` (the rank of the first row: a keyset cursor cannot derive
 * it, UI-SPEC choice 24), so the range survives a refresh. The line shows only when the api sent
 * both `total` and `rangeStart` and the page has rows — an older api or an empty page shows no
 * range rather than a wrong one. Numbers go through the customer's format (D-33) with Western
 * digits (D-34). Previous is disabled on the first page (`prevCursor` null), Next on the last.
 *
 * The page-size picker is optional: a list with a fixed page passes no `pageSize` / `onPageSize`.
 * The pager lays out by its own width (one row from the container size that fits it, stacked
 * below), so it reads the same in a list and in a narrow card.
 */
export function Pager({
  meta,
  rowsOnPage,
  pageSize,
  onPageSize,
  onPrevious,
  onNext,
}: PagerProps): ReactElement {
  const t = useTranslations('common');
  const f = useFormat();
  const labelId = useId();
  const { rangeStart, total } = meta;
  const currentPage =
    pageSize !== undefined && rangeStart !== undefined && rangeStart > 0
      ? Math.ceil(rangeStart / pageSize)
      : 1;
  const showRange =
    total !== undefined && rangeStart !== undefined && rangeStart > 0 && rowsOnPage > 0;
  return (
    <div className="@container">
      <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center @xl:justify-between">
        {showRange ? (
          <p data-testid="pager-range" className="text-muted-foreground text-xs tabular-nums">
            {t('showing_range', {
              from: f.number(rangeStart),
              to: f.number(rangeStart + rowsOnPage - 1),
              total: f.number(total),
            })}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 @xl:ms-auto">
          {pageSize !== undefined && onPageSize !== undefined ? (
            <>
              <span id={labelId} className="text-muted-foreground text-xs">
                {t('rows_per_page')}
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  const size = toPageSize(value);
                  if (size !== undefined) onPageSize(size);
                }}
              >
                <SelectTrigger aria-labelledby={labelId} className="tabular-nums">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIST_PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={meta.prevCursor === null}
            onClick={onPrevious}
          >
            <Icon name="chevron-left" className="rtl:rotate-180" />
            {t('previous')}
          </Button>

          <span aria-current="page" className="min-w-8 text-center text-sm tabular-nums">
            {f.number(currentPage)}
          </span>

          <Button
            type="button"
            variant="outline"
            disabled={meta.nextCursor === null}
            onClick={onNext}
          >
            {t('next')}
            <Icon name="chevron-right" className="rtl:rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  );
}
