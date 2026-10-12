// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen } from '@/test/render';
import { PrintView, type PrintViewProps } from '../PrintView';

const COMMON = en.common;
const HEADERS = ['Full Name', 'Email', 'Active'];
const ROWS = [
  ['Jane Doe', 'jane@example.com', 'Yes'],
  ['Omar Ali', 'omar@example.com', 'No'],
];

const renderView = (props: Partial<PrintViewProps> = {}, locale?: 'ar') => {
  const print = vi.fn();
  const onDone = vi.fn();
  const view = renderWithProviders(
    <PrintView
      title="Staff members"
      exportedAt="2026-10-01T08:00:00.000Z"
      headers={HEADERS}
      rows={ROWS}
      onDone={onDone}
      print={print}
      {...props}
    />,
    locale === undefined ? {} : { locale },
  );
  const root = document.body.querySelector<HTMLElement>('[data-print-view]');
  if (root === null) throw new Error('no print view');
  return { ...view, root, print, onDone };
};

describe('PrintView (D-08, D-28)', () => {
  it('portals a [data-print-view] child of document.body, hidden on screen and shown in print', () => {
    const { root, container } = renderView();
    expect(root.parentElement).toBe(document.body);
    expect(container.contains(root)).toBe(false);
    expect(root.className).toContain('hidden');
    expect(root.className).toContain('print:block');
  });

  it('the title as an h1, the date line through the user format, headers as th scope=col, one row per display row', () => {
    const { root } = renderView();
    expect(root.querySelector('h1')?.textContent).toBe('Staff members');
    // The default Perfex formats (Y-m-d, 24 h) in Asia/Dubai: 08:00Z is 12:00:00 there.
    expect(screen.getByTestId('print-view-date').textContent).toBe('2026-10-01 12:00:00');
    const headers = [...root.querySelectorAll('thead th')];
    expect(headers.map((th) => th.textContent)).toEqual(HEADERS);
    expect(headers.every((th) => th.getAttribute('scope') === 'col')).toBe(true);
    const rows = [...root.querySelectorAll('tbody tr')];
    expect(rows.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent))).toEqual(
      ROWS,
    );
  });

  it('equal widths at five columns or fewer, automatic above', () => {
    const { root, unmount } = renderView();
    expect(root.querySelector('table')?.className).toContain('table-fixed');
    unmount();
    const six = ['a', 'b', 'c', 'd', 'e', 'f'];
    const wide = renderView({ headers: six, rows: [six] });
    expect(wide.root.querySelector('table')?.className).not.toContain('table-fixed');
  });

  it('no rows: the header row, then print_no_rows in one cell spanning every column', () => {
    const { root } = renderView({ rows: [] });
    const cells = root.querySelectorAll('tbody td');
    expect(cells).toHaveLength(1);
    expect(cells[0]?.textContent).toBe(COMMON.print_no_rows);
    expect(cells[0]?.getAttribute('colspan')).toBe(String(HEADERS.length));
    expect(root.querySelectorAll('thead th')).toHaveLength(HEADERS.length);
  });

  it('a cell holding <script> is text: no element is added (T-4.1.1-21)', () => {
    const hostile = '<script>alert(1)</script><b>x</b>';
    const { root } = renderView({ rows: [[hostile, 'a@b.co', 'Yes']] });
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelector('tbody td')?.textContent).toBe(hostile);
  });

  it('without preview the injected print seam is called once; afterprint reports done', () => {
    const { print, onDone } = renderView();
    expect(print).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('afterprint'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('with preview it is shown on screen and never prints', () => {
    const { root, print } = renderView({ preview: true });
    expect(root.className).not.toContain('hidden');
    expect(print).not.toHaveBeenCalled();
  });

  it('under ar the table inherits RTL from <html dir> and carries no physical class', () => {
    const { root } = renderView({ preview: true }, 'ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(root.hasAttribute('dir')).toBe(false);
    expect(root.querySelector('[dir]')).toBeNull();
    expect(physicalClassesIn(root)).toEqual([]);
  });

  it('unmounting removes the portal', () => {
    const { unmount } = renderView();
    unmount();
    expect(document.body.querySelector('[data-print-view]')).toBeNull();
  });
});
