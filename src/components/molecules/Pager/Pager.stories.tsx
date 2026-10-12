import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { Pager } from './Pager';

/** The list's footer (D-17): the range with the total, the page size (optional), Previous and Next. */
const meta = {
  title: 'Molecules/Pager',
  component: Pager,
  args: {
    meta: { rangeStart: 26, total: 1240, prevCursor: 'p', nextCursor: 'n' },
    rowsOnPage: 25,
    pageSize: 25,
    onPageSize: fn(),
    onPrevious: fn(),
    onNext: fn(),
  },
} satisfies Meta<typeof Pager>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Previous is disabled: there is no page before this one. */
export const FirstPage: Story = {
  args: { meta: { rangeStart: 1, total: 1240, prevCursor: null, nextCursor: 'n' } },
};

export const MiddlePage: Story = {};

/** Next is disabled; the last page holds fewer rows than the page size. */
export const LastPage: Story = {
  args: {
    meta: { rangeStart: 1226, total: 1240, prevCursor: 'p', nextCursor: null },
    rowsOnPage: 15,
  },
};

/** An older api sends no total: no range line, the buttons still page. */
export const NoTotal: Story = { args: { meta: { prevCursor: 'p', nextCursor: 'n' } } };

export const Rtl: Story = { globals: { locale: 'ar' } };

/**
 * A fixed page (a role's members, 10 at a time): no page-size picker, only the range and
 * Previous / Next. The play proves the picker absent in the browser, not only by args.
 */
export const WithoutPageSize: StoryObj<typeof Pager> = {
  args: {
    meta: { rangeStart: 1, total: 1240, prevCursor: null, nextCursor: 'n' },
    pageSize: undefined,
    onPageSize: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('combobox')).toBeNull();
    await expect(canvas.getAllByRole('button')).toHaveLength(2);
    await expect(canvas.getByTestId('pager-range')).toBeVisible();
  },
};
