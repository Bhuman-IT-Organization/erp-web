import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  PermissionPicker,
  type PermissionModule,
  type PermissionPickerLabels,
  type PermissionPickerProps,
} from './PermissionPicker';

/** Neutral fixtures (FE-05), shaped like the staff feature's grouping of the catalogue. */
const CAPS = (
  feature: string,
  labels: Readonly<Record<string, string>>,
  actions: readonly string[],
) =>
  actions.map((action) => ({
    code: `${feature}.${action}`,
    action,
    label: labels[action] ?? action,
  }));

/** Each action's label, by action id, so a resource with fewer actions is labelled right. */
const EN_CAPS: Readonly<Record<string, string>> = {
  view: 'View',
  viewOwn: 'View (Own)',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
  assign: 'Assign',
};
const ACTIONS = ['view', 'viewOwn', 'create', 'edit', 'delete'];

const CATALOGUE: readonly PermissionModule[] = [
  {
    id: 'sales',
    label: 'Sales',
    features: [
      {
        id: 'sales.invoices',
        label: 'Invoices',
        capabilities: CAPS('sales.invoices', EN_CAPS, ACTIONS),
      },
      {
        id: 'sales.estimates',
        label: 'Estimates',
        capabilities: CAPS('sales.estimates', EN_CAPS, ACTIONS),
      },
      {
        id: 'sales.payments',
        label: 'Payments',
        capabilities: CAPS('sales.payments', EN_CAPS, ['view', 'create']),
      },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    features: [
      { id: 'stock.items', label: 'Items', capabilities: CAPS('stock.items', EN_CAPS, ACTIONS) },
      {
        id: 'stock.transfers',
        label: 'Transfers',
        capabilities: CAPS('stock.transfers', EN_CAPS, ['view', 'create']),
      },
    ],
  },
  {
    id: 'staff',
    label: 'Staff',
    features: [
      {
        id: 'staff.members',
        label: 'Staff members',
        capabilities: CAPS('staff.members', EN_CAPS, ['view', 'create', 'edit']),
      },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    features: [
      {
        id: 'reports.sales',
        label: 'Sales reports',
        capabilities: CAPS('reports.sales', EN_CAPS, ['view']),
      },
    ],
  },
];

const ROLE = [
  'sales.invoices.view',
  'sales.invoices.create',
  'sales.invoices.edit',
  'sales.estimates.view',
  'stock.items.view',
  'stock.items.create',
  'stock.transfers.view',
  'reports.sales.view',
];

const LABELS: PermissionPickerLabels = {
  summary: (count, modules) =>
    `Warehouse Supervisor grants ${String(count)} permissions in ${String(modules)} modules`,
  moduleCount: (granted, total) => `${String(granted)} of ${String(total)} granted`,
  customise: 'Customise these permissions',
  search: 'Search permissions',
  runningTotal: (count) => `${String(count)} permissions granted`,
  selectAllIn: (module) => `Select all in ${module}`,
  resetToRole: 'Reset to role',
  behindRole: (missing, extra) =>
    `Jane Doe is missing ${String(missing)} permissions the Warehouse Supervisor role grants${extra > 0 ? ` and has ${String(extra)} the role does not` : ''}.`,
  reapplyRole: 'Re-apply role',
  readOnlyNotice: 'Only an administrator can change roles and permissions.',
  featureColumn: 'Feature',
};

/**
 * A module whose resources carry different actions, given in scrambled order, with two beyond the
 * fixed five: the table puts each in its own column and leaves a cell empty where it does not apply.
 */
const HR: PermissionModule = {
  id: 'hr',
  label: 'HR',
  features: [
    {
      id: 'hr.leave',
      label: 'Leave',
      capabilities: CAPS('hr.leave', EN_CAPS, [
        'approve',
        'viewOwn',
        'delete',
        'view',
        'edit',
        'create',
      ]),
    },
    {
      id: 'hr.training',
      label: 'Training',
      capabilities: CAPS('hr.training', EN_CAPS, ['assign', 'view']),
    },
    {
      id: 'hr.payslipTemplate',
      label: 'Payslip template',
      capabilities: CAPS('hr.payslipTemplate', EN_CAPS, ['view', 'create', 'edit']),
    },
  ],
};
const HR_HEADERS = [
  'Feature',
  'View',
  'View (Own)',
  'Create',
  'Edit',
  'Delete',
  'Approve',
  'Assign',
];

const AR_CAPS: Readonly<Record<string, string>> = {
  view: 'عرض',
  viewOwn: 'عرض (الخاص)',
  create: 'إنشاء',
  edit: 'تعديل',
  delete: 'حذف',
};
const CATALOGUE_AR: readonly PermissionModule[] = [
  {
    id: 'sales',
    label: 'المبيعات',
    features: [
      {
        id: 'sales.invoices',
        label: 'الفواتير',
        capabilities: CAPS('sales.invoices', AR_CAPS, ACTIONS),
      },
      {
        id: 'sales.estimates',
        label: 'التقديرات',
        capabilities: CAPS('sales.estimates', AR_CAPS, ACTIONS),
      },
    ],
  },
  {
    id: 'stock',
    label: 'المخزون',
    features: [
      { id: 'stock.items', label: 'الأصناف', capabilities: CAPS('stock.items', AR_CAPS, ACTIONS) },
    ],
  },
];

const LABELS_AR: PermissionPickerLabels = {
  summary: (count, modules) =>
    `يمنح دور مشرف المستودع ${String(count)} صلاحية في ${String(modules)} وحدات`,
  moduleCount: (granted, total) => `${String(granted)} من ${String(total)} ممنوحة`,
  customise: 'تخصيص هذه الصلاحيات',
  search: 'البحث في الصلاحيات',
  runningTotal: (count) => `${String(count)} صلاحية ممنوحة`,
  selectAllIn: (module) => `تحديد الكل في ${module}`,
  resetToRole: 'إعادة إلى الدور',
  behindRole: (missing) => `ينقص جين دو ${String(missing)} من صلاحيات دور مشرف المستودع.`,
  reapplyRole: 'إعادة تطبيق الدور',
  featureColumn: 'الميزة',
};

/** A screen that owns the value, so a story can be clicked through. */
function Stateful(args: PermissionPickerProps) {
  const [value, setValue] = useState<readonly string[]>(args.value);
  return (
    <div className="max-w-5xl p-6">
      <PermissionPicker
        {...args}
        value={value}
        onChange={(codes) => {
          setValue(codes);
          args.onChange(codes);
        }}
      />
    </div>
  );
}

const meta = {
  title: 'Organisms/PermissionPicker',
  component: PermissionPicker,
  render: Stateful,
  args: {
    id: 'story-permissions',
    catalogue: CATALOGUE,
    value: ROLE,
    onChange: fn(),
    initialMode: 'summary',
    roleTemplate: ROLE,
    onReapplyRole: fn(),
    labels: LABELS,
  },
} satisfies Meta<typeof PermissionPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens a module by the label the fixture gives it, so a play runs the same under any locale. */
async function openModule(root: HTMLElement, label: string): Promise<void> {
  await userEvent.click(
    within(root).getByRole('button', { name: (name) => name.startsWith(label) }),
  );
}

/** Staff form, role-first: the summary line and the collapsed modules; Customise to edit. */
export const Summary: Story = {};

/** The editable accordion (the role form opens here): select-all beside each trigger. */
export const Edit: Story = {
  args: { initialMode: 'edit', value: ROLE.slice(1) },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Sales/ }));
  },
};

