'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { InlineError } from '@/components/molecules/InlineError';
import { StatusBadge } from '@/components/molecules/StatusBadge';
import { PageSkeleton } from '@/components/organisms/PageSkeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PERMISSIONS } from '@/config/permissions';
import { MAIL_ERRORS } from '@/features/mail/api/mail.endpoints';
import { DefinitionList, type Definition } from '@/features/mail/components/SentEmailDetail';
import { sentEmailRoute } from '@/features/mail/components/SentEmailsList';
import { TestSend } from '@/features/mail/components/TestSend';
import { useEmailStatus } from '@/features/mail/hooks/use-email-status';
import type { StatusResponse } from '@/features/mail/schemas/mail.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { usePermissions } from '@/lib/auth/use-permissions';
import { useErrorText } from '@/lib/errors/use-error-text';
import { useFormat } from '@/lib/i18n/format';

/** Perfex's own SMTP Settings: a fixed relative link, never built from data (T-4.3-32). */
const PERFEX_SMTP_HREF = '/admin/settings?group=email';

/** The encryption as words: SSL, TLS, or Perfex's own "None". */
const ENCRYPTION_KEYS: Readonly<Record<NonNullable<StatusResponse['encryption']>, string>> = {
  ssl: 'encryption_ssl',
  tls: 'encryption_tls',
  none: 'smtp_encryption_none',
};

type Translate = ReturnType<typeof useTranslations<'mail'>>;

/** An address or a host: `<bdi>`, so it reads left to right in Arabic (3.2 D-34). */
const bdi = (chunks: ReactNode): ReactElement => <bdi>{chunks}</bdi>;

/** "View in Sent emails": the entry's permalink. */
function LogLink({ id, t }: { readonly id: string; readonly t: Translate }): ReactElement {
  return (
    <Link href={sentEmailRoute(id)} className="text-foreground underline underline-offset-4">
      {t('view_in_log')}
    </Link>
  );
}

/** Last send: "Sent at {time}" or "Failed at {time}: {reason}" with the link, or "Never". */
function LastSend({ status }: { readonly status: StatusResponse }): ReactElement {
  const t = useTranslations('mail');
  const f = useFormat();
  const last = status.lastSend;
  if (last === null) return <span>{t('never')}</span>;
  const time = f.dateTime(last.at);
  const words =
    last.status === 'sent'
      ? t('last_sent_at', { time })
      : t('last_failed_at', {
          time,
          reason: t(`failure_reason.${last.failureReason ?? 'unknown'}`),
        });
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      <span>{words}</span>
      <LogLink id={last.id} t={t} />
    </span>
  );
}

/** The Mail setup card's rows (04.3 UI-SPEC § Email status): every value read only, none an input. */
function useSetupRows(status: StatusResponse): readonly Definition[] {
  const t = useTranslations('mail');
  const tc = useTranslations('common');
  const f = useFormat();
  const none = <span className="text-muted-foreground">{tc('none')}</span>;
  const since = status.server.since;
  return [
    {
      term: t('status'),
      value: status.configured ? (
        <StatusBadge status="done" label={t('status_configured')} />
      ) : (
        <StatusBadge status="alert" label={t('status_not_configured')} />
      ),
    },
    {
      term: t('sender'),
      value:
        status.sender === null
          ? none
          : t.rich('sender_value', {
              name: status.sender.name,
              address: status.sender.address,
              bdi,
            }),
    },
    {
      term: t('settings_email_host'),
      value: status.host === null ? none : <bdi>{status.host}</bdi>,
    },
    {
      term: t('settings_email_port'),
      value:
        status.port === null ? none : <span className="tabular-nums">{String(status.port)}</span>,
    },
    {
      term: t('smtp_encryption'),
      value: status.encryption === null ? none : t(ENCRYPTION_KEYS[status.encryption]),
    },
    {
      term: t('mail_server'),
      value: status.server.answering
        ? t('server_answering')
        : t('server_not_answering', { time: since === null ? 'none' : f.dateTime(since) }),
    },
    { term: t('last_send'), value: <LastSend status={status} />, full: true },
  ];
}

