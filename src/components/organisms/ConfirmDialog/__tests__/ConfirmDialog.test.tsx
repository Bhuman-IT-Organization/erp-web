// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';
import staffEn from '@/features/staff/messages/en.json';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import {
  ConfirmDialog,
  useConfirmCopy,
  type ConfirmDialogProps,
  type ConfirmOutcome,
} from '../ConfirmDialog';
import * as stories from '../ConfirmDialog.stories';

const COMMON = commonEn.common;
const STAFF_ERRORS = { namespace: 'staff', codes: ['ERP-IDENTITY-0006'] } as const;

const DELETE = {
  kind: 'destructive',
  title: 'Delete role Warehouse Supervisor?',
  body: 'This cannot be undone.',
  dismissLabel: 'Keep role',
  confirmLabel: 'Delete role',
  pendingLabel: 'Deleting role…',
} as const satisfies Partial<ConfirmDialogProps>;

const OK: ConfirmOutcome = { ok: true };
const REFUSED: ConfirmOutcome = { ok: false, code: 'ERP-IDENTITY-0006', retryAfterS: null };
const NETWORK: ConfirmOutcome = { ok: false, code: 'ERP-NETWORK-0001', retryAfterS: null };

type HostProps = (ConfirmDialogProps extends infer P
  ? P extends ConfirmDialogProps
    ? Omit<P, 'open' | 'onOpenChange'>
    : never
  : never) & { readonly onOpenChange?: (open: boolean) => void };

/** A screen as plans 15-18 write it: it owns `open`, and a button outside reopens the dialog. */
function Host(props: HostProps): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="opener"
        onClick={() => {
          setOpen(true);
        }}
      >
        open
      </button>
      <ConfirmDialog
        {...props}
        open={open}
        onOpenChange={(next) => {
          props.onOpenChange?.(next);
          setOpen(next);
        }}
      />
    </>
  );
}

/**
 * A screen that answers inside the form instead (the staff save summary on a 400): it closes the
 * dialog itself and moves focus to its error summary, then tells the dialog its part is done.
 */
function HandOffHost(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="opener"
        onClick={() => {
          setOpen(true);
        }}
      >
        open
      </button>
      <div tabIndex={-1} data-testid="elsewhere">
        summary
      </div>
      <ConfirmDialog
        {...DELETE}
        kind="access"
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => {
          flushSync(() => {
            setOpen(false);
          });
          screen.getByTestId('elsewhere').focus();
          return OK;
        }}
      />
    </>
  );
}

/** A discard dialog as a screen builds it: the kit's own copy from `useConfirmCopy`. */
function DiscardHost({
  target,
}: {
  readonly target: { readonly recordName: string } | { readonly noun: string };
}): ReactElement {
  const copy = useConfirmCopy();
  return <Host kind="discard" {...copy.discard(target)} onConfirm={() => OK} />;
}

async function openHost(
  props: HostProps | ReactElement,
  locale: 'en' | 'ar' = 'en',
): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderWithProviders('kind' in props ? <Host {...props} /> : props, { locale });
  await user.click(screen.getByTestId('opener'));
  await screen.findByTestId('confirm-dialog');
  return user;
}

const confirmButton = (): HTMLButtonElement =>
  screen.getByTestId<HTMLButtonElement>('confirm-dialog-confirm');
const dismissButton = (): HTMLButtonElement =>
  screen.getByTestId<HTMLButtonElement>('confirm-dialog-dismiss');

