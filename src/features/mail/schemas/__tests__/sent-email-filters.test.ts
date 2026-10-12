import { describe, expect, it } from 'vitest';
import {
  SENT_EMAIL_FILTERS,
  STATUS_FILTER,
  TEMPLATE_FILTER,
  FROM_FILTER,
  TO_FILTER,
  sentEmailApiParams,
} from '../sent-email-filters';

/**
 * The sent-email log's filters (04.3 UI-SPEC § Sent emails log): the URL keeps the days as
 * `YYYY-MM-DD` (a readable permalink); the api gets the member's own local day as ISO bounds
 * (a date filter is an ISO date-time with an offset).
 */
const startOf = (y: number, m: number, d: number): string =>
  new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
const endOf = (y: number, m: number, d: number): string =>
  new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();

describe('SENT_EMAIL_FILTERS', () => {
  it('declares the four filters of the log, in the order of the filter row', () => {
    expect(SENT_EMAIL_FILTERS.map((def) => def.key)).toEqual([
      'template[in]',
      'status[in]',
      'queuedAt[gte]',
      'queuedAt[lte]',
    ]);
    expect([TEMPLATE_FILTER, STATUS_FILTER, FROM_FILTER, TO_FILTER]).toEqual(
      SENT_EMAIL_FILTERS.map((def) => def.key),
    );
  });
});

describe('sentEmailApiParams', () => {
  it('turns the two URL days into the local day bounds and passes the status through', () => {
    expect(
      sentEmailApiParams({
        'queuedAt[gte]': '2026-10-01',
        'queuedAt[lte]': '2026-10-02',
        'status[in]': ['failed'],
      }),
    ).toEqual({
      'filter[queuedAt][gte]': startOf(2026, 10, 1),
      'filter[queuedAt][lte]': endOf(2026, 10, 2),
      'filter[status][in]': 'failed',
    });
  });

  it('a whole local day: the bounds lie one millisecond short of 24 hours apart', () => {
    const params = sentEmailApiParams({
      'queuedAt[gte]': '2026-10-03',
      'queuedAt[lte]': '2026-10-03',
    });
    const from = Date.parse(params['filter[queuedAt][gte]'] as string);
    const to = Date.parse(params['filter[queuedAt][lte]'] as string);
    expect(to - from).toBe(24 * 60 * 60 * 1000 - 1);
    expect(new Date(from).getHours()).toBe(0);
    expect(new Date(to).getHours()).toBe(23);
  });

  it('every bound carries an offset the api accepts and no raw "+" (ISO with Z)', () => {
    const params = sentEmailApiParams({ 'queuedAt[gte]': '2026-10-01' });
    expect(params['filter[queuedAt][gte]']).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('drops a malformed or impossible day: it is never sent', () => {
    expect(
      sentEmailApiParams({
        'queuedAt[gte]': '2026-13-40',
        'queuedAt[lte]': '2026-02-30',
      }),
    ).toEqual({});
    expect(sentEmailApiParams({ 'queuedAt[gte]': 'yesterday' })).toEqual({});
    expect(sentEmailApiParams({ 'queuedAt[lte]': ['2026-10-01'] })).toEqual({});
    expect(sentEmailApiParams({ 'queuedAt[gte]': '' })).toEqual({});
  });

  it('template keys and status-test pass through joined, as filterParams writes them', () => {
    expect(
      sentEmailApiParams({
        'template[in]': ['attendance_notice', 'status-test'],
        'status[in]': [],
      }),
    ).toEqual({ 'filter[template][in]': 'attendance_notice,status-test' });
  });

  it('no filter is no parameter', () => {
    expect(sentEmailApiParams({})).toEqual({});
  });
});
