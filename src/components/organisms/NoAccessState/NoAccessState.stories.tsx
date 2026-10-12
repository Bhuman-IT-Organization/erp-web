import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NoAccessState } from './NoAccessState';

/** What `withPermission` renders once `/me` has arrived and the page's gate is absent (D-14). */
const meta = {
  title: 'Organisms/NoAccessState',
  component: NoAccessState,
} satisfies Meta<typeof NoAccessState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Rtl: Story = { globals: { locale: 'ar' } };