describe('ConfirmDialog (D-25, UAT 7)', () => {
  it('destructive: title and body as given, a filled destructive confirm with the trash-can icon, focus on the dismiss', async () => {
    await openHost({ ...DELETE, onConfirm: () => OK });
    expect(screen.getByRole('alertdialog', { name: DELETE.title })).toBeDefined();
    expect(screen.getByText(DELETE.body)).toBeDefined();
    expect(confirmButton().textContent).toBe(DELETE.confirmLabel);
    expect(confirmButton().getAttribute('data-variant')).toBe('destructive');
    // Filled, never the primitive's 3.98:1 tint (FE-25, UI-SPEC § Color).
    expect(confirmButton().className.split(' ')).toEqual(
      expect.arrayContaining(['bg-destructive', 'text-background']),
    );
    expect(confirmButton().querySelector('svg')).not.toBeNull();
    expect(dismissButton().textContent).toBe(DELETE.dismissLabel);
    expect(document.activeElement).toBe(dismissButton());
  });

  it('details and blocked (opt-in, 04.6-14): block content under the title, outside the description, and Confirm disabled with no message of its own', async () => {
    const onConfirm = vi.fn(() => OK);
    await openHost({
      ...DELETE,
      details: <div data-testid="preflight">Two refusals</div>,
      blocked: true,
      onConfirm,
    });
    const details = await screen.findByTestId('confirm-dialog-details');
    expect(details.textContent).toBe('Two refusals');
    expect(details.closest('p')).toBeNull();
    const confirm = screen.getByTestId<HTMLButtonElement>('confirm-dialog-confirm');
    expect(confirm.disabled).toBe(true);
    expect(screen.queryByTestId('confirm-dialog-error')).toBeNull();
    await userEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a success closes the dialog once, through onOpenChange(false)', async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn(() => Promise.resolve(OK));
    const user = await openHost({ ...DELETE, onConfirm, onOpenChange });
    await user.click(confirmButton());
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onOpenChange.mock.calls).toEqual([[false]]);
  });

  it('a refusal (409 ERP-IDENTITY-0006) stays inside the open dialog, disables Confirm, and a second click sends nothing (T-3.2-45)', async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn(() => Promise.resolve(REFUSED));
    const user = await openHost({
      ...DELETE,
      onConfirm,
      onOpenChange,
      featureErrors: STAFF_ERRORS,
    });
    await user.click(confirmButton());
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toBe(staffEn.staff.errors['ERP-IDENTITY-0006']);
    expect(screen.getByTestId('confirm-dialog').contains(error)).toBe(true);
    expect(confirmButton().disabled).toBe(true);
    // Neither button is relabelled "Close" or "Try again" (UI-SPEC choice 37).
    expect(confirmButton().textContent).toBe(DELETE.confirmLabel);
    expect(dismissButton().textContent).toBe(DELETE.dismissLabel);
    await user.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // The dismiss is now the only way out, and it works.
    await user.click(dismissButton());
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
  });

  it('refusedCode (a refusal known before asking): the message from the moment it opens, Confirm disabled, a click never calls onConfirm, focus on the dismiss; a reopen is still refused (lead 2026-09-26)', async () => {
    const onConfirm = vi.fn(() => OK);
    const user = await openHost({
      ...DELETE,
      onConfirm,
      featureErrors: STAFF_ERRORS,
      refusedCode: 'ERP-IDENTITY-0006',
    });
    const error = screen.getByTestId('confirm-dialog-error');
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toBe(staffEn.staff.errors['ERP-IDENTITY-0006']);
    expect(confirmButton().disabled).toBe(true);
    expect(document.activeElement).toBe(dismissButton());
    await user.click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(dismissButton());
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    await user.click(screen.getByTestId('opener'));
    await screen.findByTestId('confirm-dialog');
    expect(screen.getByTestId('confirm-dialog-error').textContent).toBe(
      staffEn.staff.errors['ERP-IDENTITY-0006'],
    );
    expect(confirmButton().disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('refusal (opt-in, 04.8-18): the caller words a refusal itself (K25 with its action); null shows none; undefined keeps the plain message', async () => {
    const onConfirm = vi.fn(() => Promise.resolve(REFUSED));
    const own = vi.fn((code: string) =>
      code === 'ERP-IDENTITY-0006' ? <p data-testid="own-refusal">{code}</p> : undefined,
    );
    const user = await openHost({
      ...DELETE,
      onConfirm,
      featureErrors: STAFF_ERRORS,
      refusal: own,
    });
    await user.click(confirmButton());
    expect((await screen.findByTestId('own-refusal')).textContent).toBe('ERP-IDENTITY-0006');
    expect(screen.queryByTestId('confirm-dialog-error')).toBeNull();
    expect(confirmButton().disabled).toBe(true);
    cleanup();
    await openHost({ ...DELETE, onConfirm, featureErrors: STAFF_ERRORS, refusal: () => null });
    await user.click(confirmButton());
    await waitFor(() => {
      expect(confirmButton().disabled).toBe(true);
    });
    expect(screen.queryByTestId('confirm-dialog-error')).toBeNull();
    cleanup();
    await openHost({ ...DELETE, onConfirm, featureErrors: STAFF_ERRORS, refusal: () => undefined });
    await user.click(confirmButton());
    expect((await screen.findByTestId('confirm-dialog-error')).textContent).toBe(
      staffEn.staff.errors['ERP-IDENTITY-0006'],
    );
  });

  it('a retryable failure (ERP-NETWORK-0001) shows the common message, keeps Confirm enabled with its own label, and a click retries', async () => {
    const onConfirm = vi
      .fn<() => Promise<ConfirmOutcome>>()
      .mockResolvedValueOnce(NETWORK)
      .mockResolvedValueOnce(OK);
    const user = await openHost({ ...DELETE, onConfirm, featureErrors: STAFF_ERRORS });
    await user.click(confirmButton());
    expect((await screen.findByTestId('confirm-dialog-error')).textContent).toBe(
      COMMON.errors['ERP-NETWORK-0001'],
    );
    expect(confirmButton().disabled).toBe(false);
    expect(confirmButton().textContent).toBe(DELETE.confirmLabel);
    await user.click(confirmButton());
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('while pending both buttons are disabled and the confirm reads the pending label; Esc does not close it', async () => {
    const onOpenChange = vi.fn();
    const user = await openHost({
      ...DELETE,
      onOpenChange,
      onConfirm: () => new Promise<ConfirmOutcome>(() => undefined),
    });
    await user.click(confirmButton());
    expect(confirmButton().textContent).toBe(DELETE.pendingLabel);
    expect(confirmButton().disabled).toBe(true);
    expect(confirmButton().getAttribute('aria-busy')).toBe('true');
    expect(dismissButton().disabled).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('confirm-dialog')).toBeDefined();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('after a refusal focus moves to the dismiss, the only way out; after a retryable failure it rests on Confirm', async () => {
    const onConfirm = vi
      .fn<() => ConfirmOutcome>()
      .mockReturnValueOnce(NETWORK)
      .mockReturnValueOnce(REFUSED);
    const user = await openHost({ ...DELETE, onConfirm, featureErrors: STAFF_ERRORS });
    await user.click(confirmButton());
    await screen.findByTestId('confirm-dialog-error');
    expect(document.activeElement).toBe(confirmButton());
    await user.click(confirmButton());
    await waitFor(() => {
      expect(confirmButton().disabled).toBe(true);
    });
    expect(document.activeElement).toBe(dismissButton());
  });

  it('a retry in flight shows no error: the last failure is cleared while the answer is unknown (D-39)', async () => {
    const onConfirm = vi
      .fn<() => Promise<ConfirmOutcome>>()
      .mockResolvedValueOnce(NETWORK)
      .mockReturnValueOnce(new Promise<ConfirmOutcome>(() => undefined));
    const user = await openHost({ ...DELETE, onConfirm });
    await user.click(confirmButton());
    await screen.findByTestId('confirm-dialog-error');
    await user.click(confirmButton());
    expect(confirmButton().textContent).toBe(DELETE.pendingLabel);
    expect(screen.queryByTestId('confirm-dialog-error')).toBeNull();
  });

  it('closing and reopening clears the previous error', async () => {
    const user = await openHost({
      ...DELETE,
      onConfirm: () => REFUSED,
      featureErrors: STAFF_ERRORS,
    });
    await user.click(confirmButton());
    await screen.findByTestId('confirm-dialog-error');
    await user.click(dismissButton());
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    await user.click(screen.getByTestId('opener'));
    await screen.findByTestId('confirm-dialog');
    expect(screen.queryByTestId('confirm-dialog-error')).toBeNull();
    expect(confirmButton().disabled).toBe(false);
  });

  it('does not use Radix AlertDialogAction: clicking confirm never closes the dialog before onConfirm resolves', async () => {
    const onOpenChange = vi.fn();
    let settle: (outcome: ConfirmOutcome) => void = () => undefined;
    const user = await openHost({
      ...DELETE,
      onOpenChange,
      onConfirm: () =>
        new Promise<ConfirmOutcome>((resolve) => {
          settle = resolve;
        }),
    });
    await user.click(confirmButton());
    expect(screen.getByTestId('confirm-dialog')).toBeDefined();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(document.querySelector('[data-slot="alert-dialog-action"]')).toBeNull();
    settle(OK);
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('returns focus to the control that opened it when dismissed (the focus trap lets go)', async () => {
    const user = await openHost({ ...DELETE, onConfirm: () => OK });
    await user.click(dismissButton());
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('opener'));
    });
  });

  it('a screen that moved focus itself as the dialog closed keeps it: the opener comes back only when focus was dropped', async () => {
    const user = await openHost(<HandOffHost />);
    await user.click(confirmButton());
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.activeElement).toBe(screen.getByTestId('elsewhere'));
  });

  it('discard with useConfirmCopy({ recordName }): "Discard changes?", the body names the record, "Keep editing" and a destructive "Discard changes" without the trash icon', async () => {
    await openHost(<DiscardHost target={{ recordName: 'Jane Doe' }} />);
    expect(screen.getByRole('alertdialog', { name: COMMON.discard_title })).toBeDefined();
    expect(screen.getByText(COMMON.discard_body.replace('{name}', 'Jane Doe'))).toBeDefined();
    expect(dismissButton().textContent).toBe(COMMON.keep_editing);
    expect(confirmButton().textContent).toBe(COMMON.discard_changes);
    expect(confirmButton().getAttribute('data-variant')).toBe('destructive');
    expect(confirmButton().querySelector('svg')).toBeNull();
    expect(document.activeElement).toBe(dismissButton());
  });

  it('useConfirmCopy().backTo(place): a dismiss naming its place, "Back to {place}" (04.7)', () => {
    function BackTo(): ReactElement {
      return <p>{useConfirmCopy().backTo('invoice')}</p>;
    }
    renderWithProviders(<BackTo />);
    expect(screen.getByText('Back to invoice')).toBeDefined();
    expect(COMMON.back_to_named).toBe('Back to {place}');
  });

  it('discard of a new record: "This new role hasn\'t been saved."', async () => {
    await openHost(<DiscardHost target={{ noun: 'role' }} />);
    expect(screen.getByText(COMMON.discard_body_new.replace('{noun}', 'role'))).toBeDefined();
  });

  it('summary: focus on confirm; the access change FIRST with the triangle icon, then "Phone updated"; dismiss "Back to form"', async () => {
    await openHost({
      kind: 'summary',
      title: 'Save changes to Jane Doe?',
      dismissLabel: COMMON.back_to_form,
      confirmLabel: 'Save staff member',
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
      onConfirm: () => OK,
    });
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Role: Employee → Warehouse Supervisor',
      'Phone updated',
    ]);
    expect(items[0]?.querySelector('svg')).not.toBeNull();
    expect(items[1]?.querySelector('svg')).toBeNull();
    expect(dismissButton().textContent).toBe(COMMON.back_to_form);
    expect(confirmButton().getAttribute('data-variant')).toBe('default');
    expect(document.activeElement).toBe(confirmButton());
  });

  it('summary with visibleChanges: the first lines, then "Show {n} more" reveals the rest; a reopen starts folded again (4.2 K6)', async () => {
    const lines = Array.from({ length: 12 }, (_, i) => ({
      type: 'text' as const,
      text: `Added: Unit ${String(i + 1)}`,
    }));
    await openHost({
      kind: 'summary',
      title: 'Save changes to Units?',
      dismissLabel: COMMON.keep_editing,
      confirmLabel: 'Save units',
      changes: lines,
      visibleChanges: 10,
      onConfirm: () => OK,
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    await userEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    expect(screen.queryByRole('button', { name: 'Show 2 more' })).toBeNull();
    await userEvent.click(dismissButton());
    await userEvent.click(screen.getByTestId('opener'));
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
  });

  it('summary: a permissions change reads through PermissionChanges — the sentence, the removals open, the additions behind "Show N added"', async () => {
    const user = await openHost({
      kind: 'summary',
      title: 'Save changes to Jane Doe?',
      dismissLabel: COMMON.back_to_form,
      confirmLabel: 'Save staff member',
      changes: [
        {
          type: 'permissions',
          text: 'Adds 2 permissions and removes 1.',
          access: true,
          removed: ['Stock · Delete'],
          added: ['Sales · View', 'Sales · Edit'],
        },
      ],
      onConfirm: () => OK,
    });
    const changes = screen.getByTestId('confirm-dialog-changes');
    expect(changes.textContent).toContain('Adds 2 permissions and removes 1.');
    expect(screen.getByText('Stock · Delete').closest('[hidden]')).toBeNull();
    const show = screen.getByRole('button', { name: 'Show 2 added' });
    expect(screen.getByText('Sales · View').closest('[hidden]')).not.toBeNull();
    await user.click(show);
    expect(show.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Sales · View').closest('[hidden]')).toBeNull();
    // Tab still cycles inside the dialog: the disclosure is one more stop in the trap.
    expect(changes.closest('[role="alertdialog"]')).not.toBeNull();
  });

  it('a long dialog never grows off the screen (lead 2026-09-26): at most 85dvh, a flex column whose change list alone scrolls; the title and both buttons stay outside the scroll region', async () => {
    const many = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => `${prefix} · r${String(i)} · View`);
    await openHost({
      kind: 'summary',
      title: 'Save changes to Jane Doe?',
      dismissLabel: COMMON.back_to_form,
      confirmLabel: 'Save staff member',
      changes: [
        {
          type: 'permissions',
          text: 'Adds 50 permissions and removes 40.',
          access: true,
          removed: many('Sales', 40),
          added: many('Stock', 50),
        },
      ],
      onConfirm: () => OK,
    });
    const classes = (element: Element) => element.className.split(' ');
    const content = screen.getByTestId('confirm-dialog');
    expect(classes(content)).toEqual(expect.arrayContaining(['max-h-[85dvh]', 'flex', 'flex-col']));
    const body = screen.getByTestId('confirm-dialog-body');
    expect(classes(body)).toEqual(expect.arrayContaining(['min-h-0', 'overflow-y-auto']));
    expect(body.contains(screen.getByTestId('confirm-dialog-changes'))).toBe(true);
    expect(body.contains(screen.getByRole('heading'))).toBe(false);
    expect(body.contains(confirmButton())).toBe(false);
    expect(body.contains(dismissButton())).toBe(false);
  });

  it('access: the confirm uses the default (brand) variant and focus starts on the dismiss', async () => {
    await openHost({
      kind: 'access',
      title: 'Deactivate Jane Doe?',
      body: "Jane Doe won't be able to sign in until someone makes them active again.",
      dismissLabel: 'Keep active',
      confirmLabel: 'Deactivate member',
      onConfirm: () => OK,
    });
    expect(confirmButton().getAttribute('data-variant')).toBe('default');
    expect(confirmButton().querySelector('svg')).toBeNull();
    expect(document.activeElement).toBe(dismissButton());
  });

  it('does not compile without its labels: the props are a union on kind (checked by typecheck)', () => {
    const base = { open: true, onOpenChange: vi.fn(), onConfirm: () => OK } as const;
    const change = [{ type: 'updated', label: 'Phone' }] as const;
    const elements = [
      // @ts-expect-error destructive requires confirmLabel
      <ConfirmDialog key="1" {...base} kind="destructive" title="t" body="b" dismissLabel="d" />,
      // @ts-expect-error access requires its body
      <ConfirmDialog key="2" {...base} kind="access" title="t" dismissLabel="d" confirmLabel="c" />,
      // @ts-expect-error discard requires dismissLabel
      <ConfirmDialog key="3" {...base} kind="discard" title="t" body="b" confirmLabel="c" />,
      // @ts-expect-error the summary requires its changes
      <ConfirmDialog
        key="4"
        {...base}
        kind="summary"
        title="t"
        dismissLabel="d"
        confirmLabel="c"
      />,
      // @ts-expect-error the summary requires dismissLabel
      <ConfirmDialog
        key="5"
        {...base}
        kind="summary"
        title="t"
        confirmLabel="c"
        changes={change}
      />,
      // @ts-expect-error changes belong to the summary only
      <ConfirmDialog key="6" {...base} {...DELETE} changes={change} />,
      <ConfirmDialog key="7" {...base} {...DELETE} />,
      <ConfirmDialog
        key="8"
        {...base}
        kind="summary"
        title="t"
        dismissLabel="d"
        confirmLabel="c"
        changes={change}
      />,
    ];
    expect(elements).toHaveLength(8);
  });

  it('no button in any story reads a bare Confirm, Cancel, Save or Close', () => {
    const { default: meta, ...named } = stories;
    const bare = new Set(['Confirm', 'Cancel', 'Save', 'Close']);
    const seen: string[] = [];
    for (const [name, story] of Object.entries(named)) {
      const locale = story.globals?.locale === 'ar' ? 'ar' : 'en';
      const args = { ...meta.args, ...story.args } as ConfirmDialogProps;
      renderWithProviders(<ConfirmDialog {...args} />, { locale });
      const labels = screen.getAllByRole('button').map((button) => button.textContent.trim());
      expect(labels.length, name).toBeGreaterThanOrEqual(2);
      expect(
        labels.filter((label) => bare.has(label)),
        name,
      ).toEqual([]);
      seen.push(name);
      cleanup();
    }
    expect(seen).toHaveLength(13);
  });

  it('under ar the change arrow points from the old value to the new in reading order (U+2192 is not bidi-mirrored)', async () => {
    await openHost(
      {
        kind: 'summary',
        title: 'حفظ التغييرات؟',
        dismissLabel: 'العودة إلى النموذج',
        confirmLabel: 'حفظ الموظف',
        changes: [{ type: 'changed', label: 'الدور', from: 'موظف', to: 'مشرف المستودع' }],
        onConfirm: () => OK,
      },
      'ar',
    );
    expect(screen.getByRole('listitem').textContent).toBe('الدور: موظف ← مشرف المستودع');
  });

  it('uses no physical-direction class under ar', async () => {
    await openHost({ ...DELETE, onConfirm: () => OK }, 'ar');
    expect(physicalClassesIn(document.body)).toEqual([]);
  });
});
