import type { ParamValue, Params } from '@/lib/api/keys';
import { filterParams, type FilterValue, type ListFilterDef } from '@/lib/url/use-query-state';

/** The log's Template filter: template keys, plus `status-test` for the status page's tests. */
export const TEMPLATE_FILTER = 'template[in]';
/** The log's Status filter: `queued`, `retrying`, `sent`, `failed`. */
export const STATUS_FILTER = 'status[in]';
/** From date and To date: the URL holds the day, `YYYY-MM-DD`. */
export const FROM_FILTER = 'queuedAt[gte]';
export const TO_FILTER = 'queuedAt[lte]';

/** The four filters of the sent-email log (04.3 UI-SPEC § Sent emails log), none with a default. */
export const SENT_EMAIL_FILTERS: readonly ListFilterDef[] = [
  { key: TEMPLATE_FILTER },
  { key: STATUS_FILTER },
  { key: FROM_FILTER },
  { key: TO_FILTER },
];

/** A native date input's value. */
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;
const LAST_HOUR = 23;
const LAST_MINUTE = 59;
const LAST_MS = 999;

/**
 * The start (or, with `end`, the last millisecond) of the member's own local day `YYYY-MM-DD`, as
 * an ISO instant; `null` for anything that is not a real day (`2026-13-40`, `2026-02-30`), which
 * `Date` would silently roll into another one.
 */
function localDayBound(value: FilterValue | undefined, end: boolean): string | null {
  if (typeof value !== 'string') return null;
  const match = DAY.exec(value);
  if (match === null) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const at = end
    ? new Date(year, month, day, LAST_HOUR, LAST_MINUTE, LAST_MINUTE, LAST_MS)
    : new Date(year, month, day, 0, 0, 0, 0);
  const real = at.getFullYear() === year && at.getMonth() === month && at.getDate() === day;
  return real ? at.toISOString() : null;
}

/**
 * The api's query for the log's filters. The URL keeps the dates as `YYYY-MM-DD` (a readable
 * permalink); the api gets the member's local day as ISO bounds (`Z`, so no raw `+` ever reaches
 * the query): From date at 00:00:00.000, To date at 23:59:59.999, both
 * inclusive. A malformed day is dropped, never sent. Template and Status pass through `filterParams`.
 */
export function sentEmailApiParams(filters: Readonly<Record<string, FilterValue>>): Params {
  const { [FROM_FILTER]: from, [TO_FILTER]: to, ...rest } = filters;
  const params: Record<string, ParamValue> = { ...filterParams(rest) };
  const start = localDayBound(from, false);
  const finish = localDayBound(to, true);
  if (start !== null) params['filter[queuedAt][gte]'] = start;
  if (finish !== null) params['filter[queuedAt][lte]'] = finish;
  return params;
}
