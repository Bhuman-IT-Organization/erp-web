// @vitest-environment happy-dom
import { fireEvent } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DraftValue } from '@/lib/hooks/use-editable-rows';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent, within } from '@/test/render';
import {
  DocumentLinesEditor,
  type DocumentLine,
  type DocumentLinesColumn,
  type DocumentLinesEditorProps,
} from '../DocumentLinesEditor';

/**
 * K14 (04.6 UI-SPEC § Lines editor) over a synthetic document column set and three made-up
 * lines. One `it` per story (FE-27).
 */
const COMMON = commonEn.common;
const LONG =
  'Stainless steel fastener kit with assorted bolts, nuts and washers, packed in a divided tray with a printed size chart on the lid, suitable for bench and field maintenance of light equipment.';

const COLUMNS: readonly DocumentLinesColumn[] = [
  {
    id: 'item',
    label: 'Items',
    pin: 'start',
    read: (line) => `${String(line.values.code)} ${String(line.values.name)}`,
  },
  { id: 'description', label: 'Description' },
  {
    id: 'costCenter',
    label: 'Cost center',
    input: {
      id: 'costCenter',
      kind: 'choice',
      label: 'Cost center',
      required: true,
      options: [
        { value: '1', label: 'Main office' },
        { value: '2', label: 'Branch office' },
      ],
    },
    below: { id: 'notes', kind: 'text', label: 'Items Notes' },
  },
  {
    id: 'quantity',
    label: 'Quantity',
    align: 'end',
    input: { id: 'quantity', kind: 'number', label: 'Quantity', required: true },
  },
  {
    id: 'received',
    label: 'Received Qty',
    align: 'end',
    pin: 'end',
    input: { id: 'received', kind: 'number', label: 'Received Qty' },
  },
  { id: 'lot', label: 'Lot number', input: { id: 'lot', kind: 'text', label: 'Lot number' } },
  {
    id: 'expiry',
    label: 'Expiry Date',
    input: { id: 'expiry', kind: 'date', label: 'Expiry Date' },
  },
];

const LINES: readonly DocumentLine[] = [
  {
    key: 'a',
    values: {
      code: 'IT-01',
      name: 'Pallet wrap',
      description: '',
      costCenter: '1',
      notes: '',
      quantity: '4',
      received: '4',
      lot: 'L-7',
      expiry: '',
    },
  },
  {
    key: 'b',
    values: {
      code: 'IT-02',
      name: 'مسامير فولاذية',
      description: LONG,
      costCenter: '2',
      notes: 'Top shelf',
      quantity: '10',
      received: '6',
      lot: '',
      expiry: '2027-03-31',
    },
  },
  {
    key: 'c',
    values: {
      code: 'IT-03',
      name: 'Gloves',
      description: 'Nitrile',
      costCenter: '1',
      notes: '',
      quantity: '2',
      received: '2',
      lot: '',
      expiry: '',
    },
  },
];

const BASE: DocumentLinesEditorProps = {
  mode: 'edit',
  caption: 'Items',
  columns: COLUMNS,
  lines: LINES,
  emptyBody: 'Pick an item above, scan a barcode, or choose an estimate.',
};

function show(props: Partial<DocumentLinesEditorProps> = {}, locale: 'en' | 'ar' = 'en') {
  const handlers = { onChange: vi.fn(), onMove: vi.fn(), onRemove: vi.fn() };
  const view = renderWithProviders(<DocumentLinesEditor {...BASE} {...handlers} {...props} />, {
    locale,
  });
  return { ...handlers, ...view };
}

/** A stateful owner, so a typed value shows and Esc can restore it. */
function Owner(): ReactElement {
  const [lines, setLines] = useState(LINES);
  const change = (index: number, field: string, value: DraftValue): void => {
    setLines((now) =>
      now.map((line, i) =>
        i === index ? { ...line, values: { ...line.values, [field]: value } } : line,
      ),
    );
  };
  return <DocumentLinesEditor {...BASE} lines={lines} onChange={change} />;
}

const grid = () => screen.getByRole('table', { name: 'Items' });
const box = (name: string) => screen.getByRole('textbox', { name });
const bodyRows = () => within(grid()).getAllByRole('row').slice(1);
const bodyRow = (index: number): HTMLElement => {
  const row = bodyRows()[index];
  if (row === undefined) throw new Error(`no line ${String(index)}`);
  return row;
};

