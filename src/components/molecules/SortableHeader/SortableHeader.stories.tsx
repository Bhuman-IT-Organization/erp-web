import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ariaSortFor, SortableHeader } from './SortableHeader';

/** In a real header cell, with the `aria-sort` the list template puts on the `<th>`. */
const inHeaderCell: Decorator = (Story, { args }) => {
  const { field, sort } = args as { readonly field: string; readonly sort: string | null };
  return (
    <table className="w-80 border-collapse text-sm">
      <thead>
        <tr className="bg-muted h-10">
          <th className="px-4 text-start" aria-sort={ariaSortFor(field, sort)}>
            <Story />
          </th>
          <th className="px-4 text-start font-normal">Role</th>
        </tr>
      </thead>
    </table>
  );
};

/** A sortable column header (D-18): unsorted, ascending, descending; a click cycles them. */
const meta = {
  title: 'Molecules/SortableHeader',
  component: SortableHeader,
  decorators: [inHeaderCell],
  args: { label: 'Email', field: 'email', sort: null, onSort: fn() },
} satisfies Meta<typeof SortableHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unsorted: Story = {};

export const Ascending: Story = { args: { sort: 'email' } };

export const Descending: Story = { args: { sort: '-email' } };

/** Opt-in `wrap` (plan 04.7-11): a long legacy label wraps at its words in a narrow cell. */
export const Wrap: Story = {
  args: { label: 'Expense category reference code', field: 'code', wrap: true },
  decorators: [
    (Story) => (
      <div className="w-32">
        <Story />
      </div>
    ),
  ],
};

export const Rtl: Story = {
  args: { label: 'البريد الإلكتروني', sort: 'email' },
  globals: { locale: 'ar' },
};
