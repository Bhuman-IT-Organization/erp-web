import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from './SearchableSelect';

const DEFAULT_LABEL = 'Department';
const ID = 'story-department';

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
  title: 'Molecules/SearchableSelect',
  component: SearchableSelect,
  decorators: [withLabel],
  args: { id: ID, value: null, onChange: fn(), options: OPTIONS },
} satisfies Meta<typeof SearchableSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing chosen: "Nothing selected" in muted text. */
export const Empty: Story = {};

export const Selected: Story = { args: { value: '3' } };

/** Opened: the search box, the list, and a check on the current option. */
export const Open: Story = {
  args: { value: '3' },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('combobox');
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  },
};

/** A search that matches nothing: "No matches", shown only because the filter is empty. */
export const NoMatches: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox'));
    // Radix moves focus into the popover, onto the search box.
    await userEvent.keyboard('zzz');
  },
};

/**
 * The option list itself is empty: the caller's "none yet" hint and its create link replace
 * "No matches" (lead 2026-10-03); Tab from the search box reaches the link.
 */
export const EmptyWithHint: Story = {
  args: {
    options: [],
    emptyHint: {
      text: 'No cost centers yet.',
      action: { label: 'Create one in Cost Centers', href: '/setup/cost-centers/new' },
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox'));
    const body = within(canvasElement.ownerDocument.body);
    // The popover fades in: visible once its opening animation has run.
    await waitFor(async () => {
      await expect(body.getByText('No cost centers yet.')).toBeVisible();
    });
    await expect(body.getByRole('link', { name: 'Create one in Cost Centers' })).toHaveAttribute(
      'href',
      '/setup/cost-centers/new',
    );
  },
};

export const Disabled: Story = { args: { value: '3', disabled: true } };

/** As a filter (K2): the trigger reads the filter's text, "{label} ({count})" once set. */
export const TriggerText: Story = { args: { value: '3', triggerText: 'Department (1)' } };

/** Opt-in (04.8-16): each option with a caption line under its label, open (a batch picker's shape). */
export const WithDetail: Story = {
  args: {
    options: [
      { value: '41', label: 'Sample rate', detail: 'Valid to 2027-01-31 · 5 in use · 2.50' },
      { value: '42', label: 'Sample rate', detail: 'Valid to 2027-01-31 · 5 in use · 3.10' },
      { value: '43', label: 'No rate', detail: 'Valid to None · 12 in use · 2.50' },
    ],
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox'));
    const detail = await screen.findByText('Valid to None · 12 in use · 2.50');
    // It fades in: it mounts at opacity 0 (the a11y run, plan 04.7-27's rule).
    await waitFor(async () => {
      await expect(detail).toBeVisible();
    });
  },
};

export const Rtl: Story = {
  parameters: { fieldLabel: 'القسم' },
  args: { value: '3', options: OPTIONS_AR },
  globals: { locale: 'ar' },
};
