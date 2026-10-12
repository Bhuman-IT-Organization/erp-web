// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FORMAT_SETTINGS } from '@/lib/i18n/format';
import { FormatSettingsProvider } from '@/lib/i18n/FormatSettingsProvider';
import type { ListPage } from '@/lib/api/use-common-api';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent, within } from '@/test/render';
import { Pager, type PagerProps } from '../Pager';

const COMMON = commonEn.common;
type Meta = ListPage<unknown>['meta'];
const MIDDLE: Meta = { rangeStart: 26, total: 1240, prevCursor: 'p', nextCursor: 'n' };

function renderPager(props: Partial<PagerProps> = {}, locale: 'en' | 'ar' = 'en') {
  const handlers = { onPageSize: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn() };
  const view = renderWithProviders(
    <Pager meta={MIDDLE} rowsOnPage={25} pageSize={25} {...handlers} {...props} />,
    { locale },
  );
  return { ...handlers, view };
}

const previous = () => screen.getByRole('button', { name: COMMON.previous });
const next = () => screen.getByRole('button', { name: COMMON.next });

describe('Pager (D-17, UI-SPEC § Paging)', () => {
  it('shows "Showing 26–50 of 1,240" from meta.rangeStart, the rows on the page and meta.total', () => {
    renderPager();
    expect(screen.getByTestId('pager-range').textContent).toBe('Showing 26–50 of 1,240');
  });

  it("formats the numbers in the customer's format: thousand separator '.' gives 1.240", () => {
    const handlers = { onPageSize: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn() };
    renderWithProviders(
      <FormatSettingsProvider
        settings={{ ...DEFAULT_FORMAT_SETTINGS, thousandSeparator: '.', decimalSeparator: ',' }}
      >
        <Pager
          meta={{ ...MIDDLE, rangeStart: 1001, total: 12400 }}
          rowsOnPage={100}
          pageSize={100}
          {...handlers}
        />
      </FormatSettingsProvider>,
    );
    expect(screen.getByTestId('pager-range').textContent).toBe('Showing 1.001–1.100 of 12.400');
  });

  it('without a total (an older api) there is no "Showing" line, and the buttons still work', async () => {
    const { onNext } = renderPager({ meta: { prevCursor: null, nextCursor: 'n' } });
    expect(screen.queryByTestId('pager-range')).toBeNull();
    await userEvent.click(next());
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('an empty page (rangeStart 0, reached through a stale cursor) shows no range', () => {
    renderPager({
      meta: { rangeStart: 0, total: 40, prevCursor: null, nextCursor: null },
      rowsOnPage: 0,
    });
    expect(screen.queryByTestId('pager-range')).toBeNull();
  });

  it('first page: Previous is disabled (prevCursor null); Next calls onNext', async () => {
    const { onNext, onPrevious } = renderPager({
      meta: { ...MIDDLE, rangeStart: 1, prevCursor: null },
    });
    expect(previous().hasAttribute('disabled')).toBe(true);
    expect(next().hasAttribute('disabled')).toBe(false);
    await userEvent.click(next());
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrevious).not.toHaveBeenCalled();
  });

  it('last page: Next is disabled (nextCursor null); Previous calls onPrevious', async () => {
    const { onPrevious } = renderPager({
      meta: { ...MIDDLE, rangeStart: 1226, nextCursor: null },
      rowsOnPage: 15,
    });
    expect(next().hasAttribute('disabled')).toBe(true);
    await userEvent.click(previous());
    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('pager-range').textContent).toBe('Showing 1,226–1,240 of 1,240');
  });

  it('the "Rows per page" select offers exactly 25, 50 and 100, and picking 50 calls onPageSize(50)', async () => {
    const { onPageSize } = renderPager();
    const trigger = screen.getByRole('combobox', { name: COMMON.rows_per_page });
    expect(trigger.textContent).toContain('25');
    await userEvent.click(trigger);
    const listbox = await screen.findByRole('listbox');
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['25', '50', '100']);
    await userEvent.click(within(listbox).getByRole('option', { name: '50' }));
    expect(onPageSize).toHaveBeenCalledTimes(1);
    expect(onPageSize).toHaveBeenCalledWith(50);
  });

  it('without onPageSize there is no "Rows per page" picker, and the range and Previous / Next still work', async () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    renderWithProviders(
      <Pager meta={MIDDLE} rowsOnPage={25} onPrevious={onPrevious} onNext={onNext} />,
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(COMMON.rows_per_page)).toBeNull();
    expect(screen.getByTestId('pager-range').textContent).toBe('Showing 26–50 of 1,240');
    await userEvent.click(previous());
    await userEvent.click(next());
    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('lays out by its own width, not the viewport: the range, the picker and the buttons share a row only from the container size that fits them on one line', () => {
    const { view } = renderPager();
    const root = view.container.firstElementChild;
    expect(root?.className.split(' ')).toContain('@container');
    const column = root?.firstElementChild?.className.split(' ') ?? [];
    expect(column).toContain('@xl:flex-row');
    expect(column).not.toContain('md:flex-row');
    const group = previous().parentElement?.className.split(' ') ?? [];
    expect(group).toContain('@xl:ms-auto');
    expect(group).not.toContain('md:ms-auto');
  });

  it('the chevrons flip in RTL (rtl:rotate-180)', () => {
    renderPager();
    for (const [button, icon] of [
      [previous(), 'chevron-left'],
      [next(), 'chevron-right'],
    ] as const) {
      const glyph = button.querySelector(`[data-icon-name="${icon}"]`);
      expect(glyph?.getAttribute('class')?.split(' ')).toContain('rtl:rotate-180');
    }
  });

  it('under ar: no physical-direction class, and the digits stay 0-9 (D-34)', () => {
    const { view } = renderPager({}, 'ar');
    expect(physicalClassesIn(view.container)).toEqual([]);
    expect(screen.getByTestId('pager-range').textContent).toMatch(/26.*50.*1,240/);
    expect(screen.getByTestId('pager-range').textContent).not.toMatch(/[٠-٩۰-۹]/);
  });
});
