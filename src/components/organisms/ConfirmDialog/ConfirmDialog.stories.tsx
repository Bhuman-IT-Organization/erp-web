import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ConfirmDialog, type ConfirmOutcome } from './ConfirmDialog';

/** Neutral fixtures (FE-05). Feature words arrive as strings, exactly as a screen passes them. */
const STAFF_ERRORS = { namespace: 'staff', codes: ['ERP-IDENTITY-0006'] } as const;
const REFUSED: ConfirmOutcome = { ok: false, code: 'ERP-IDENTITY-0006', retryAfterS: null };
const NETWORK: ConfirmOutcome = { ok: false, code: 'ERP-NETWORK-0001', retryAfterS: null };

/** The dialog portals to `<body>`, outside the story canvas. */
const page = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

/** Radix disables pointer events on <body> while the modal mounts: click once the dialog takes input. */
async function clickWhenReady(element: HTMLElement): Promise<void> {
  await waitFor(async () => {
    await expect(getComputedStyle(element).pointerEvents).not.toBe('none');
  });
  await userEvent.click(element);
}

const meta = {
  title: 'Organisms/ConfirmDialog',
  component: ConfirmDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    kind: 'destructive',
    title: 'Delete role Warehouse Supervisor?',
    body: 'This cannot be undone.',
    dismissLabel: 'Keep role',
    confirmLabel: 'Delete role',
    pendingLabel: 'Deleting role…',
    onConfirm: fn((): Promise<ConfirmOutcome> | ConfirmOutcome => ({ ok: true })),
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Kind 1: destructive red with the trash-can icon; focus on "Keep role". */
export const Delete: Story = {};

/** UAT 7: the 409 renders inside the dialog, Confirm is disabled, "Keep role" is the way out. */
export const DeleteRefused: Story = {
  args: { onConfirm: fn((): ConfirmOutcome => REFUSED), featureErrors: STAFF_ERRORS },
  play: async ({ canvasElement }) => {
    const body = page(canvasElement);
    await clickWhenReady(body.getByTestId('confirm-dialog-confirm'));
    // The dialog fades in over 100 ms; a synchronous answer can land while it is still translucent.
    await waitFor(async () => {
      await expect(body.getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(body.getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

/**
 * A refusal the screen words itself (`refusal`, opt-in 04.8-18): its own block (K25 with an action)
 * in place of the plain message, Confirm disabled.
 */
export const DeleteRefusedOwnWords: Story = {
  args: {
    onConfirm: fn((): ConfirmOutcome => REFUSED),
    featureErrors: STAFF_ERRORS,
    refusal: () => (
      <p role="alert" className="text-destructive text-sm">
        This role is still held by 2 staff members. Move them to another role first.
      </p>
    ),
  },
  play: async ({ canvasElement }) => {
    const body = page(canvasElement);
    await clickWhenReady(body.getByTestId('confirm-dialog-confirm'));
    await waitFor(async () => {
      await expect(body.getByText(/still held by 2 staff members/)).toBeVisible();
    });
    await expect(body.queryByTestId('confirm-dialog-error')).toBeNull();
  },
};

/**
 * A refusal known before asking (`refusedCode`): the message from the moment it opens and Confirm
 * disabled, so nothing is sent (a role the screen already knows is held).
 */
export const DeleteRefusedUpFront: Story = {
  args: {
    body: '7 staff members hold this role.',
    refusedCode: 'ERP-IDENTITY-0006',
    featureErrors: STAFF_ERRORS,
  },
  play: async ({ canvasElement }) => {
    const body = page(canvasElement);
    await waitFor(async () => {
      await expect(body.getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(body.getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

/** A network failure: the common message, and Confirm stays enabled with its own label. */
export const DeleteRetryable: Story = {
  args: { onConfirm: fn((): ConfirmOutcome => NETWORK), featureErrors: STAFF_ERRORS },
  play: async ({ canvasElement }) => {
    const body = page(canvasElement);
    await clickWhenReady(body.getByTestId('confirm-dialog-confirm'));
    // The dialog fades in over 100 ms; a synchronous answer can land while it is still translucent.
    await waitFor(async () => {
      await expect(body.getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(body.getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

/** In flight: both buttons disabled, the confirm reads "Deleting role…". */
export const Pending: Story = {
  args: { onConfirm: fn(() => new Promise<ConfirmOutcome>(() => undefined)) },
  play: async ({ canvasElement }) => {
    const body = page(canvasElement);
    await clickWhenReady(body.getByTestId('confirm-dialog-confirm'));
    await expect(body.getByTestId('confirm-dialog-dismiss')).toBeDisabled();
  },
};

/** Kind 2: an access change confirms in the brand fill (reversible, UI-SPEC choice 12). */
export const Deactivate: Story = {
  args: {
    kind: 'access',
    title: 'Deactivate Jane Doe?',
    body: "Jane Doe won't be able to sign in until someone makes them active again.",
    dismissLabel: 'Keep active',
    confirmLabel: 'Deactivate member',
    pendingLabel: 'Deactivating member…',
  },
};

/** Kind 3, with the copy a screen takes from `useConfirmCopy().discard({ recordName })`. */
export const Discard: Story = {
  args: {
    kind: 'discard',
    title: 'Discard changes?',
    body: "Your changes to Jane Doe haven't been saved.",
    dismissLabel: 'Keep editing',
    confirmLabel: 'Discard changes',
    pendingLabel: undefined,
  },
};

/** Kind 3 on a record never saved: `useConfirmCopy().discard({ noun: 'role' })`. */
export const DiscardNew: Story = {
  args: { ...Discard.args, body: "This new role hasn't been saved." },
};

/** Kind 4: what changed, the access change first and marked; focus on the confirm. */
export const SaveSummary: Story = {
  args: {
    kind: 'summary',
    title: 'Save changes to Jane Doe?',
    body: undefined,
    dismissLabel: 'Back to form',
    confirmLabel: 'Save staff member',
    pendingLabel: 'Saving staff member…',
    changes: [
      { type: 'updated', label: 'Phone' },
      {
        type: 'changed',
        label: 'Role',
        from: 'Employee',
        to: 'Warehouse Supervisor',
        access: true,
      },
    ],
  },
};

/** Kind 4 with permissions: the count line and the disclosure listing each audit row. */
export const SaveSummaryWithPermissions: Story = {
  args: {
    kind: 'summary',
    title: 'Save changes to Jane Doe?',
    dismissLabel: 'Back to form',
    confirmLabel: 'Save staff member',
    pendingLabel: 'Saving staff member…',
    changes: [
      { type: 'changed', label: 'Administrator', from: 'Yes', to: 'No', access: true },
      {
        type: 'changed',
        label: 'Role',
        from: 'Employee',
        to: 'Warehouse Supervisor',
        access: true,
      },
      {
        type: 'permissions',
        text: 'Adds 3 permissions and removes 1.',
        access: true,
        removed: ['Sales · invoices · Delete'],
        added: ['Stock · items · View', 'Stock · items · Create', 'Stock · items · Edit'],
      },
      { type: 'updated', label: 'Phone' },
      { type: 'updated', label: 'Email signature' },
    ],
  },
  play: async ({ canvasElement }) => {
    await clickWhenReady(page(canvasElement).getByRole('button', { name: 'Show 3 added' }));
  },
};

const many = (feature: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${feature} · r${String(i).padStart(2, '0')} · View`);

/**
 * A very long summary never grows off the screen (lead 2026-09-26): 40 removals and 50 additions,
 * both opened; the dialog stays within 85dvh, the title and the buttons stay put, and only the list
 * scrolls.
 */
export const SaveSummaryLong: Story = {
  args: {
    kind: 'summary',
    title: 'Save changes to Jane Doe?',
    body: undefined,
    dismissLabel: 'Back to form',
    confirmLabel: 'Save staff member',
    changes: [
      { type: 'changed', label: 'Administrator', from: 'No', to: 'Yes', access: true },
      {
        type: 'permissions',
        text: 'Adds 50 permissions and removes 40.',
        access: true,
        removed: many('Sales · invoices', 40),
        added: many('Stock · items', 50),
      },
      { type: 'updated', label: 'Phone' },
    ],
  },
  play: async ({ canvasElement }) => {
    await clickWhenReady(page(canvasElement).getByRole('button', { name: 'Show 30 more' }));
    await clickWhenReady(page(canvasElement).getByRole('button', { name: 'Show 50 added' }));
  },
};

/** The summary in Arabic: the footer mirrors, and the Arabic template carries ← (U+2192 is not bidi-mirrored). */
export const Rtl: Story = {
  globals: { locale: 'ar' },
  args: {
    kind: 'summary',
    title: 'حفظ التغييرات على جين دو؟',
    body: undefined,
    dismissLabel: 'العودة إلى النموذج',
    confirmLabel: 'حفظ الموظف',
    pendingLabel: 'جارٍ حفظ الموظف…',
    changes: [
      { type: 'updated', label: 'الهاتف' },
      { type: 'changed', label: 'الدور', from: 'موظف', to: 'مشرف المستودع', access: true },
    ],
  },
};
