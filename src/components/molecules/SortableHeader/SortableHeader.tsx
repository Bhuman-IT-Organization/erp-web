'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SortableHeaderProps {
  readonly label: string;
  /** The BE-19 sort field this column sorts by (`email` → `?sort=email` / `?sort=-email`). */
  readonly field: string;
  /** The list's current `sort` (the URL's), `null` for the api's default order. */
  readonly sort: string | null;
  readonly onSort: (next: string | null) => void;
  /**
   * Opt-in (plan 04.7-11): a long label wraps at its words instead of widening the column (a long
   * legacy header), so the columns after it stay in the frame; default one line.
   */
  readonly wrap?: boolean;
}

/** The `aria-sort` the column's `<th>` carries: this column ascending, descending, or not the sort. */
export function ariaSortFor(
  field: string,
  sort: string | null,
): 'ascending' | 'descending' | 'none' {
  if (sort === field) return 'ascending';
  if (sort === `-${field}`) return 'descending';
  return 'none';
}

const NEXT_SORT = {
  none: (field: string): string | null => field,
  ascending: (field: string): string | null => `-${field}`,
  descending: (): string | null => null,
} as const;

const ICON = { none: 'sort', ascending: 'arrow-up', descending: 'arrow-down' } as const;

/**
 * The button that fills a sortable column's `<th>` (D-18). A click cycles ascending → descending →
 * back to the default order; the list's URL carries BE-19 `?sort=field` / `?sort=-field`. The
 * template puts `aria-sort={ariaSortFor(field, sort)}` on the `<th>` itself.
 *
 * Only a column that is a keyset key gets one (D-41: Role and Last login have none, so they show no
 * sort indicator). Unsorted shows the muted `sort` glyph; the sorted column shows its arrow in the
 * foreground and its label at weight 600. The accessible name is "Sort by {column}", which contains
 * the visible label.
 */
export function SortableHeader({
  label,
  field,
  sort,
  onSort,
  wrap = false,
}: SortableHeaderProps): ReactElement {
  const t = useTranslations('common');
  const state = ariaSortFor(field, sort);
  const active = state !== 'none';
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={t('sort_by', { column: label })}
      className={cn(
        'h-8 gap-1 px-0 hover:bg-transparent',
        active ? 'font-semibold' : 'font-normal',
        wrap && 'h-auto min-h-8 py-1 text-start whitespace-normal',
      )}
      onClick={() => {
        onSort(NEXT_SORT[state](field));
      }}
    >
      {label}
      <Icon name={ICON[state]} className={active ? 'text-foreground' : 'text-muted-foreground'} />
    </Button>
  );
}
