import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { Card } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FormSection } from './FormSection';

/** A section sits inside the form's card. */
const inCard: Decorator = function CardDecorator(Story) {
  return (
    <Card className="max-w-5xl gap-0 py-0">
      <Story />
    </Card>
  );
};

/** One named section of a form card; while its own data loads, a real heading over field blocks. */
const meta = {
  title: 'Organisms/FormSection',
  component: FormSection,
  decorators: [inCard],
  args: {
    id: 'story-section',
    title: 'Profile',
    children: (
      <Field>
        <FieldLabel htmlFor="story-section-first">First Name</FieldLabel>
        <Input id="story-section-first" autoComplete="off" />
      </Field>
    ),
  },
} satisfies Meta<typeof FormSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** D-35: this section's data (permissions, departments) has not arrived; the rest of the form is live. */
export const Loading: Story = { args: { title: 'Permissions', loading: { count: 4 } } };

export const Rtl: Story = {
  globals: { locale: 'ar' },
  args: {
    title: 'الملف الشخصي',
    children: (
      <Field>
        <FieldLabel htmlFor="story-section-first-ar">الاسم الأول</FieldLabel>
        <Input id="story-section-first-ar" autoComplete="off" />
      </Field>
    ),
  },
};
