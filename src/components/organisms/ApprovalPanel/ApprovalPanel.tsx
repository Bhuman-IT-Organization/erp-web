'use client';

import { useTranslations } from 'next-intl';
import { useId, type ReactElement, type ReactNode } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ProtectedImage, type ProtectedImageProps } from '@/components/molecules/ProtectedImage';
import { StatusBadge, type StatusBadgeProps } from '@/components/molecules/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormat } from '@/lib/i18n/format';

/** The api path of a stored signature image, as `ProtectedImage` reads it. */
type ApiPath = NonNullable<ProtectedImageProps['path']>;

/** One configured approver's step and how it was decided. */
export interface ApprovalStep {
  readonly key: string;
  /** 1-based, the order the approvers act in. */
  readonly order: number;
  readonly approverName: string;
  readonly action: 'approve' | 'sign';
  readonly status: 'approved' | 'pending' | 'rejected';
  /** ISO date-time of the decision; `null` while the step is open. */
  readonly decidedAt: string | null;
  /** The reason given with the decision. */
  readonly note: string | null;
  /** A decided sign step's stored signature (read through `ProtectedImage`). */
  readonly signaturePath: ApiPath | null;
}

export interface ApprovalPanelProps {
  /** The panel's title, a feature word ("Approval information"). */
  readonly heading: string;
  /** The approver list's title ("Approver list"). */
  readonly listHeading: string;
  /** `undefined` while the approvals load (D-39). */
  readonly steps: readonly ApprovalStep[] | undefined;
  readonly statusLabels: Readonly<Record<ApprovalStep['status'], string>>;
  /** Under a signature ("(Sign, full name)"). */
  readonly signedCaption: string;
  /** Before a decision's note ("Reason"). */
  readonly reasonLabel: string;
  /** The viewer's one primary action (Send a request, Approve or Sign), rendered last; absent: none. */
  readonly action?: ReactNode;
}

const BADGE: Readonly<Record<ApprovalStep['status'], StatusBadgeProps['status']>> = {
  approved: 'done',
  pending: 'pending',
  rejected: 'rejected',
};

/** One decided step of the trail: the signature image or the glyph, the name, the date, the reason. */
function TrailEntry({
  step,
  signedCaption,
  reasonLabel,
}: {
  readonly step: ApprovalStep;
  readonly signedCaption: string;
  readonly reasonLabel: string;
}): ReactElement {
  const f = useFormat();
  const signed = step.action === 'sign' && step.signaturePath !== null;
  return (
    <li className="flex flex-col gap-1 text-sm">
      {signed ? (
        // The name and the caption beside it say whose it is: the image itself is decoration.
        <ProtectedImage path={step.signaturePath} alt="" className="h-16 w-40 object-contain" />
      ) : (
        <Icon
          name={step.status === 'rejected' ? 'circle-xmark' : 'circle-check'}
          className="size-4"
        />
      )}
      <span className="font-semibold">{step.approverName}</span>
      {signed ? <span className="text-muted-foreground text-xs">{signedCaption}</span> : null}
      {step.decidedAt === null ? null : (
        <time dateTime={step.decidedAt} className="text-muted-foreground text-xs tabular-nums">
          <bdi>{f.dateTime(step.decidedAt)}</bdi>
        </time>
      )}
      {step.note === null || step.note === '' ? null : (
        <span className="flex flex-col">
          <span className="text-xs font-semibold">{reasonLabel}</span>
          <span className="whitespace-pre-line wrap-anywhere">{step.note}</span>
        </span>
      )}
    </li>
  );
}

/** Label and badge bars while the approvals load (D-39). */
function PanelSkeleton(): ReactElement {
  return (
    <div data-testid="approval-panel-loading" aria-hidden="true" className="flex flex-col gap-2">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center justify-between gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-24" />
        </div>
      ))}
    </div>
  );
}

/**
 * K17 (04.6 UI-SPEC § Kit additions, § Approvals): a document's approvals, generic over the
 * document type. The approver list ("{order}: {name}" and each
 * step's badge: approved `done`, pending `pending`, rejected `rejected`, K20), the trail of decided
 * steps (the 160 x 64 signature image through `ProtectedImage` for a sign step, else a 16px
 * `circle-check` or `circle-xmark`; the name; the signed caption under a signature; the date through
 * `useFormat`; the reason when given), then the viewer's one action slot, last.
 *
 * Planner decision 1 (plan 04.6-04): the approve and sign dialogs are not here; plan 14 builds them
 * with K18 and passes its button as `action`, so each document type can pass its own. Every word arrives
 * translated from the feature. Names and notes render as React text (T-4.6-28). An organism
 * (FE-06): it uses the molecules `ProtectedImage` and `StatusBadge`.
 */
export function ApprovalPanel({
  heading,
  listHeading,
  steps,
  statusLabels,
  signedCaption,
  reasonLabel,
  action,
}: ApprovalPanelProps): ReactElement {
  const t = useTranslations('common');
  const headingId = useId();
  const listId = useId();
  let content: ReactNode;
  if (steps === undefined) {
    content = <PanelSkeleton />;
  } else if (steps.length === 0) {
    // A feature shows the panel only while an approval setting applies or a request was sent, so no
    // step yet means not sent: the approvers resolve at Send (UAT 4.6). Never "no approver is set".
    content = <p className="text-muted-foreground text-sm">{t('approval_not_sent')}</p>;
  } else {
    const decided = steps.filter((step) => step.status !== 'pending' && step.decidedAt !== null);
    content = (
      <>
        <h3 id={listId} className="text-sm font-semibold">
          {listHeading}
        </h3>
        <ol aria-labelledby={listId} className="flex flex-col gap-2">
          {steps.map((step) => (
            <li key={step.key} className="flex items-center justify-between gap-2 text-sm">
              {/*
                The number and the name are one isolate whose direction is the name's (bdi is
                dir="auto"): an English name reads "1: Thazin Oo" on an Arabic page, never
                "Thazin Oo :1", and an Arabic name reads right to left after its number (UAT 4.6).
              */}
              <bdi data-step-name="">
                {t('row_column', { row: String(step.order), column: step.approverName })}
              </bdi>
              <StatusBadge status={BADGE[step.status]} label={statusLabels[step.status]} />
            </li>
          ))}
        </ol>
        {decided.length === 0 ? null : (
          <ol data-testid="approval-trail" className="flex flex-col gap-4 border-t pt-4">
            {decided.map((step) => (
              <TrailEntry
                key={step.key}
                step={step}
                signedCaption={signedCaption}
                reasonLabel={reasonLabel}
              />
            ))}
          </ol>
        )}
      </>
    );
  }
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-lg font-semibold">
        {heading}
      </h2>
      {content}
      {steps === undefined || action === undefined ? null : (
        <div className="flex justify-end">{action}</div>
      )}
    </section>
  );
}