/** A search opens the modules it matches and hides the features it does not. */
export const Searching: Story = {
  args: { initialMode: 'edit' },
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole('searchbox'), 'items');
  },
};

/** The member holds 3 fewer permissions than the role grants today: the line and Re-apply. */
export const BehindRole: Story = {
  args: { value: ROLE.slice(0, 5) },
};

/**
 * A non-administrator (UAT 12): the refusal once, no granting control, and every permission still
 * reviewable — focusable, aria-readonly, full contrast. The play Tabs onto the first permission.
 */
export const ReadOnly: Story = {
  args: { initialMode: 'edit', readOnly: true },
  play: async ({ canvasElement }) => {
    await openModule(canvasElement, 'Sales');
    await userEvent.tab();
  },
};

/**
 * An opened module is a table in its own card (lead 2026-09-27): the actions in fixed columns View,
 * View (Own), Create, Edit, Delete, then the others; an empty cell where one does not apply; a
 * select-all per row. Where the card is narrower than @3xl each resource stacks with its labels.
 */
export const ModuleTable: Story = {
  args: {
    initialMode: 'edit',
    catalogue: [...CATALOGUE, HR],
    value: [...ROLE, 'hr.leave.view', 'hr.leave.approve', 'hr.training.view'],
  },
  play: async ({ canvasElement }) => {
    await openModule(canvasElement, 'Sales');
    await openModule(canvasElement, 'HR');
    const table = within(canvasElement).getByRole('table', { name: 'HR' });
    const headers = within(table).getAllByRole('columnheader', { hidden: true });
    await expect(headers.map((header) => header.textContent)).toEqual(HR_HEADERS);
  },
};

/** The staff form's collapsed role summary, a module opened: only what is granted, as text. */
export const SummaryOpen: Story = {
  args: { initialMode: 'summary' },
  play: async ({ canvasElement }) => {
    await openModule(canvasElement, 'Sales');
  },
};

export const Rtl: Story = {
  globals: { locale: 'ar' },
  args: {
    initialMode: 'edit',
    catalogue: CATALOGUE_AR,
    labels: LABELS_AR,
    value: ['sales.invoices.view', 'sales.invoices.create', 'stock.items.view'],
    roleTemplate: [
      'sales.invoices.view',
      'sales.invoices.create',
      'stock.items.view',
      'stock.items.create',
    ],
  },
  play: async ({ canvasElement }) => {
    await openModule(canvasElement, 'المبيعات');
  },
};
