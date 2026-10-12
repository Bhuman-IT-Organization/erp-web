import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '@/components/ui/button';
import { EmptyState } from './EmptyState';

/**
 * An empty list (D-30). The kit receives already-translated copy from the feature, so the stories
 * pass fixture strings (the staff wording of UI-SPEC § Empty states).
 */
const meta = {
  title: 'Molecules/EmptyState',
  component: EmptyState,
  args: {
    heading: 'No staff members yet',
    body: 'Add the first staff member to give someone access.',
    action: <Button type="button">New Staff Member</Button>,
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The request returned zero rows with no search: the create button is the next step. */
export const NothingYet: Story = {};

/** The request returned zero rows for a search: Clear search is the next step. */
export const NoResults: Story = {
  args: {
    heading: 'No staff members match “zz”',
    body: 'Check the spelling or clear the search to see everyone.',
    action: (
      <Button type="button" variant="outline">
        Clear search
      </Button>
    ),
  },
};

export const Rtl: Story = { globals: { locale: 'ar' } };
