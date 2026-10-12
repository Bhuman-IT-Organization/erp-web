import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { PermissionChanges } from './PermissionChanges';

const lines = (feature: string, capabilities: readonly string[]) =>
  capabilities.map((capability) => `${feature} · ${capability}`);

/** What a permission change does: removals open, additions behind "Show N added" (lead 2026-09-26). */
const meta = {
  title: 'Molecules/PermissionChanges',
  component: PermissionChanges,
  args: {
    id: 'story-changes',
    removed: lines('Warehouse · items', ['Delete']),
    added: [
      ...lines('Sales · invoices', ['View', 'Create', 'Edit']),
      ...lines('Sales · estimates', ['View', 'Create']),
    ],
  },
} satisfies Meta<typeof PermissionChanges>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both directions: the removal listed openly, the five additions collapsed. */
export const BothDirections: Story = {};

/** Only additions: no "Removed" block at all. */
export const OnlyAdditions: Story = { args: { removed: [] } };

/** Only removals: no disclosure at all. */
export const OnlyRemovals: Story = {
  args: { removed: lines('Warehouse · items', ['Delete', 'Edit']), added: [] },
};

/** The additions opened: the button reads "Hide added" and `aria-expanded` is true. */
export const AddedExpanded: Story = {
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Show 5 added' });
    await userEvent.click(button);
    await expect(button).toHaveAttribute('aria-expanded', 'true');
  },
};

/** A long removal list: the first 10, then "Show 4 more". */
const MANY_REMOVED = Array.from(
  { length: 14 },
  (_, i) => `Warehouse · r${String(i).padStart(2, '0')} · View`,
);

export const ManyRemovals: Story = { args: { removed: MANY_REMOVED, added: [] } };

/** The rest of a long removal list opened in place: "Show fewer". */
export const ManyRemovalsExpanded: Story = {
  args: { removed: MANY_REMOVED, added: [] },
  play: async ({ canvasElement }) => {
    const more = within(canvasElement).getByRole('button', { name: 'Show 4 more' });
    await userEvent.click(more);
    await expect(more).toHaveAttribute('aria-expanded', 'true');
  },
};

export const Rtl: Story = { globals: { locale: 'ar' } };
