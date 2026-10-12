import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { LegacyLink } from '@/components/molecules/LegacyLink';
import { forgetLegacySession, openLegacySession } from '@/lib/auth/legacy-session';
import { LegacyLinkGuard } from './LegacyLinkGuard';

/** A handoff that never answers: the session stays "opening", so a held link stays held. */
const neverOpens = (): Promise<boolean> => new Promise(() => undefined);

const meta = {
  title: 'Features/Auth/LegacyLinkGuard',
  component: LegacyLinkGuard,
  // A fresh flight per story: one that never lands, as a slow Perfex right after a sign-in.
  beforeEach: () => {
    forgetLegacySession();
    void openLegacySession('story-access', neverOpens);
  },
  decorators: [
    (Story) => (
      <div className="bg-white p-8">
        <Story />
        <LegacyLink href="/admin/purchase/purchase_order">Purchase orders</LegacyLink>
      </div>
    ),
  ],
} satisfies Meta<typeof LegacyLinkGuard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Quick 261009-lgn: a Perfex link clicked while the background handoff is still pending is held,
 * busy (progress cursor, a pulse) until the shared flight lands; then the page goes to Perfex.
 */
export const WaitingLink: Story = {
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link');
    await userEvent.click(link);
    await expect(link).toHaveAttribute('aria-busy', 'true');
  },
};

/** The same under `ar`. */
export const WaitingLinkRtl: Story = {
  ...WaitingLink,
  globals: { locale: 'ar' },
};
