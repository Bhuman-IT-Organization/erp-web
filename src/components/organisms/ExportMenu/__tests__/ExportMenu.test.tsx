// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import { ExportMenu, type ExportMenuProps } from '../ExportMenu';

const COMMON = en.common;
const ITEM_IDS = ['list-export-csv', 'list-export-xlsx', 'list-export-pdf', 'list-export-print'];

const renderMenu = (props: Partial<ExportMenuProps> = {}, locale?: 'ar') => {
  const onSelect = vi.fn();
  const view = renderWithProviders(
    <ExportMenu
      count={42}
      selected={false}
      exportLimit={10_000}
      printLimit={1000}
      running={null}
      onSelect={onSelect}
      {...props}
    />,
    locale === undefined ? {} : { locale },
  );
  return { ...view, onSelect };
};

const open = async (): Promise<HTMLElement> => {
  await userEvent.click(screen.getByTestId('list-export'));
  return screen.findByRole('menu');
};

const itemIds = (menu: HTMLElement): string[] =>
  [...menu.querySelectorAll('[role="menuitem"]')].map((el) => el.getAttribute('data-testid') ?? '');

const description = (item: HTMLElement): string | null | undefined =>
  document.getElementById(item.getAttribute('aria-describedby') ?? '')?.textContent;

describe('ExportMenu (D-01, D-06, D-09)', () => {
  it('the trigger reads Export with the download and chevron icons, and opens the scope label then CSV, Excel, PDF, Print', async () => {
    renderMenu();
    const trigger = screen.getByTestId('list-export');
    expect(trigger.textContent).toBe(COMMON.dt_button_export);
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.querySelectorAll('svg')).toHaveLength(2);
    const menu = await open();
    expect(menu.firstElementChild?.getAttribute('data-testid')).toBe('list-export-scope');
    expect(itemIds(menu)).toEqual(ITEM_IDS);
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent)).toEqual([
      COMMON.dt_button_csv,
      COMMON.dt_button_excel,
      COMMON.dt_button_pdf,
      COMMON.dt_button_print,
    ]);
  });

  it('under ar (an rtl locale) PDF is not rendered; CSV, Excel and Print stay in order', async () => {
    const { container } = renderMenu({}, 'ar');
    const menu = await open();
    expect(itemIds(menu)).toEqual(['list-export-csv', 'list-export-xlsx', 'list-export-print']);
    expect(screen.queryByTestId('list-export-pdf')).toBeNull();
    expect(physicalClassesIn(container)).toEqual([]);
    expect(physicalClassesIn(menu)).toEqual([]);
  });

  it('the scope label: All {total} matching rows when nothing is ticked, {count} selected rows when rows are', async () => {
    const { unmount } = renderMenu({ count: 1240, selected: false });
    await open();
    expect(screen.getByTestId('list-export-scope').textContent).toBe('All 1,240 matching rows');
    unmount();
    renderMenu({ count: 3, selected: true });
    await open();
    expect(screen.getByTestId('list-export-scope').textContent).toBe('3 selected rows');
  });

  it('no scope label while the count is unknown (an older api without total)', async () => {
    renderMenu({ count: undefined });
    const menu = await open();
    expect(screen.queryByTestId('list-export-scope')).toBeNull();
    expect(itemIds(menu)).toEqual(ITEM_IDS);
  });

  it('choosing an enabled item calls onSelect with its format and closes the menu', async () => {
    const { onSelect } = renderMenu();
    await open();
    await userEvent.click(screen.getByTestId('list-export-xlsx'));
    expect(onSelect).toHaveBeenCalledWith('xlsx');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it.each([
    [10_000, false],
    [10_001, true],
  ])('CSV and Excel at %i rows (exportLimit 10,000): over the cap is %s', async (count, over) => {
    renderMenu({ count, printLimit: 100_000 });
    await open();
    for (const id of ['list-export-csv', 'list-export-xlsx']) {
      const item = screen.getByTestId(id);
      expect(item.getAttribute('aria-disabled') === 'true').toBe(over);
      expect(item.hasAttribute('data-over-limit')).toBe(over);
      expect(item.textContent.includes('Limited to 10,000 rows')).toBe(over);
    }
    expect(screen.getByTestId('list-export-pdf').hasAttribute('aria-disabled')).toBe(false);
  });

  it.each([
    [1000, false],
    [1001, true],
  ])('PDF and Print at %i rows (printLimit 1,000): over the cap is %s', async (count, over) => {
    renderMenu({ count });
    await open();
    for (const id of ['list-export-pdf', 'list-export-print']) {
      const item = screen.getByTestId(id);
      expect(item.getAttribute('aria-disabled') === 'true').toBe(over);
      expect(item.hasAttribute('data-over-limit')).toBe(over);
      expect(item.textContent.includes('Limited to 1,000 rows')).toBe(over);
    }
    expect(screen.getByTestId('list-export-csv').hasAttribute('aria-disabled')).toBe(false);
  });

  it('an over-cap item keeps keyboard focus, is described by the full sentence, sends nothing and leaves the menu open', async () => {
    const { onSelect } = renderMenu({ count: 12_000 });
    await open();
    const csv = screen.getByTestId('list-export-csv');
    expect(description(csv)).toBe(
      'Export is limited to 10,000 rows. This list has 12,000. Narrow the search or filter to export.',
    );
    const pdf = screen.getByTestId('list-export-pdf');
    expect(description(pdf)).toBe(
      'PDF is limited to 1,000 rows. This list has 12,000. Narrow the search or filter, or choose CSV or Excel.',
    );
    expect(description(screen.getByTestId('list-export-print'))).toBe(
      'Print is limited to 1,000 rows. This list has 12,000. Narrow the search or filter, or choose CSV or Excel.',
    );
    // Radix moves focus onto the item under the keyboard; a `disabled` item would be skipped.
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(csv);
    await userEvent.keyboard('{Enter}');
    await userEvent.click(pdf);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('absent limits (an older api) enable every item', async () => {
    renderMenu({ count: 50_000, exportLimit: undefined, printLimit: undefined });
    await open();
    for (const id of ITEM_IDS) {
      const item = screen.getByTestId(id);
      expect(item.hasAttribute('aria-disabled')).toBe(false);
      expect(item.hasAttribute('aria-describedby')).toBe(false);
    }
  });

  it('running: Exporting… for a file and Preparing print… for Print, on a disabled trigger', () => {
    const { unmount } = renderMenu({ running: 'export' });
    const trigger = screen.getByTestId('list-export');
    expect(trigger.textContent).toBe(COMMON.exporting);
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    unmount();
    renderMenu({ running: 'print' });
    const printing = screen.getByTestId('list-export');
    expect(printing.textContent).toBe(COMMON.preparing_print);
    expect((printing as HTMLButtonElement).disabled).toBe(true);
  });
});
