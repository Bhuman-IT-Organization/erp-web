import type { TicketPriority } from '@/lib/hooks/useTicketPriorities';
export type SortOrder = 'latest' | 'asc' | 'desc';

const NEXT: Record<SortOrder, SortOrder> = { latest: 'asc', asc: 'desc', desc: 'latest' };

export const SORT_INDICATOR: Record<SortOrder, string> = { latest: '↕', asc: '▲', desc: '▼' };

const byName = (a: TicketPriority, b: TicketPriority): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

const SORTERS: Record<SortOrder, (a: TicketPriority, b: TicketPriority) => number> = {
  latest: (a, b) => b.id - a.id,
  asc: byName,
  desc: (a, b) => byName(b, a),
};

/**
 * Next sort order in the cycle: latest, A-Z, Z-A.
 */
export function nextSortOrder(order: SortOrder): SortOrder {
  return NEXT[order];
}

/**
 * Returns a sorted copy of the list.
 */
export function sortPriorities(list: TicketPriority[], order: SortOrder): TicketPriority[] {
  return [...list].sort(SORTERS[order]);
}
