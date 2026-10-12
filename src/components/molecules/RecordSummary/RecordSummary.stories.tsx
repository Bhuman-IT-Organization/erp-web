import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatusBadge } from '@/components/molecules/StatusBadge';
import { RecordSummary, type RecordSummaryRow } from './RecordSummary';

// Made-up values: one Arabic name and one 200-character note (the long-text proof).
const LONG_NOTE =
  'Delivered in two lots: the first pallet arrived sealed and counted, the second was opened at the gate for a spot check. All cartons were labelled, dated and stacked by the dock door for put-away.';

const ROWS: readonly RecordSummaryRow[] = [
  { term: 'Reference number', value: <bdi>DN-1001</bdi> },
  { term: 'Posting Date', value: <bdi>2026-10-05</bdi> },
  { term: 'Vendor Name', value: 'شركة الخليج للتوريدات' },
  { term: 'Status', value: <StatusBadge status="pending" label="Not yet approved" /> },
  { term: 'Requester', value: 'Sample Buyer' },
  { term: 'Requester', value: 'Sample Requester' },
  { term: 'Estimate', value: <bdi>EST-0012</bdi> },
  { term: 'Department', value: 'Stores' },
  { term: 'Note', value: LONG_NOTE, full: true },
];

/** K16: a record's read-only fields, two columns at md+, one below; empty values read "None". */
const meta = {
  title: 'Molecules/RecordSummary',
  component: RecordSummary,
  args: { rows: ROWS },
  decorators: [
    (Story) => (
      <div className="max-w-5xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RecordSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};

export const WithEmptyValues: Story = {
  args: {
    rows: [
      { term: 'Reference number', value: <bdi>DN-1001</bdi> },
      { term: 'Invoice number', value: '' },
      { term: 'Project', value: '' },
      { term: 'Note', value: '', full: true },
    ],
  },
};

/** D-39: label and value bars while the record loads, no text. */
export const Loading: Story = { args: { rows: undefined } };

export const Mobile: Story = {
  parameters: {
    viewport: {
      options: { mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } } },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

export const Rtl: Story = { globals: { locale: 'ar' } };
