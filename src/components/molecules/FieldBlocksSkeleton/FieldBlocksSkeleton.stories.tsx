import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FieldBlocksSkeleton } from './FieldBlocksSkeleton';

/** Labelled field blocks: a form section, or one field whose options are loading (D-39). */
const meta = {
  title: 'Molecules/FieldBlocksSkeleton',
  component: FieldBlocksSkeleton,
  args: { count: 1 },
} satisfies Meta<typeof FieldBlocksSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One field, e.g. a `ChoiceField` whose options are loading: it fills its cell. */
export const OneField: Story = {};

/** A section still loading: the blocks in the form's two-column grid. */
export const Section: Story = { args: { count: 4 } };

export const Rtl: Story = { args: { count: 4 }, globals: { locale: 'ar' } };
