'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Icon } from '@/components/atoms/Icon';
import { PermissionChanges } from '@/components/molecules/PermissionChanges';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { isRetryableCode, type FeatureErrorCodes } from '@/lib/errors/error-messages';
import { useErrorText } from '@/lib/errors/use-error-text';
import { useFormat } from '@/lib/i18n/format';

/** The four confirmations D-25 makes required: delete/irreversible, access change, discard, save summary. */
export type ConfirmKind = 'destructive' | 'access' | 'discard' | 'summary';

/** What `onConfirm` answers; an `ApiResult` from `callApi`/`useCommonMutation` passes as-is. */
export type ConfirmOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly retryAfterS: number | null };

/** One line of the save summary (D-25.4); `access` lines are listed first and marked. */
export type SummaryChange =
  | {
      readonly type: 'changed';
      readonly label: string;
      readonly from: string;
      readonly to: string;
      readonly access?: boolean;
    }
  | { readonly type: 'updated'; readonly label: string; readonly access?: boolean }
  | { readonly type: 'text'; readonly text: string; readonly access?: boolean }
  | {
      /**
       * A permission change, read the same in every dialog (lead 2026-09-26): the sentence with
       * the counts ("Adds 5 permissions and removes 1."), the removals listed openly, the additions
       * behind "Show N added" (`PermissionChanges`). `text` is omitted when the dialog's body is
       * already the sentence (the re-apply role confirmation).
       */
      readonly type: 'permissions';
      readonly text?: string | undefined;
      readonly access?: boolean;
      readonly removed: readonly string[];
      readonly added: readonly string[];
    };

interface ConfirmDialogBase {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  /** Names what it keeps ("Keep role", "Keep editing", "Back to form"). */
  readonly dismissLabel: string;
  /** Names what it does ("Delete role", "Discard changes", "Save staff member"). */
  readonly confirmLabel: string;
  /** The progressive form ("Deleting role…"); defaults to `confirmLabel`. */
  readonly pendingLabel?: string | undefined;
  readonly onConfirm: () => Promise<ConfirmOutcome> | ConfirmOutcome;
  /** A feature's codes → its own messages, through `useErrorText`. */
  readonly featureErrors?: FeatureErrorCodes | undefined;
  /**
   * A refusal known BEFORE asking (the screen already holds the answer, e.g. a role its row says is
   * held): the dialog shows that code's message from the moment it opens, Confirm is disabled from
   * the start and `onConfirm` is never called, so no request that cannot succeed is sent. A prop,
   * so it survives a close and reopen; absent, a refusal still arrives live from `onConfirm`.
   */
  readonly refusedCode?: string | undefined;
  /**
   * The summary's first N lines; the rest behind "Show {n} more" (an editable table's batch, 4.2
   * UI-SPEC § Editable table: 10). Absent: every line, as every form summary shows them.
   */
  readonly visibleChanges?: number | undefined;
  /**
   * Opt-in (04.6-14): block content under the title, outside the description's paragraph (a
   * preflight's skeleton lines or its refusal alerts, K25), in the scrolling region.
   */
  readonly details?: ReactNode | undefined;
  /**
   * Opt-in (04.6-14): Confirm disabled without a message of the dialog's own, while `details` shows
   * why (several refusals at once) or while the answer they wait for is still out.
   */
  readonly blocked?: boolean | undefined;
  /**
   * Opt-in (04.8-18): a refusal the caller words itself (K25 with its lines and action) by its
   * code: a node replaces the plain message, `null` shows none (the caller's `details` already
   * show it), `undefined` keeps the plain message. Confirm stays disabled as for any refusal.
   */
  readonly refusal?: ((code: string) => ReactNode) | undefined;
}

/**
 * A union on `kind`, so a dialog without its words does not compile: every kind needs a title and
 * both button labels; delete, access and discard need a body; the summary needs its changes, and
 * only the summary takes them. `useConfirmCopy` supplies the kit's own discard copy.
 */
export type ConfirmDialogProps =
  | (ConfirmDialogBase & {
      readonly kind: 'destructive' | 'discard';
      readonly body: ReactNode;
      readonly changes?: never;
    })
  | (ConfirmDialogBase & {
      readonly kind: 'access';
      readonly body: ReactNode;
      /** What the access change does, when it is a set of permissions (re-apply role). */
      readonly changes?: readonly SummaryChange[] | undefined;
    })
  | (ConfirmDialogBase & {
      readonly kind: 'summary';
      /** The list of changes, access changes first with the triangle-exclamation icon. */
      readonly changes: readonly SummaryChange[];
      readonly body?: ReactNode | undefined;
    });

/** The copy of a discard dialog, spread into `<ConfirmDialog kind="discard" … />`. */
export interface DiscardCopy {
  readonly title: string;
  readonly body: string;
  readonly dismissLabel: string;
  readonly confirmLabel: string;
}

