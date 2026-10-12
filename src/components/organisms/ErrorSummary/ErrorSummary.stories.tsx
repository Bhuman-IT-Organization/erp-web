import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ErrorSummary } from './ErrorSummary';

/** The summary at the top of a form after a failed submit: one link per failing field, by label. */
const meta = {
  title: 'Organisms/ErrorSummary',
  component: ErrorSummary,
  args: {
    onSelect: fn(),
    items: [
      { fieldId: 'member-firstName', label: 'First Name', message: 'This field is required.' },
      { fieldId: 'member-email', label: 'Email', message: 'Enter a valid e-mail address.' },
      { fieldId: 'member-roleId', label: 'Role', message: 'Choose a role.' },
    ],
  },
} satisfies Meta<typeof ErrorSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ThreeErrors: Story = {};

export const Rtl: Story = {
  globals: { locale: 'ar' },
  args: {
    items: [
      { fieldId: 'member-firstName', label: 'الاسم الأول', message: 'هذا الحقل مطلوب.' },
      { fieldId: 'member-email', label: 'البريد الإلكتروني', message: 'أدخل بريدًا صالحًا.' },
      { fieldId: 'member-roleId', label: 'الدور', message: 'اختر دورًا.' },
    ],
  },
};
