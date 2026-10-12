import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Label } from '@/components/ui/label';
import { PasswordField } from './PasswordField';

const DEFAULT_LABEL = 'Password';
const ID = 'story-password';

/** The field's label, as `SchemaForm`'s `Field` renders it (plan 10); a fixture word, not a key. */
const withLabel: Decorator = function LabelDecorator(Story, { parameters }) {
  const text = typeof parameters.fieldLabel === 'string' ? parameters.fieldLabel : DEFAULT_LABEL;
  return (
    <div className="flex max-w-sm flex-col gap-1">
      <Label htmlFor={ID}>{text}</Label>
      <Story />
    </div>
  );
};

/** A password input with a named reveal button at the inline end (finding 9). */
const meta = {
  title: 'Molecules/PasswordField',
  component: PasswordField,
  decorators: [withLabel],
  args: { id: ID, defaultValue: 'correct horse' },
} satisfies Meta<typeof PasswordField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Masked; the button reads "Show password" and shows `eye`. */
export const Default: Story = {};

/** After the reveal: plain text, "Hide password", `eye-slash`, `aria-pressed="true"`. */
export const Revealed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const reveal = canvas.getByRole('button');
    await userEvent.click(reveal);
    await expect(reveal).toHaveAttribute('aria-pressed', 'true');
  },
};

export const Invalid: Story = { args: { 'aria-invalid': true, 'aria-required': true } };

export const Disabled: Story = { args: { disabled: true } };

/** The reveal button sits at the inline end, on the left in Arabic. */
export const Rtl: Story = {
  parameters: { fieldLabel: 'كلمة المرور' },
  globals: { locale: 'ar' },
};
