import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { RowActions } from './RowActions';

/** A list row's actions: labelled buttons at `md` and up, a named kebab menu below (ui-kit-decisions §2). */
const meta = {
  title: 'Molecules/RowActions',
  component: RowActions,
  args: {
    recordName: 'Jane Doe',
    actions: [
      {
        id: 'view',
        label: 'View',
        ariaLabel: 'View Jane Doe',
        icon: 'eye',
        kind: 'main',
        href: '/setup/staff/7',
      },
    ],
  },
} satisfies Meta<typeof RowActions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Staff: View only, the filled brand button (D-07). */
export const ViewOnly: Story = {};

/** Roles: Edit (main) and Delete, set apart after a separator in the fixed destructive red. */
export const EditAndDelete: Story = {
  args: {
    recordName: 'Warehouse Supervisor',
    actions: [
      {
        id: 'edit',
        label: 'Edit',
        ariaLabel: 'Edit Warehouse Supervisor',
        icon: 'pen-to-square',
        kind: 'main',
        href: '/setup/roles/4',
      },
      {
        id: 'delete',
        label: 'Delete',
        ariaLabel: 'Delete role Warehouse Supervisor',
        icon: 'trash-can',
        kind: 'destructive',
        onSelect: fn(),
      },
    ],
  },
};

/** Below `md`: one kebab named "Actions for …", opened here to show the menu. */
export const Mobile: Story = {
  args: { ...EditAndDelete.args },
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
  play: async ({ canvasElement }) => {
    const kebab = within(canvasElement).getByRole('button', {
      name: 'Actions for Warehouse Supervisor',
    });
    await userEvent.click(kebab);
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(async () => {
      await expect(
        body.getByRole('menuitem', { name: 'Delete role Warehouse Supervisor' }),
      ).toBeVisible();
    });
  },
};

export const Rtl: Story = {
  args: {
    recordName: 'مشرف المستودع',
    actions: [
      {
        id: 'edit',
        label: 'تعديل',
        ariaLabel: 'تعديل مشرف المستودع',
        icon: 'pen-to-square',
        kind: 'main',
        href: '/setup/roles/4',
      },
      {
        id: 'delete',
        label: 'حذف',
        ariaLabel: 'حذف الدور مشرف المستودع',
        icon: 'trash-can',
        kind: 'destructive',
        onSelect: fn(),
      },
    ],
  },
  globals: { locale: 'ar' },
};