/** The page once the status is known: the notices, the Mail setup card, the caption, the test card. */
function StatusPage({
  status,
  reread,
}: {
  readonly status: StatusResponse;
  readonly reread: () => void;
}): ReactElement {
  const t = useTranslations('mail');
  const { can, isAdmin } = usePermissions();
  const rows = useSetupRows(status);
  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        {status.configured ? null : (
          <Alert data-testid="not-configured-notice">
            <Icon name="triangle-exclamation" />
            <AlertDescription>{t('not_configured_notice')}</AlertDescription>
          </Alert>
        )}
        {status.server.answering ? null : (
          <Alert data-testid="paused-notice">
            <Icon name="triangle-exclamation" />
            <AlertDescription>{t('paused_notice')}</AlertDescription>
          </Alert>
        )}
        <section
          data-testid="mail-setup"
          aria-labelledby="mail-setup-heading"
          className="bg-card flex flex-col gap-4 rounded-lg border p-6"
        >
          <h2 id="mail-setup-heading" className="text-lg font-semibold">
            {t('mail_setup')}
          </h2>
          <DefinitionList rows={rows} />
        </section>
        {can(PERMISSIONS.settings.general.view) ? (
          <div
            data-testid="deployment-caption"
            className="text-muted-foreground flex flex-col items-start gap-1 text-xs"
          >
            <p>{t('deployment_caption')}</p>
            <a
              href={PERFEX_SMTP_HREF}
              className="text-foreground inline-flex items-center gap-1 underline underline-offset-4"
            >
              {t('perfex_smtp_settings')} <Icon name="external-link" className="size-3" />
              <span className="sr-only">{t('opens_in_perfex')}</span>
            </a>
          </div>
        ) : null}
      </div>
      <section
        data-testid="test-card"
        aria-labelledby="test-card-heading"
        className="bg-card flex flex-col gap-4 rounded-lg border p-6"
      >
        <h2 id="test-card-heading" className="text-lg font-semibold">
          {t('settings_send_test_email_heading')}
        </h2>
        <TestSend
          mode="status"
          variant="default"
          configured={status.sendTest.configured}
          recipient={status.sendTest.recipient}
          canViewLog={isAdmin}
          onFinal={reread}
        />
      </section>
    </div>
  );
}

/**
 * Setup > Email > Email status (04.3 UI-SPEC § Email status, D-02; Perfex's
 * `application/views/admin/settings/includes/email.php`, its SMTP fields and "Send Test Email"):
 * the not-configured and paused notices, the read-only Mail setup card (status, sender, SMTP host,
 * port, encryption, whether the mail server answers, the last send), the caption that these are the
 * deployment's settings with Perfex's SMTP Settings link (for `settings.general.view`), and the
 * "Send Test Email" card with "Send a test to me" (`TestSend`, primary here, to the member's own
 * address only). When the test reaches sent or failed the status is read again, so Last send moves.
 * Nothing here is an input and no SMTP user name or password is ever shown (T-4.3-06); hosts and
 * addresses are React text in `<bdi>` (T-4.3-16).
 */
export function EmailStatus(): ReactElement {
  const t = useTranslations('mail');
  const errorText = useErrorText(MAIL_ERRORS);
  const status = useEmailStatus();
  const { data, error, mutate } = status;
  let body: ReactElement;
  if (data !== undefined) {
    body = (
      <StatusPage
        status={data}
        reread={() => {
          void mutate();
        }}
      />
    );
  } else if (error === undefined) {
    body = <PageSkeleton variant="form" testId="email-status-loading" />;
  } else {
    body = (
      <InlineError
        message={errorText(error)}
        busy={status.isValidating}
        {...(error.retryable
          ? {
              onRetry: () => {
                void mutate();
              },
            }
          : {})}
      />
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('email_status')}</h1>
      {body}
    </div>
  );
}

/**
 * `/setup/email-status` behind the two guards: the form skeleton until the session and `/me`
 * answer (D-39), then `ROUTE_GATES`' administrator gate (D-02); the api refuses everyone else.
 */
export const GuardedEmailStatus = withAuth(withPermission(EmailStatus, { skeleton: 'form' }), {
  skeleton: 'form',
});