describe('DocumentLinesEditor: states (D-39)', () => {
  it('Loading: lines undefined draws three skeleton rows and no empty text', () => {
    const { container } = show({ lines: undefined });
    expect(bodyRows()).toHaveLength(3);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText(COMMON.lines_empty_heading)).toBeNull();
    expect(screen.queryByText(BASE.emptyBody)).toBeNull();
  });

  it('Empty: [] reads "No lines yet" and the body inside the table body', () => {
    show({ lines: [] });
    const body = grid().querySelector('tbody');
    expect(within(body as HTMLElement).getByText(COMMON.lines_empty_heading)).toBeTruthy();
    expect(within(body as HTMLElement).getByText(BASE.emptyBody)).toBeTruthy();
  });

  it('ReadOnly: the line number, read cells and "None" for an empty value; no input, no actions, no picker', () => {
    show({ mode: 'read', picker: <span>picker slot</span> });
    const first = bodyRow(0);
    const cells = within(first).getAllByRole('cell');
    expect(cells[0]?.textContent).toBe('1');
    expect(cells[1]?.textContent).toBe('IT-01 Pallet wrap');
    expect(cells[2]?.textContent).toBe(COMMON.none);
    expect(within(grid()).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(grid()).queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^Actions for line/ })).toBeNull();
    expect(screen.queryByText('picker slot')).toBeNull();
    // The number column's header is visually hidden.
    expect(within(grid()).getAllByRole('columnheader')[0]?.textContent).toBe(COMMON.line);
  });

  it('Frame: the scrolling frame is a named region in the tab order, so a read grid scrolls by keyboard (axe scrollable-region-focusable)', async () => {
    show({ mode: 'read' });
    const frame = screen.getByRole('region', {
      name: COMMON.lines_region.replace('{caption}', 'Items'),
    });
    expect(frame.contains(grid())).toBe(true);
    expect(frame.className.split(' ')).toContain('overflow-x-auto');
    await userEvent.tab();
    expect(document.activeElement).toBe(frame);
  });
});

