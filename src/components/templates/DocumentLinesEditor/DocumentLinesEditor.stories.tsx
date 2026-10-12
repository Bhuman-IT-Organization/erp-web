import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState, type ReactElement } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { Input } from '@/components/ui/input';
import type { DraftValue } from '@/lib/hooks/use-editable-rows';
import { shellViewport } from '@/test/in-shell';
import {
  DocumentLinesEditor,
  type DocumentLine,
  type DocumentLinesColumn,
  type DocumentLinesEditorProps,
} from './DocumentLinesEditor';

// Made-up lines: invented codes, names and quantities; one Arabic name and one 200-character
// description (the long-text proof). Every literal is a story arg, as kit stories pass.
const LONG =
  'Stainless steel fastener kit with assorted bolts, nuts and washers, packed in a divided tray with a printed size chart on the lid, suitable for bench and field maintenance of light equipment.';

const COST_CENTERS = [
  { value: '1', label: 'Main office' },
  { value: '2', label: 'Branch office' },
];

const COLUMNS: readonly DocumentLinesColumn[] = [
  {
    id: 'item',
    label: 'Items',
    pin: 'start',
    read: (line) => (
      <span>
        <bdi>{String(line.values.code)}</bdi> {String(line.values.name)}
      </span>
    ),
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
      options: COST_CENTERS,
    },
    below: { id: 'notes', kind: 'text', label: 'Items Notes' },
    read: (line) => COST_CENTERS.find((w) => w.value === line.values.costCenter)?.label ?? '',
  },
  {
    id: 'quantity',
    label: 'Quantity',
    align: 'end',
    input: { id: 'quantity', kind: 'number', label: 'Quantity', required: true },
  },
  { id: 'lot', label: 'Lot number', input: { id: 'lot', kind: 'text', label: 'Lot number' } },
  {
    id: 'manufactured',
    label: 'Date Manufacture',
    input: { id: 'manufactured', kind: 'date', label: 'Date Manufacture' },
  },
  {
    id: 'expiry',
    label: 'Expiry Date',
    input: { id: 'expiry', kind: 'date', label: 'Expiry Date' },
  },
  {
    id: 'received',
    label: 'Received Qty',
    align: 'end',
    pin: 'end',
    input: { id: 'received', kind: 'number', label: 'Received Qty', required: true },
  },
];

const line = (n: number, name: string, description: string): DocumentLine => ({
  key: `l${String(n)}`,
  values: {
    code: `IT-${String(n).padStart(3, '0')}`,
    name,
    description,
    costCenter: String((n % 2) + 1),
    notes: n === 2 ? 'Top shelf' : '',
    quantity: String(n * 4),
    lot: n === 1 ? 'L-0007' : '',
    manufactured: '',
    expiry: n === 2 ? '2027-03-31' : '',
    received: String(n * 3),
  },
});

const LINES: readonly DocumentLine[] = [
  line(1, 'Pallet wrap', 'Clear stretch film, 500 mm'),
  line(2, 'مسامير فولاذية', LONG),
  line(3, 'Nitrile gloves', ''),
];

/** Fifteen columns: every line field of a document with all the settings on. */
const MANY: readonly DocumentLinesColumn[] = [
  { id: 'asset', label: 'Asset ID', read: () => <bdi>AS-0042</bdi> },
  ...COLUMNS.slice(0, 4),
  { id: 'unit', label: 'Unit price', align: 'end', read: () => '12.50' },
  { id: 'pending', label: 'Pending Qty', align: 'end', read: () => '3' },
  { id: 'tax', label: 'Tax', read: () => 'VAT 5%' },
  ...COLUMNS.slice(4, 5),
  {
    id: 'batch',
    label: 'Batch Number',
    input: { id: 'batch', kind: 'text', label: 'Batch Number' },
  },
  ...COLUMNS.slice(5, 7),
  { id: 'amount', label: 'Amount', align: 'end', read: () => '150.00' },
  { id: 'reference', label: 'Reference', read: () => 'No reference' },
  ...COLUMNS.slice(7),
];

const PICKER = (
  <Input
    aria-label="Scan or search an item"
    placeholder="Scan or search an item"
    className="max-w-sm"
  />
);

/** The owner a feature would be: lines in state, so typing, reordering and removing show. */
function Owner(
  props: Omit<DocumentLinesEditorProps, 'onChange' | 'onMove' | 'onRemove'>,
): ReactElement {
  const [lines, setLines] = useState(props.lines);
  const change = (index: number, field: string, value: DraftValue): void => {
    setLines((now) =>
      now?.map((l, i) => (i === index ? { ...l, values: { ...l.values, [field]: value } } : l)),
    );
  };
  const move = (from: number, to: number): void => {
    setLines((now) => {
      if (now === undefined) return now;
      const next = [...now];
      const [moved] = next.splice(from, 1);
      if (moved !== undefined) next.splice(to, 0, moved);
      return next;
    });
  };
  const remove = (index: number): void => {
    setLines((now) => now?.filter((_, i) => i !== index));
  };
  return (
    <DocumentLinesEditor
      {...props}
      lines={lines}
      onChange={change}
      onMove={move}
      onRemove={remove}
    />
  );
}

/** K14: the one lines grid of a document, edit and read modes (UI-SPEC § Lines editor). */
const meta = {
  title: 'Templates/DocumentLinesEditor',
  component: DocumentLinesEditor,
  args: {
    mode: 'edit',
    caption: 'Items',
    columns: COLUMNS,
    lines: LINES,
    picker: PICKER,
    emptyBody: 'Pick an item above, scan a barcode, or choose an estimate.',
  },
  render: (args) => <Owner {...args} />,
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DocumentLinesEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

const MOBILE = {
  parameters: {
    viewport: {
      options: { mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } } },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
} as const;
const AT_1024 = shellViewport(1024);

/** D-39: three skeleton rows, no empty text. */
export const Loading: Story = { args: { lines: undefined } };

/** No line yet: the heading and the feature's body inside the table body. */
export const Empty: Story = { args: { lines: [] } };

/** Edit mode: inputs, the picker row above, the line actions at the inline end. */
export const Loaded: Story = {};

/** Read mode (the detail page): read cells, no picker, no actions; an empty value reads "None". */
export const ReadOnly: Story = { args: { mode: 'read' } };

export const CellErrors: Story = {
  args: {
    errors: {
      l1: { quantity: 'Enter a quantity above zero.' },
      l2: {
        costCenter: 'Please select a cost center',
        received: "Received Qty can't be more than 8.",
      },
    },
  },
};

/** At 1024 the Items column (start) and Received Qty (end) stay in view while the frame scrolls. */
export const PinnedAt1024: Story = { ...AT_1024 };

export const ManyColumns: Story = { args: { columns: MANY }, ...AT_1024 };

/** Move line down from line 1's actions menu: the first line becomes the second. */
export const Reorder: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Actions for line 1' }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('menuitem', { name: 'Move line down' }));
    await expect(canvas.getByRole('combobox', { name: 'Line 2: Cost center' })).toBeInTheDocument();
    const rows = canvas.getAllByRole('row');
    await expect(rows[2]).toHaveTextContent('Pallet wrap');
  },
};

export const Totals: Story = {
  args: {
    mode: 'read',
    totals: [
      { term: 'Subtotal', value: '1,250.00' },
      { term: 'Total discount', value: '0.00' },
      { term: 'Total', value: '1,312.50' },
    ],
  },
};

/** At 375 only Received Qty and the actions stay pinned; the frame scrolls, the page does not. */
export const Mobile: Story = { ...MOBILE };

export const Rtl: Story = { globals: { locale: 'ar' } };