/**
 * The kit's fixed confirmation copy from `common` (UI-SPEC § ConfirmDialog): the whole discard
 * dialog — "Discard changes?", the body naming the record (or the new noun), "Keep editing",
 * "Discard changes" — and the summary's dismiss, "Back to form".
 */
export function useConfirmCopy(): {
  readonly discard: (
    target: { readonly recordName: string } | { readonly noun: string },
  ) => DiscardCopy;
  readonly backToForm: string;
  readonly backTo: (place: string) => string;
} {
  const t = useTranslations('common');
  return {
    discard: (target) => ({
      title: t('discard_title'),
      body:
        'recordName' in target
          ? t('discard_body', { name: target.recordName })
          : t('discard_body_new', { noun: target.noun }),
      dismissLabel: t('keep_editing'),
      confirmLabel: t('discard_changes'),
    }),
    backToForm: t('back_to_form'),
    // 04.7 (UI-SPEC § Copywriting, dialog dismissals): a dismiss that names where it returns.
    backTo: (place) => t('back_to_named', { place }),
  };
}

type Phase = 'idle' | 'pending' | 'refused' | 'failed';

interface DialogState {
  readonly phase: Phase;
  readonly message: string | null;
  /** The refused or failed code (the `refusal` opt-in words it); `null` while none. */
  readonly code: string | null;
  /** The `open` prop this state belongs to: a new open/close cycle starts from idle. */
  readonly open: boolean;
}

/** A thrown `onConfirm` is a bug, not a retryable failure: it is shown as `common.errors.unknown`. */
const THROWN: ConfirmOutcome = { ok: false, code: 'unknown', retryAfterS: null };

/** The fixed destructive fill (FE-25: never the primitive's `bg-destructive/10` tint, 3.98:1). */
const DESTRUCTIVE_FILL = 'bg-destructive text-background hover:bg-destructive/90';

