'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { InlineError } from '@/components/molecules/InlineError';
import { Button } from '@/components/ui/button';
import { MAIL_ERRORS } from '@/features/mail/api/mail.endpoints';
import type { MailDraft } from '@/features/mail/hooks/use-template-preview';
import { useSendTest, useTestState } from '@/features/mail/hooks/use-test-send';
import type { TestStateResponse } from '@/features/mail/schemas/mail.schema';
import type { ApiResult } from '@/lib/api/call-api';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import { isRetryableCode } from '@/lib/errors/error-messages';
import { useErrorText } from '@/lib/errors/use-error-text';
import { useFormat } from '@/lib/i18n/format';

/** The sent-email log's record route (plan 10); the entry's permalink. */
const SENT_EMAILS_BASE = '/setup/sent-emails';

export interface TestSendProps {
  /** `template`: the editor's draft; `status`: the status page's fixed test (plan 10). */
  readonly mode: 'template' | 'status';
  /** Template mode: the template the draft belongs to. */
  readonly templateId?: string;
  /** Template mode: the previewed draft; `undefined` while there is nothing to send. */
  readonly draft?: MailDraft;
  /** Template mode: the previewed version's language, named in the caption. */
  readonly languageName?: string;
  /** False: mail is not configured, so the button is disabled from the start. */
  readonly configured: boolean;
  /** The member's own address (the only recipient, choice 4); `null` when the account has none. */
  readonly recipient: string | null;
  /** Outline on the editor (its save is the anchor), primary on the status page. */
  readonly variant: 'outline' | 'default';
  /** The "View in Sent emails" link: the log is administrator-only (D-05). */
  readonly canViewLog: boolean;
  /** Called once when the test reaches sent or failed. */
  readonly onFinal?: () => void;
}

type SendFailure = Extract<ApiResult<unknown>, { ok: false }>;
type Translate = ReturnType<typeof useTranslations<'mail'>>;

/** An address or token inside a message: `<bdi>`, so it reads left to right in Arabic (3.2 D-34). */
const bdi = (chunks: ReactNode): ReactElement => <bdi>{chunks}</bdi>;

