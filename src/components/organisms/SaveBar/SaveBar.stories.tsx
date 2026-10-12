import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SaveBar } from './SaveBar';

/** The form's sticky save bar; labels arrive translated (verb + noun), as a screen passes them. */
const meta = {
  title: 'Organisms/SaveBar',
  component: SaveBar,
  args: {
    formId: 'story-form',
    dirty: false,
    submitLabel: 'Save staff member',
    pendingLabel: 'Saving staff member…',
    isPending: false,
    onBack: fn(),
  },
} satisfies Meta<typeof SaveBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Clean: Story = {};

export const Dirty: Story = { args: { dirty: true } };

export const Pending: Story = { args: { dirty: true, isPending: true } };

export const ReadOnly: Story = { args: { readOnly: true } };

/** K11: an editable table's bar: the changed-row count and "Discard changes". */
export const CustomLabels: Story = {
  args: {
    dirty: true,
    countLabel: '3 rows changed',
    backLabel: 'Discard changes',
    submitLabel: 'Save units',
    pendingLabel: 'Saving units…',
  },
};

/** Opt-in (04.6-14): a two-submit form, the outline "Save draft" before the primary. */
export const WithSecondarySubmit: Story = {
  args: {
    dirty: true,
    submitLabel: 'Save & Send Request',
    pendingLabel: 'Saving expense…',
    secondarySubmit: { name: 'draft', label: 'Save draft', pendingLabel: 'Saving expense…' },
  },
};

/** The two submits under ar: the order mirrors, the secondary still first in reading order. */
export const WithSecondarySubmitRtl: Story = {
  globals: { locale: 'ar' },
  args: {
    dirty: true,
    submitLabel: 'Save & Send Request',
    pendingLabel: 'Saving expense…',
    secondarySubmit: { name: 'draft', label: 'Save draft', pendingLabel: 'Saving expense…' },
  },
};

export const Rtl: Story = {
  globals: { locale: 'ar' },
  args: { dirty: true, submitLabel: 'حفظ الموظف', pendingLabel: 'جارٍ حفظ الموظف…' },
};
