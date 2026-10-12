import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState, type ReactElement } from 'react';
import { expect, fn, screen, userEvent, within } from 'storybook/test';
import { Label } from '@/components/ui/label';
import { SearchableMultiSelect, type SearchableMultiSelectProps } from './SearchableMultiSelect';

const DEFAULT_LABEL = 'Departments';
const ID = 'story-departments';

/** Neutral fixture options (FE-05); 8 of them, so this is the shape ChoiceField picks (> 6). */
const OPTIONS = [
  { value: '1', label: 'Accounts' },
  { value: '2', label: 'Customer Service' },
  { value: '3', label: 'Human Resources' },
  { value: '4', label: 'Purchasing' },
  { value: '5', label: 'Reception' },
  { value: '6', label: 'Sales' },
  { value: '7', label: 'Stores' },
  { value: '8', label: 'Warehouse' },
];

const OPTIONS_AR = [
  { value: '1', label: 'الحسابات' },
  { value: '2', label: 'خدمة العملاء' },
  { value: '3', label: 'الموارد البشرية' },
  { value: '4', label: 'المشتريات' },
  { value: '5', label: 'الاستقبال' },
  { value: '6', label: 'المبيعات' },
  { value: '7', label: 'المخازن' },
  { value: '8', label: 'المستودع' },
];

/** The field's `<label for>`, which names the combobox, as `ChoiceField` renders it. */
const withLabel: Decorator = function LabelDecorator(Story, { parameters }) {
  const text = typeof parameters.fieldLabel === 'string' ? parameters.fieldLabel : DEFAULT_LABEL;
  return (
    <div className="flex max-w-sm flex-col gap-1">
      <Label htmlFor={ID}>{text}</Label>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/SearchableMultiSelect',
  component: SearchableMultiSelect,
  decorators: [withLabel],
  args: { id: ID, value: [], onChange: fn(), options: OPTIONS },
} satisfies Meta<typeof SearchableMultiSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

/** "4 selected", and the picks as wrapping chips, each with "Remove {label}". */
export const WithChips: Story = { args: { value: ['1', '2', '3', '8'] } };

/** Opened: a check on every picked option; the popover stays open while picking. */
export const Open: Story = {
  args: { value: ['1', '8'] },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('combobox');
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  },
};

/** As a filter (K2): no chips under the trigger, which reads "{label} ({count})". */
export const NoChips: Story = {
  args: { value: ['1', '2', '3'], showChips: false, triggerText: 'Departments (3)' },
};

/** The chips wrap from the inline start, on the right in Arabic. */
export const Rtl: Story = {
  parameters: { fieldLabel: 'الأقسام' },
  args: { value: ['1', '2', '3', '8'], options: OPTIONS_AR },
  globals: { locale: 'ar' },
};

/** Tags (K9): a created option is added to the options and picked, as the tags field does. */
function CreatableHost(args: SearchableMultiSelectProps): ReactElement {
  const [options, setOptions] = useState(args.options);
  const [value, setValue] = useState<readonly string[]>(args.value);
  return (
    <SearchableMultiSelect
      {...args}
      options={options}
      value={value}
      onChange={setValue}
      creatable={{
        onCreate: (text) => {
          setOptions((before) => [...before, { value: text, label: text }]);
          setValue((before) => [...before, text]);
        },
      }}
    />
  );
}

/** Typed text no option matches: "Add “Blue”" is the last option; Enter adds it and clears the box. */
export const Creatable: Story = {
  args: {
    options: [
      { value: 'red', label: 'Red' },
      { value: 'green', label: 'Green' },
    ],
    value: ['red'],
  },
  parameters: { fieldLabel: 'Tags' },
  render: (args) => <CreatableHost {...args} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox'));
    await userEvent.type(screen.getByPlaceholderText('Search…'), 'Blue');
    await expect(screen.getByRole('option', { name: 'Add “Blue”' })).toBeInTheDocument();
  },
};

/** Arabic: the chips and the "Add" option mirror. */
export const CreatableRtl: Story = {
  args: {
    options: [
      { value: 'red', label: 'أحمر' },
      { value: 'green', label: 'أخضر' },
    ],
    value: ['red'],
  },
  parameters: { fieldLabel: 'الوسوم' },
  globals: { locale: 'ar' },
  render: (args) => <CreatableHost {...args} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox'));
    await userEvent.type(screen.getByPlaceholderText('Search…'), 'أزرق');
    await expect(screen.getByRole('option', { name: 'Add “أزرق”' })).toBeInTheDocument();
  },
};