/** The line before the button: what is sent, to whom; or why nothing can be. */
function Caption({
  props,
  t,
}: {
  readonly props: TestSendProps;
  readonly t: Translate;
}): ReactElement {
  const text = ((): ReactNode => {
    if (!props.configured) return t('test_not_configured');
    if (props.recipient === null) return t('test_no_address');
    if (props.mode === 'status') {
      return t.rich('send_test_status_caption', { email: props.recipient, bdi });
    }
    return t.rich('send_test_caption', {
      language: props.languageName ?? '',
      email: props.recipient,
      bdi,
    });
  })();
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

/** The test's state in words (UI-SPEC § Send a test to me, the result lines). */
function StateLine({
  state,
  canViewLog,
}: {
  readonly state: TestStateResponse;
  readonly canViewLog: boolean;
}): ReactElement {
  const t = useTranslations('mail');
  const f = useFormat();
  const time = (value: string | null): string => (value === null ? '' : f.dateTime(value));
  const words = ((): ReactNode => {
    if (state.status === 'sent') {
      return t.rich('test_sent', { email: state.recipient, time: time(state.sentAt), bdi });
    }
    if (state.status === 'failed') {
      return t('test_failed', { reason: t(`failure_reason.${state.failureReason ?? 'unknown'}`) });
    }
    if (state.status === 'retrying' && state.nextTryAt !== null) {
      return t('test_retrying', { time: time(state.nextTryAt) });
    }
    if (state.waitingForServer) return t('test_waiting');
    return t.rich('test_queued', { email: state.recipient, bdi });
  })();
  return (
    <>
      {state.status === 'sent' ? <Icon name="check" className="size-4" /> : null}
      <span>{words}</span>
      {canViewLog ? (
        <Link href={`${SENT_EMAILS_BASE}/${encodeURIComponent(state.id)}`} className="underline">
          {t('view_in_log')}
        </Link>
      ) : null}
    </>
  );
}

/** A test can go: mail is configured, the member has an address, the editor has a draft to send. */
function canSend(props: TestSendProps): boolean {
  const nothingToSend = props.mode === 'template' && props.draft === undefined;
  return props.configured && props.recipient !== null && !nothingToSend;
}

/** The line's words: a refusal in the feature's words, else the test's state once it is known (D-39). */
function ResultLine({
  failure,
  sent,
  test,
  canViewLog,
}: {
  /** A refusal (not a network or server failure, which is the inline error with Retry). */
  readonly failure: SendFailure | null;
  /** The last click was accepted: its state is the news. */
  readonly sent: boolean;
  readonly test: CommonApiResult<TestStateResponse>;
  readonly canViewLog: boolean;
}): ReactNode {
  const errorText = useErrorText(MAIL_ERRORS);
  if (failure !== null) return errorText(failure);
  if (!sent) return null;
  if (test.data !== undefined) return <StateLine state={test.data} canViewLog={canViewLog} />;
  return test.error === undefined ? null : errorText(test.error);
}

/**
 * "Send a test to me" (04.3 UI-SPEC § Send a test to me; D-04 on the editor, D-02 on the status
 * page, choice 4), shared by both pages. It sends only to the signed-in member's own address (the
 * caption names it; there is no address field, T-4.3-03): on the editor the previewed draft with
 * its unsaved changes, on the status page the fixed test. One `Idempotency-Key` per click, reused by
 * Retry (`useSendTest`). The result line under the button follows the queued test by re-reading its
 * state every 2 s while it is queued or retrying (`useTestState`, SWR `refreshInterval`, no effect)
 * and says queued, retrying, waiting for the server, sent or failed, with the log link for
 * administrators. Refusals stay in the line: not configured (disabled from the start), too many
 * tests (the seconds from `Retry-After`); a network or server failure is the kit's inline error with
 * Retry. No toast: the line is the feedback, in the area that acted. Text only: nothing here is
 * rendered as markup.
 */
export function TestSend(props: TestSendProps): ReactElement {
  const t = useTranslations('mail');
  const errorText = useErrorText(MAIL_ERRORS);
  const sender = useSendTest(props.mode === 'template' ? (props.templateId ?? '') : null);
  const [testId, setTestId] = useState<string | null>(null);
  const [failure, setFailure] = useState<SendFailure | null>(null);
  const test = useTestState(testId, props.onFinal);

  function settle(result: ApiResult<{ readonly id: string }>): void {
    if (result.ok) {
      setFailure(null);
      setTestId(result.data.id);
    } else {
      setTestId(null);
      setFailure(result);
    }
  }

  const retryable = failure !== null && isRetryableCode(failure.code);

  return (
    <div className="flex flex-col items-start gap-2">
      <Caption props={props} t={t} />
      <Button
        type="button"
        variant={props.variant}
        size="lg"
        disabled={!canSend(props) || sender.pending}
        aria-busy={sender.pending || undefined}
        onClick={() => {
          // A new click starts a new line: the last test's state or refusal is no longer the news.
          setTestId(null);
          setFailure(null);
          void sender.send(props.mode === 'template' ? props.draft : undefined).then(settle);
        }}
      >
        <Icon name="paper-plane" />
        {sender.pending ? t('sending_test') : t('send_test_to_me')}
      </Button>
      <p
        data-testid="test-send-line"
        aria-live="polite"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
      >
        <ResultLine
          failure={retryable ? null : failure}
          sent={failure === null}
          test={test}
          canViewLog={props.canViewLog}
        />
      </p>
      {retryable ? (
        <InlineError
          message={errorText(failure)}
          busy={sender.pending}
          onRetry={() => {
            void sender.retry().then(settle);
          }}
        />
      ) : null}
    </div>
  );
}
