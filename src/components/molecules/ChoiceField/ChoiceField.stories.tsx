import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ChoiceField } from './ChoiceField';

/** Neutral fixture options (FE-05). */
const LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const CONTACT = [
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Phone' },
  { value: 'letter', label: 'Letter' },
  { value: 'none', label: 'No contact' },
];

const DEPARTMENTS = [
  { value: '1', label: 'Accounts' },
  { value: '2', label: 'Customer Service' },
  { value: '3', label: 'Human Resources' },
  { value: '4', label: 'Purchasing' },
  { value: '5', label: 'Reception' },
  { value: '6', label: 'Sales' },
  { value: '7', label: 'Stores' },
  { value: '8', label: 'Warehouse' },
];

const DAYS = [
  { value: 'mon', label: 'Monday' },
  { value: 'tue', label: 'Tuesday' },
  { value: 'wed', label: 'Wednesday' },
  { value: 'thu', label: 'Thursday' },
  { value: 'fri', label: 'Friday' },
];

const DEPARTMENTS_AR = [
  { value: '1', label: 'الحسابات' },
  { value: '2', label: 'خدمة العملاء' },
  { value: '3', label: 'الموارد البشرية' },
  { value: '4', label: 'المشتريات' },
  { value: '5', label: 'الاستقبال' },
  { value: '6', label: 'المبيعات' },
  { value: '7', label: 'المخازن' },
  { value: '8', label: 'المستودع' },
];

/** One form cell's width, as `FieldGrid` gives a field (plan 10). */
const inCell: Decorator = function CellDecorator(Story) {
  return (
    <div className="max-w-md">
      <Story />
    </div>
  );
};

/**
 * The kit picks the control from the option count (D-24): radios up to 6, a searchable select from
 * 7; checkboxes up to 6, a searchable multi-select with chips from 7; a skeleton while loading.
 */
const meta = {
  title: 'Molecules/ChoiceField',
  component: ChoiceField,
  decorators: [inCell],
  args: {
    id: 'story-choice',
    label: 'Priority',
    options: LEVELS,
    multiple: false,
    value: 'medium',
    onChange: fn(),
  },
} satisfies Meta<typeof ChoiceField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One of 3 short labels: radios on one row. */
export const RadioInline: Story = { args: { required: true } };

/** One of 4 (up to 6): radios stacked, 8 px apart. */
export const RadioStacked: Story = {
  args: { label: 'Preferred contact', options: CONTACT, value: 'phone' },
};

/** One of 8 (7 or more): a searchable select that allows exactly one. */
export const Searchable: Story = {
  args: { label: 'Department', options: DEPARTMENTS, value: '3', required: true },
};

/** Several of 5 (up to 6): a checkbox group in a fieldset with a legend. */
export const CheckboxGroup: Story = {
  args: {
    label: 'Working days',
    options: DAYS,
    multiple: true,
    value: ['mon', 'tue', 'wed'],
    onChange: fn(),
  },
};

/** Several of 8 (7 or more): a searchable multi-select, the picks as chips. */
export const MultiSearchable: Story = {
  args: {
    label: 'Departments',
    options: DEPARTMENTS,
    multiple: true,
    value: ['1', '8'],
    onChange: fn(),
  },
};

/** Options still loading: one labelled field block, never a control that flips later (D-39). */
export const Loading: Story = { args: { label: 'Department', options: undefined } };

/** Required and invalid: the red asterisk, `aria-required`, `aria-invalid` and the red outline. */
export const Invalid: Story = {
  args: {
    label: 'Preferred contact',
    options: CONTACT,
    value: null,
    required: true,
    invalid: true,
  },
};

/** Arabic: the legend, the radios and the chips mirror to the inline start on the right. */
export const Rtl: Story = {
  args: {
    label: 'الأقسام',
    options: DEPARTMENTS_AR,
    multiple: true,
    value: ['1', '2', '8'],
    onChange: fn(),
    required: true,
  },
  globals: { locale: 'ar' },
};