/**
 * The one confirmation of the product (D-25, UI-SPEC § ConfirmDialog, UAT 7), generalising the
 * roles delete dialog. Every kind has a title, a dismiss that names what it keeps and a confirm that
 * names what it does — never a bare Confirm/Cancel (UI-SPEC choice 37).
 *
 * **A refusal stays inside the dialog.** The confirm is a plain `Button`, not Radix's
 * Action primitive: Radix closes the dialog when its Action is activated, and a 409 must stay
 * visible where the member asked (UAT 7, PATTERNS § D). A 4xx sets `refused` and disables Confirm,
 * so a second click cannot re-issue a request that cannot succeed (T-3.2-45); a retryable failure
 * (`isRetryableCode`) keeps Confirm enabled with its own label, so a click retries. The dialog
 * closes only on success. The message is plain language through `useErrorText` (D-32).
 *
 * Delete and discard confirm in the fixed destructive red (delete also with the trash-can icon);
 * access changes and the summary in the brand fill — red is kept for the irreversible (choice 12).
 * Focus starts on the dismiss, except for the summary, whose confirm is the expected next step.
 * The summary lists access changes first (choice 14: one dialog per save, never stacked). Feature
 * words arrive as strings (FE-01); this component reads only `common`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  kind,
  title,
  body,
  changes,
  dismissLabel,
  confirmLabel,
  pendingLabel,
  onConfirm,
  featureErrors,
  refusedCode,
  visibleChanges,
  details,
  blocked = false,
  refusal,
}: ConfirmDialogProps): ReactElement {
  const t = useTranslations('common');
  const f = useFormat();
  const errorText = useErrorText(featureErrors);
  const [state, setState] = useState<DialogState>({
    phase: 'idle',
    message: null,
    code: null,
    open,
  });
  const [expanded, setExpanded] = useState(false);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const baseId = useId();

  // Opening or closing starts a new cycle: the previous refusal is not a reason any more. Adjusted
  // while rendering (React's "state from a prop change" pattern), not in a handler, so a screen
  // that closes the dialog itself gets the same clean slate.
  if (state.open !== open) {
    setState({ phase: 'idle', message: null, code: null, open });
    setExpanded(false);
  }
  const pending = state.phase === 'pending';
  const known = refusedCode !== undefined;
  const message = known ? errorText({ code: refusedCode, retryAfterS: null }) : state.message;
  const shownCode = known ? refusedCode : state.code;
  const own = refusal === undefined || shownCode === null ? undefined : refusal(shownCode);

  const red = kind === 'destructive' || kind === 'discard';

  function changeText(change: SummaryChange): string {
    if (change.type === 'changed') {
      return t('change_from_to', { label: change.label, from: change.from, to: change.to });
    }
    if (change.type === 'updated') return t('field_updated', { label: change.label });
    return change.text ?? '';
  }

  async function confirm(): Promise<void> {
    setState({ phase: 'pending', message: null, code: null, open });
    let outcome: ConfirmOutcome;
    try {
      outcome = await onConfirm();
    } catch {
      outcome = THROWN;
    }
    if (outcome.ok) {
      setState({ phase: 'idle', message: null, code: null, open });
      onOpenChange(false);
      return;
    }
    const retryable = isRetryableCode(outcome.code);
    // Rendered now, so the buttons are enabled again before focus moves: the focused confirm was
    // disabled while pending, and a browser drops that focus to <body>. After a refusal the dismiss
    // is the only way out; after a retryable failure the confirm is the retry.
    flushSync(() => {
      setState({
        phase: retryable ? 'failed' : 'refused',
        message: errorText(outcome),
        code: outcome.code,
        open,
      });
    });
    (retryable ? confirmRef : dismissRef).current?.focus();
  }

  // Access changes first, each group in the order given (a stable partition, not a sort).
  const ordered = [
    ...(changes ?? []).filter((change) => change.access === true),
    ...(changes ?? []).filter((change) => change.access !== true),
  ];
  const shown =
    expanded || visibleChanges === undefined ? ordered : ordered.slice(0, visibleChanges);
  const hiddenCount = ordered.length - shown.length;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Esc while the request is in flight would hide its answer; the buttons are disabled too.
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        data-testid="confirm-dialog"
        // Never taller than the screen (lead 2026-09-26): at most 85dvh (dvh, so a mobile browser's
        // bars never cut it off), a flex column in which the title and the buttons stay put and only
        // the change list scrolls. Focus moving into the list scrolls the item into view natively.
        className="flex max-h-[85dvh] flex-col data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          // Focus has not moved yet: this is the control that opened the dialog.
          const active = document.activeElement;
          openerRef.current = active instanceof HTMLElement ? active : null;
          (kind === 'summary' ? confirmRef : dismissRef).current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          // Radix returns focus to its Trigger, and a controlled dialog has none: without this,
          // focus would fall to <body> on close and a keyboard user would start over. Only a
          // DROPPED focus comes back: a screen that moved it as the dialog closed (a form's error
          // summary after a refused save, D-29) keeps it there.
          event.preventDefault();
          const active = document.activeElement;
          if (active === null || active === document.body) openerRef.current?.focus();
        }}
      >
        <AlertDialogHeader className="shrink-0">
          <AlertDialogTitle className="text-lg font-semibold">{title}</AlertDialogTitle>
          {body === undefined ? null : (
            <AlertDialogDescription className="text-sm">{body}</AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {ordered.length === 0 ? null : (
          <div
            data-testid="confirm-dialog-body"
            className="-mx-4 min-h-0 overflow-y-auto border-t px-4 pt-2"
          >
            <ul data-testid="confirm-dialog-changes" className="flex flex-col gap-2 text-sm">
              {shown.map((change, index) => (
                <li key={index} className="flex items-start gap-2">
                  {change.access === true ? (
                    <Icon name="triangle-exclamation" className="mt-0.5 size-4 shrink-0" />
                  ) : null}
                  <div className="flex min-w-0 flex-col gap-1">
                    {changeText(change) === '' ? null : <span>{changeText(change)}</span>}
                    {change.type === 'permissions' ? (
                      <PermissionChanges
                        id={`${baseId}-${String(index)}`}
                        removed={change.removed}
                        added={change.added}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {hiddenCount > 0 ? (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={() => {
                  setExpanded(true);
                }}
              >
                {t('show_more_count', { count: hiddenCount, n: f.number(hiddenCount) })}
              </Button>
            ) : null}
          </div>
        )}

        {details === undefined || details === null ? null : (
          <div
            data-testid="confirm-dialog-details"
            className="flex min-h-0 flex-col gap-2 overflow-y-auto"
          >
            {details}
          </div>
        )}

        {own === undefined || own === null ? null : (
          <div className="flex shrink-0 flex-col gap-2">{own}</div>
        )}
        {message === null || own !== undefined ? null : (
          <Alert
            variant="destructive"
            role="alert"
            data-testid="confirm-dialog-error"
            className="shrink-0"
          >
            {message}
          </Alert>
        )}

        <AlertDialogFooter className="shrink-0">
          <AlertDialogCancel
            ref={dismissRef}
            data-testid="confirm-dialog-dismiss"
            disabled={pending}
          >
            {dismissLabel}
          </AlertDialogCancel>
          {/*
            A plain Button, never the Action primitive: Radix closes the dialog when its Action is
            activated, and a refusal must stay visible inside it (UAT 7, PATTERNS § D).
          */}
          <Button
            ref={confirmRef}
            type="button"
            variant={red ? 'destructive' : 'default'}
            className={red ? DESTRUCTIVE_FILL : undefined}
            data-testid="confirm-dialog-confirm"
            disabled={pending || state.phase === 'refused' || known || blocked}
            aria-busy={pending || undefined}
            onClick={() => {
              void confirm();
            }}
          >
            {kind === 'destructive' ? <Icon name="trash-can" /> : null}
            {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
