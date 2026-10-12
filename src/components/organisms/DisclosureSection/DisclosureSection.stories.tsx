import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { DisclosureSection } from './DisclosureSection';

function text(id: string, label: string, value = ''): ReactNode {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} autoComplete="off" defaultValue={value} />
    </Field>
  );
}

/** Rare fields behind one native disclosure, open whenever a field inside has a value or an error. */
const meta = {
  title: 'Organisms/DisclosureSection',
  component: DisclosureSection,
  args: {
    title: 'Social profiles',
    forceOpen: false,
    children: text('story-facebook', 'Facebook'),
  },
} satisfies Meta<typeof DisclosureSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

/** A field inside has a value (or an error): open, and a click on the summary cannot close it. */
export const ForcedOpen: Story = {
  args: { forceOpen: true, children: text('story-facebook-open', 'Facebook', 'example.page') },
};

export const Rtl: Story = {
  globals: { locale: 'ar' },
  args: { title: 'الملفات الاجتماعية', children: text('story-facebook-ar', 'فيسبوك') },
};
