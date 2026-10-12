// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, within } from '@/test/render';
import { PageSkeleton } from '../PageSkeleton';

const COMMON = commonEn.common;

describe('PageSkeleton', () => {
  it('list: is a busy status region with a visually hidden Loading…', () => {
    renderWithProviders(<PageSkeleton variant="list" />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(region.getAttribute('data-testid')).toBe('page-skeleton');
    const hidden = within(region).getByText(COMMON.loading);
    expect(hidden.className).toContain('sr-only');
  });

  it('list: caps the rows at 10 however large the page size', () => {
    renderWithProviders(<PageSkeleton variant="list" rows={25} />);
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(10);
  });

  it('list: draws fewer rows for a smaller page size', () => {
    renderWithProviders(<PageSkeleton variant="list" rows={3} />);
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(3);
  });

  it('list: hasImage adds a 40 px square to every row', () => {
    renderWithProviders(<PageSkeleton variant="list" rows={4} hasImage />);
    const squares = screen.getAllByTestId('skeleton-thumbnail');
    expect(squares).toHaveLength(4);
    expect(squares[0]?.className).toContain('size-10');
  });

  it('list: without hasImage there is no square', () => {
    renderWithProviders(<PageSkeleton variant="list" />);
    expect(screen.queryByTestId('skeleton-thumbnail')).toBeNull();
  });

  it('list: has the toolbar and the pager shapes', () => {
    renderWithProviders(<PageSkeleton variant="list" />);
    expect(screen.getByTestId('skeleton-toolbar')).not.toBeNull();
    expect(screen.getByTestId('skeleton-pager')).not.toBeNull();
    expect(screen.queryByTestId('skeleton-save-bar')).toBeNull();
  });

  it('list: filterRow draws a 32px row of four 192px bars under the toolbar at md+, one Filters bar below md', () => {
    renderWithProviders(<PageSkeleton variant="list" filterRow />);
    const row = screen.getByTestId('skeleton-filter-row');
    expect(row.previousElementSibling).toBe(screen.getByTestId('skeleton-toolbar'));
    const inline = row.querySelectorAll('.h-8.w-48');
    expect(inline).toHaveLength(4);
    expect(inline[0]?.parentElement?.className.split(' ')).toEqual(
      expect.arrayContaining(['hidden', 'md:flex']),
    );
    expect(
      row.querySelector('[data-testid="skeleton-filter-button"]')?.parentElement?.className,
    ).toContain('md:hidden');
  });

  it('list: filterTriggers (opt-in) draws that many 192px bars, the screen inline filters', () => {
    renderWithProviders(<PageSkeleton variant="list" filterRow filterTriggers={2} />);
    expect(screen.getByTestId('skeleton-filter-row').querySelectorAll('.h-8.w-48')).toHaveLength(2);
  });

  it('list: no filter row by default', () => {
    renderWithProviders(<PageSkeleton variant="list" />);
    expect(screen.queryByTestId('skeleton-filter-row')).toBeNull();
  });

  it('form: 6 labelled field blocks in a two-column grid and a 68 px save bar', () => {
    renderWithProviders(<PageSkeleton variant="form" />);
    const fields = screen.getAllByTestId('skeleton-field');
    expect(fields).toHaveLength(6);
    expect(fields[0]?.parentElement?.className).toContain('md:grid-cols-2');
    expect(screen.getByTestId('skeleton-save-bar').className).toContain('h-17');
    expect(screen.queryByTestId('skeleton-row')).toBeNull();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  });

  it('form: withBadge adds the badge shape right after the title bar', () => {
    renderWithProviders(<PageSkeleton variant="form" withBadge />);
    const badge = screen.getByTestId('skeleton-badge');
    expect(badge.previousElementSibling).toBe(screen.getByTestId('skeleton-title'));
  });

  it('form: no badge shape by default', () => {
    renderWithProviders(<PageSkeleton variant="form" />);
    expect(screen.queryByTestId('skeleton-badge')).toBeNull();
  });

  it('record (K13): a 24x256 title bar, a 20x64 badge, a 36px tab bar of one 96px bar per tab (default 2), then the form', () => {
    renderWithProviders(<PageSkeleton variant="record" />);
    expect(screen.getByTestId('skeleton-title').className).toContain('h-6 w-64');
    expect(screen.getByTestId('skeleton-badge').className).toContain('h-5 w-16');
    const tabs = screen.getByTestId('skeleton-tabs');
    expect(tabs.className).toContain('h-9');
    const bars = tabs.querySelectorAll('[data-testid="skeleton-tab"]');
    expect(bars).toHaveLength(2);
    expect(bars[0]?.className).toContain('w-24');
    expect(screen.getAllByTestId('skeleton-field').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('skeleton-row')).toBeNull();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  });

  it('record: tabs={5} draws five tab bars; recordBody="list" draws the list rows under them', () => {
    renderWithProviders(<PageSkeleton variant="record" tabs={5} recordBody="list" rows={4} />);
    expect(screen.getAllByTestId('skeleton-tab')).toHaveLength(5);
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(4);
    expect(screen.queryByTestId('skeleton-field')).toBeNull();
  });

  it('settings (K13): the title bar, one 36px tab row of 9 96px bars at every width (no nav column), and an 8-row compact table at the full width', () => {
    renderWithProviders(<PageSkeleton variant="settings" />);
    expect(screen.getByTestId('skeleton-title')).toBeTruthy();
    const nav = screen.getByTestId('skeleton-settings-nav');
    expect(nav.className.split(' ')).toEqual(
      expect.arrayContaining(['flex', 'h-9', 'overflow-hidden', 'border-b']),
    );
    expect(nav.className).not.toMatch(/md:|w-56/);
    const rows = nav.querySelectorAll('[data-testid="skeleton-nav-row"]');
    expect(rows).toHaveLength(9);
    expect(rows[0]?.className.split(' ')).toEqual(expect.arrayContaining(['h-4', 'w-24']));
    expect(screen.queryByTestId('skeleton-settings-nav-mobile')).toBeNull();
    // The table is the nav's sibling in the page's one column, not beside a column.
    expect(nav.nextElementSibling?.contains(screen.getAllByTestId('skeleton-row')[0] ?? null)).toBe(
      true,
    );
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(8);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  });

  it('settings: navRows sets the nav rows', () => {
    renderWithProviders(<PageSkeleton variant="settings" navRows={3} />);
    expect(screen.getAllByTestId('skeleton-nav-row')).toHaveLength(3);
  });

  it('takes the test id it is given', () => {
    renderWithProviders(<PageSkeleton variant="form" testId="permission-pending" />);
    expect(screen.getByTestId('permission-pending').dataset.variant).toBe('form');
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(
      <>
        <PageSkeleton variant="list" hasImage />
        <PageSkeleton variant="form" withBadge />
        <PageSkeleton variant="record" recordBody="list" />
        <PageSkeleton variant="settings" />
      </>,
      { locale: 'ar' },
    );
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
