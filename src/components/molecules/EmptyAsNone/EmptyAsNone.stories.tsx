import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EmptyAsNone } from './EmptyAsNone';

/** The kit's empty value: an empty text reads "None" in muted text; anything else as given. */
const meta = {
  title: 'Molecules/EmptyAsNone',
  component: EmptyAsNone,
  args: { value: '' },
} satisfies Meta<typeof EmptyAsNone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Value: Story = { args: { value: 'Main office' } };

export const Rtl: Story = { globals: { locale: 'ar' } };
