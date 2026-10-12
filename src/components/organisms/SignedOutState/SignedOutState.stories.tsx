import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SignedOutState } from './SignedOutState';

/**
 * What `withAuth` renders once the session is known to be absent (D-14). The Sign in link carries
 * the current path, so the story sets one through the Next navigation mock.
 */
const meta = {
  title: 'Organisms/SignedOutState',
  component: SignedOutState,
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/staff/12' } } },
} satisfies Meta<typeof SignedOutState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Rtl: Story = { globals: { locale: 'ar' } };
