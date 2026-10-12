import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PrintView } from './PrintView';

/**
 * Every story renders with `preview` (shown on screen, never prints) and a no-op `print`, so no
 * story reaches a real `window.print()` and axe audits the table (FE-25).
 */
const meta = {
  title: 'Organisms/PrintView',
  component: PrintView,
  args: {
    title: 'Expense categories',
    exportedAt: '2026-10-01T08:00:00.000Z',
    headers: ['Name', 'Description', 'Expenses'],
    rows: [
      ['Travel', 'Flights and hotels', '12'],
      ['Office', 'Paper and toner', '3'],
      ['Training', '', '0'],
    ],
    onDone: () => undefined,
    preview: true,
    print: () => undefined,
  },
} satisfies Meta<typeof PrintView>;

export default meta;
type Story = StoryObj<typeof meta>;

const STAFF_HEADERS = ['#', 'Full Name', 'Email', 'Role', 'Last Login', 'Active', 'Phone'];

const STAFF_ROWS = [
  [
    '1',
    'Jane Doe',
    'jane.doe@example.com',
    'Accountant',
    '2026-09-30 17:05:42',
    'Yes',
    '+971 4 000 0001',
  ],
  ['2', 'Omar Ali', 'omar.ali@example.com', 'No role', 'Never', 'No', ''],
  [
    '3',
    'Lena Park',
    'lena.park@example.com',
    'Warehouse Supervisor',
    '2026-09-28 09:12:07',
    'Yes',
    '',
  ],
];

/** Three columns at equal widths, as the PDF draws five or fewer. */
export const FewColumns: Story = {};

/** Seven Staff-shaped columns at automatic widths, with "Yes"/"No" and "Never". */
export const ManyColumns: Story = {
  args: { title: 'Staff members', headers: STAFF_HEADERS, rows: STAFF_ROWS },
};

/** A description that keeps its line breaks and wraps a long word. */
export const LongText: Story = {
  args: {
    rows: [
      [
        'Travel',
        'Flights, hotels and ground transport.\nReceipts are required above the daily limit.\nAnAccountNumberWithoutSpacesThatMustWrapInsideItsCell0123456789',
        '12',
      ],
    ],
  },
};

/** No rows: the title, the date and the header row, then "There are no rows to print." */
export const NoRows: Story = { args: { rows: [] } };

/** Arabic: the table reads right to left from `<html dir>`; digits stay Latin. */
export const Rtl: Story = {
  globals: { locale: 'ar' },
  args: {
    title: 'Staff members',
    headers: ['Full Name', 'Email', 'Active'],
    rows: [
      ['\u0639\u0645\u0631 \u0639\u0644\u064a', 'omar.ali@example.com', 'Yes'],
      ['\u0644\u064a\u0646\u0627 \u062d\u0633\u0646', 'lena@example.com', 'No'],
    ],
  },
};

/** 375 px: the seven columns wrap inside the width; no horizontal overflow. */
export const Mobile: Story = {
  args: { title: 'Staff members', headers: STAFF_HEADERS, rows: STAFF_ROWS },
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};