describe('DocumentLinesEditor: edit mode (K14)', () => {
  it('Loaded: an input column is a CellInput named "Line 2: Quantity"; typing calls onChange(1, quantity, value); a column without input reads', () => {
    const { onChange } = show();
    const quantity = box('Line 2: Quantity');
    fireEvent.change(quantity, { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith(1, 'quantity', '5');
    const row = bodyRow(1);
    expect(within(row).getByText(LONG)).toBeTruthy();
    expect(within(row).getByText('IT-02 مسامير فولاذية')).toBeTruthy();
  });

  it('below: a second control stacked under the first in the same cell, both named', () => {
    show();
    const select = screen.getByRole('combobox', { name: 'Line 1: Cost center' });
    const notes = box('Line 1: Items Notes');
    expect(select.closest('td')).toBe(notes.closest('td'));
  });

  it('below: the stacked control shows its label as its placeholder (no header of its own, UAT 4.6); the first does not', () => {
    show();
    expect(box('Line 1: Items Notes').getAttribute('placeholder')).toBe('Items Notes');
    expect(box('Line 1: Quantity').getAttribute('placeholder')).toBeNull();
  });

  it('a text or choice control keeps a least width, so a wide grid never squeezes it to a sliver', () => {
    show();
    expect(
      box('Line 1: Lot number').closest('td')?.firstElementChild?.firstElementChild?.className,
    ).toContain('min-w-32');
    expect(
      screen.getByRole('combobox', { name: 'Line 1: Cost center' }).closest('td')?.firstElementChild
        ?.firstElementChild?.className,
    ).toContain('min-w-40');
  });

  it('a date input column is a native date input (K15)', () => {
    show();
    expect(screen.getByLabelText('Line 2: Expiry Date').getAttribute('type')).toBe('date');
  });

  it('the required star shows in the header in edit mode only', () => {
    const view = show();
    const header = within(grid()).getByRole('columnheader', { name: /Quantity/ });
    expect(header.textContent).toBe('Quantity*');
    view.unmount();
    show({ mode: 'read' });
    expect(within(grid()).getByRole('columnheader', { name: 'Quantity' }).textContent).toBe(
      'Quantity',
    );
  });

  it('Enter in a number input of line 1 focuses the same column on line 2; on the last line it does nothing', async () => {
    show();
    box('Line 1: Quantity').focus();
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(box('Line 2: Quantity'));
    box('Line 3: Received Qty').focus();
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(box('Line 3: Received Qty'));
  });

  it('Esc in an input restores the value held when it got focus', async () => {
    renderWithProviders(<Owner />);
    const lot = box('Line 1: Lot number');
    await userEvent.click(lot);
    await userEvent.type(lot, '9');
    expect(lot).toHaveProperty('value', 'L-79');
    await userEvent.keyboard('{Escape}');
    expect(box('Line 1: Lot number')).toHaveProperty('value', 'L-7');
  });

  it('RowActions: "Actions for line 1"; line 1 has no Move line up, the last no Move line down; Move down calls onMove(0, 1); Remove line is destructive and calls onRemove', async () => {
    const { onMove, onRemove } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for line 1' }));
    let menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: COMMON.move_line_up })).toBeNull();
    await userEvent.click(within(menu).getByRole('menuitem', { name: COMMON.move_line_down }));
    expect(onMove).toHaveBeenCalledWith(0, 1);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for line 3' }));
    menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: COMMON.move_line_up })).toBeTruthy();
    expect(within(menu).queryByRole('menuitem', { name: COMMON.move_line_down })).toBeNull();
    const remove = within(menu).getByRole('menuitem', { name: COMMON.remove_line });
    expect(remove.getAttribute('data-variant')).toBe('destructive');
    await userEvent.click(remove);
    expect(onRemove).toHaveBeenCalledWith(2);
  });

  it('CellErrors: the message under the input, aria-invalid and aria-describedby', () => {
    show({ errors: { b: { quantity: 'Enter a quantity above zero.' } } });
    const quantity = box('Line 2: Quantity');
    expect(quantity.getAttribute('aria-invalid')).toBe('true');
    const describedBy = quantity.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toBe('Enter a quantity above zero.');
    expect(box('Line 1: Quantity').getAttribute('aria-invalid')).toBe('false');
    // The message wraps in its cell rather than widening the column.
    expect(quantity.closest('td')?.firstElementChild?.firstElementChild?.className).toContain(
      'whitespace-normal',
    );
  });

  it('picker renders above the grid in edit mode; totals render a definition list at the inline end', () => {
    const { container } = show({
      picker: <span>picker slot</span>,
      totals: [
        { term: 'Subtotal', value: '120.00' },
        { term: 'Total', value: '126.00' },
      ],
    });
    const picker = screen.getByText('picker slot');
    expect(picker.compareDocumentPosition(grid()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const list = container.querySelector('[data-testid="lines-totals"]');
    expect(list?.tagName).toBe('DL');
    expect(list?.parentElement?.className).toContain('justify-end');
    expect([...(list?.querySelectorAll('dt') ?? [])].map((el) => el.textContent)).toEqual([
      'Subtotal',
      'Total',
    ]);
  });

  it('pins: the start column wraps a long item name inside it at every width (96px below md in edit beside the pinned actions, 160px in read; 240px from md), never clipping it', () => {
    const { unmount } = show({});
    const item = within(grid()).getByRole('columnheader', { name: 'Items' });
    expect(item.className.split(' ')).toEqual(
      expect.arrayContaining([
        'max-w-24',
        'md:max-w-60',
        'whitespace-normal',
        'wrap-anywhere',
        '*:max-w-full',
      ]),
    );
    unmount();
    show({ mode: 'read' });
    const read = within(grid()).getByRole('columnheader', { name: 'Items' });
    expect(read.className.split(' ')).toEqual(expect.arrayContaining(['max-w-40', 'md:max-w-60']));
  });

  it('pins: start is md:sticky at inset-inline-start 0, 240px; end pins sit after the 48px actions (3rem, then +7rem); the actions are sticky', () => {
    show({
      columns: COLUMNS.map((c) => (c.id === 'quantity' ? { ...c, pin: 'end' as const } : c)),
    });
    const item = within(grid()).getByRole('columnheader', { name: 'Items' });
    expect(item.className).toContain('md:sticky');
    expect(item.className).toContain('w-60');
    expect(item.style.insetInlineStart).toBe('0rem');
    const quantity = box('Line 1: Quantity').closest('td') as HTMLElement;
    const received = box('Line 1: Received Qty').closest('td') as HTMLElement;
    expect(received.className).toContain('sticky');
    expect(received.style.insetInlineEnd).toBe('3rem');
    expect(quantity.style.insetInlineEnd).toBe('10rem');
    const trigger = screen.getByRole('button', { name: 'Actions for line 1' });
    expect(trigger.closest('td')?.className).toContain('sticky-actions');
  });

  it('the pinned actions column holds exactly 48px (3rem), so no column peeks between it and an end pin (04.6-14 review)', () => {
    show({});
    const head = within(grid()).getAllByRole('columnheader').at(-1);
    expect(head?.className.split(' ')).toEqual(
      expect.arrayContaining(['w-12', 'min-w-12', 'max-w-12']),
    );
    const cell = box('Line 1: Quantity').closest('tr')?.lastElementChild;
    expect(cell?.className.split(' ')).toEqual(expect.arrayContaining(['min-w-12', 'max-w-12']));
  });

  it('read mode: end pins sit at the inline end itself (no actions column)', () => {
    show({ mode: 'read' });
    const header = within(grid()).getByRole('columnheader', { name: 'Received Qty' });
    expect(header.style.insetInlineEnd).toBe('0rem');
  });

  it('a value with markup renders as text, never HTML (T-4.6-28)', () => {
    const { container } = show({
      mode: 'read',
      lines: [{ key: 'x', values: { ...LINES[0]?.values, description: '<b>bold</b>' } }],
    });
    expect(container.querySelector('tbody b')).toBeNull();
    expect(screen.getByText('<b>bold</b>')).toBeTruthy();
  });

  it('Rtl: no physical-direction class under ar, edit, read, loading and empty', () => {
    for (const props of [{}, { mode: 'read' as const }, { lines: undefined }, { lines: [] }]) {
      const { container, unmount } = show(props, 'ar');
      expect(physicalClassesIn(container)).toEqual([]);
      unmount();
    }
  });
});
