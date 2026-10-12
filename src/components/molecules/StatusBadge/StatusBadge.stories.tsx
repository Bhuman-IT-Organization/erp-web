import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatusBadge } from './StatusBadge';

/** A record's status: the fixed success pair for Active, the neutral badge for Inactive (D-06). */
const meta = {
  title: 'Molecules/StatusBadge',
  component: StatusBadge,
  args: { status: 'active', label: 'Active' },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};

export const Inactive: Story = { args: { status: 'inactive', label: 'Inactive' } };

/** K10: an alert ("Over budget"): outline, the icon and the word, never red. */
export const Alert: Story = { args: { status: 'alert', label: 'Over budget' } };

/** M1 (4.3 UI-SPEC § Color): Sent and Configured, the secondary fill with a 12px check before the word. */
export const Done: Story = { args: { status: 'done', label: 'Sent' } };

/** M1: Queued and Retrying, outline with a 12px clock before the word. */
export const Pending: Story = { args: { status: 'pending', label: 'Queued' } };

/** K20 (04.6): a rejected document, outline with a 12px circle-xmark, never red. */
export const Rejected: Story = { args: { status: 'rejected', label: 'Rejected' } };

/** K20: a returned document, the secondary fill with a 12px undo. */
export const Returned: Story = { args: { status: 'returned', label: 'Returned' } };

export const Rtl: Story = { globals: { locale: 'ar' } };

/** The two K20 statuses under ar: the icon stays at the inline start of the word. */
export const RtlRejectedReturned: Story = {
  globals: { locale: 'ar' },
  render: () => (
    <div className="flex gap-2">
      <StatusBadge status="rejected" label="Rejected" />
      <StatusBadge status="returned" label="Returned" />
    </div>
  ),
};

/** The two M1 statuses under ar: the icon stays at the inline start of the word. */
export const RtlDonePending: Story = {
  globals: { locale: 'ar' },
  render: () => (
    <div className="flex gap-2">
      <StatusBadge status="done" label="Sent" />
      <StatusBadge status="pending" label="Queued" />
    </div>
  ),
};
