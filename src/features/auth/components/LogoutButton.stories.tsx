import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { ApiAdapter } from '@/lib/api/call-api';
import { LogoutButton } from './LogoutButton';

// The component's props are optional as a whole (`= {}`), which hides them from `typeof`.
type LogoutButtonProps = NonNullable<Parameters<typeof LogoutButton>[0]>;

// The `navigate` seam is a no-op: clicking in Storybook must never leave the page. Without an
// `adapter` the click would reach the (absent) api and fail closed; the seam swallows the exit.
const noopNavigate = (): void => undefined;

/** A transport that never answers: the automatic sign-out stays in its signing-out state. */
const pendingAdapter: ApiAdapter = () => new Promise(() => undefined);

const meta = {
  title: 'Features/Auth/LogoutButton',
  component: LogoutButton,
  args: { navigate: noopNavigate },
  decorators: [
    (Story) => (
      <div className="p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<LogoutButtonProps>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The sign-out button as `/logout` renders it. */
export const Default: Story = {};

/** The same under `ar`. */
export const Arabic: Story = {
  globals: { locale: 'ar' },
};

/** What Perfex's Logout link shows for the moment it takes to end both sessions (`auto`, D-39). */
export const SigningOut: Story = {
  args: { auto: true, adapter: pendingAdapter },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('logout-auto-pending')).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.queryByTestId('logout-button')).toBeNull();
  },
};
