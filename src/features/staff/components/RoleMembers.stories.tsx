import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RoleMembers } from './RoleMembers';

// Neutral fixture data only. The plays assert structure (rows, test ids, the table), never English
// text, so they pass under `ar` too.
const member = (staffId: number, firstName: string, lastName: string) => ({
  staffId,
  firstName,
  lastName,
  email: `m${String(staffId)}@example.invalid`,
  active: true,
});
const THREE = [
  member(4, 'Ada', 'Lovelace'),
  member(5, 'Alan', 'Turing'),
  member(6, 'Grace', 'Hopper'),
];
const TWENTY_THREE = [
  ...THREE,
  ...Array.from({ length: 20 }, (_, index) =>
    member(100 + index, 'Clerk', `Number ${String(index + 1)}`),
  ),
];

/** The role's holders in their own card (legacy `roles/role.php` `col-md-5` panel), at its 20rem. */
const meta = {
  title: 'Features/Staff/RoleMembers',
  component: RoleMembers,
  args: { members: THREE },
  parameters: { nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <div className="max-w-[20rem] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoleMembers>;

export default meta;
type Story = StoryObj<typeof meta>;

const rows = (root: HTMLElement) =>
  within(within(root).getByTestId('role-members')).getAllByRole('link');

/** The role is still loading: the card's skeleton under its real heading, no message (D-39). */
export const Loading: Story = { args: { members: undefined } };

/** Nobody holds the role: the plain sentence, no search and no table. */
export const Empty: Story = { args: { members: [] } };

/** Three holders: the count, the search and one "Full Name" column of links; no pager. */
export const Loaded: Story = {};

/** 23 holders: 10 per page with the kit Pager and no page-size picker. */
export const Paged: Story = {
  args: { members: TWENTY_THREE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(rows(canvasElement)).toHaveLength(10);
    await expect(canvas.getByTestId('pager-range')).toBeVisible();
    await expect(canvas.queryByRole('combobox')).toBeNull();
    const [previous, next] = canvas.getAllByRole('button');
    if (previous === undefined || next === undefined) throw new Error('no pager buttons');
    await userEvent.click(next);
    await expect(rows(canvasElement)).toHaveLength(10);
    await userEvent.click(next);
    await expect(rows(canvasElement)).toHaveLength(3);
    await userEvent.click(previous);
    await expect(rows(canvasElement)).toHaveLength(10);
    previous.blur();
  },
};

/** The search filters by name as it is typed: part of "Turing" leaves one row. */
export const Searching: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole('searchbox'), 'turi');
    await expect(rows(canvasElement)).toHaveLength(1);
  },
};

/** A search that matches nobody: "No matches" and no table. */
export const NoMatches: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('searchbox'), 'zzz');
    await expect(canvas.queryByTestId('role-members')).toBeNull();
  },
};

/** Arabic: the card mirrors; the pager's chevrons flip. */
export const Rtl: Story = { args: { members: TWENTY_THREE }, globals: { locale: 'ar' } };
