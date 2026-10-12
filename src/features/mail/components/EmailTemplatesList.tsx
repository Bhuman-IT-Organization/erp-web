'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/atoms/Icon';
import type { RowAction } from '@/components/molecules/RowActions';
import { SearchableMultiSelect } from '@/components/molecules/SearchableMultiSelect';
import { SearchableSelect } from '@/components/molecules/SearchableSelect';
import { StatusBadge } from '@/components/molecules/StatusBadge';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import type { FilterControl } from '@/components/organisms/FilterBar';
import { isLongText, readText } from '@/components/templates/EditableTable';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { PERMISSIONS } from '@/config/permissions';
import { MAIL_ERRORS, MAIL_TEMPLATES_PATH, mailPaths } from '@/features/mail/api/mail.endpoints';
import { useEmailTemplates } from '@/features/mail/hooks/use-email-templates';
import { useModuleActive, useTemplateActive } from '@/features/mail/hooks/use-template-active';
import { templateNameKey } from '@/features/mail/schemas/mail-names';
import {
  templateListItemSchema,
  type MailAudience,
  type TemplateListItem,
} from '@/features/mail/schemas/mail.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { replaceRowInLists, seedRow } from '@/lib/api/row-seed';
import { usePermissions } from '@/lib/auth/use-permissions';
import { useErrorText } from '@/lib/errors/use-error-text';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';
import { useListQueryState, type FilterValue, type ListFilterDef } from '@/lib/url/use-query-state';

/** The list's own route: where the return to the list is recorded and restored (D-28). */
export const EMAIL_TEMPLATES_BASE = '/setup/email-templates';
/** The sent-email log (plan 10), filtered by a template KEY. */
const SENT_EMAILS_BASE = '/setup/sent-emails';
/** Perfex's own Email Templates: a fixed relative link, never built from data (T-4.3-32). */
const PERFEX_TEMPLATES_HREF = '/admin/emails';
const templateRoute = (row: TemplateListItem): string => `${EMAIL_TEMPLATES_BASE}/${row.id}`;

/** The three filters (K1): `filter[module][in]`, `filter[translation][eq]`, `filter[active][eq]`, no defaults. */
const MODULE_FILTER = 'module[in]';
const TRANSLATION_FILTER = 'translation[eq]';
const ACTIVE_FILTER = 'active[eq]';
export const EMAIL_TEMPLATE_FILTERS: readonly ListFilterDef[] = [
  { key: MODULE_FILTER },
  { key: TRANSLATION_FILTER },
  { key: ACTIVE_FILTER },
];
/** The single selects' "All": no filter in the URL. */
const ALL = 'all';
/** One row is enough to read the list's meta: every module and the supported locales. */
const FACETS = { limit: 1 } as const;

/** "Sent to": the audience the template's definition declares; legacy `staff`, `contact`, ours for the pair. */
export const AUDIENCE_KEYS: Readonly<Record<MailAudience, string>> = {
  staff: 'staff',
  contact: 'contact',
  staff_or_contact: 'sent_to_staff_or_contact',
};

/** A single unbroken word (a key, a module) past 32 characters breaks anywhere inside the long-text box. */
const LONG_WORD = 'inline-block max-w-xs min-w-40 align-middle break-all whitespace-normal';

const asList = (value: FilterValue | undefined): readonly string[] =>
  value === undefined || typeof value === 'string' ? [] : value;
const asOne = (value: FilterValue | undefined): string =>
  typeof value === 'string' && value !== '' ? value : ALL;

/** A raw key or module: text in `<bdi>` (T-4.3-16), the long-text box when long. */
function rawWord(text: string): ReactElement {
  return <bdi className={isLongText(text) ? LONG_WORD : undefined}>{text}</bdi>;
}

/** The labels this screen reads a template by: its name, its module and a locale's name. */
function useTemplateLabels(): {
  readonly name: (row: TemplateListItem) => string;
  readonly module: (module: string) => string;
  readonly locale: (locale: string) => string;
} {
  const t = useTranslations('mail');
  return {
    name: (row) => {
      const key = templateNameKey(row.key);
      return key === null ? row.key : t(key);
    },
    module: (module) => t('module_label', { module }),
    locale: (locale) => t('locale_label', { locale }),
  };
}

const None = (): ReactElement => {
  const tc = useTranslations('common');
  return <span className="text-muted-foreground">{tc('none')}</span>;
};

/**
 * Languages: each supported locale that has a version, by name, then an `alert` badge
 * "{language} missing" for each supported locale without one (UI-SPEC § Email Templates list).
 */
function LanguagesCell({
  row,
  supported,
}: {
  readonly row: TemplateListItem;
  readonly supported: readonly string[];
}): ReactElement {
  const t = useTranslations('mail');
  const labels = useTemplateLabels();
  const present = [
    ...supported.filter((locale) => row.locales.includes(locale)),
    ...row.locales.filter((locale) => !supported.includes(locale)),
  ];
  const missing = supported.filter((locale) => !row.locales.includes(locale));
  if (present.length === 0 && missing.length === 0) return <None />;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {present.length === 0 ? null : <span>{present.map(labels.locale).join(', ')}</span>}
      {missing.map((locale) => (
        <StatusBadge
          key={locale}
          status="alert"
          label={t('translation_missing', { language: labels.locale(locale) })}
        />
      ))}
    </div>
  );
}

/**
 * The Active column (PATTERNS M11, the `StaffList` and Custom Fields form): an immediate action both
 * ways with its toast, no dialog, because it loses nothing and the same switch undoes it. Pending:
 * disabled and `aria-busy`; a failure puts it back and says so beside it, never retried (ADR-0031
 * §5). The saved row is swapped into every cached list page (no list request, D-36). A member
 * without `.edit` sees the status as a badge: a switch the api would refuse is not rendered (T-4.3-29).
 */
function ActiveCell({
  row,
  name,
  canEdit,
}: {
  readonly row: TemplateListItem;
  readonly name: string;
  readonly canEdit: boolean;
}): ReactElement {
  const t = useTranslations('mail');
  const active = useTemplateActive(row.id);
  const [state, setState] = useState<{
    readonly pending: boolean | null;
    readonly failed: boolean;
  }>({ pending: null, failed: false });
  if (!canEdit) {
    return row.active ? (
      <StatusBadge status="active" label={t('active')} />
    ) : (
      <StatusBadge status="inactive" label={t('inactive')} />
    );
  }

  async function toggle(next: boolean): Promise<void> {
    setState({ pending: next, failed: false });
    const outcome = await active.trigger({ active: next });
    if (outcome.ok) {
      await replaceRowInLists(
        MAIL_TEMPLATES_PATH,
        outcome.data,
        (one: TemplateListItem) => one.id === row.id,
      );
      toast.success(t(outcome.data.active ? 'enabled_toast' : 'disabled_toast'), {
        duration: CLIENT_TIMINGS.toast.durationMs,
      });
    }
    setState({ pending: null, failed: !outcome.ok });
  }

  return (
    // A click beside the switch is not "open the row" either.
    <div data-row-ignore="" className="flex items-center gap-2">
      <Switch
        checked={state.pending ?? row.active}
        disabled={active.isMutating}
        aria-busy={active.isMutating}
        aria-label={t('active_named', { name })}
        onCheckedChange={(next) => {
          void toggle(next);
        }}
      />
      {state.failed ? (
        <span role="status" className="text-destructive text-xs">
          {t('active_not_saved')}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Enable All and Disable All of the one module in the filter (Perfex's per-group links, choice 5),
 * outline buttons beside the search. Enable All applies at once; Disable All asks first, naming how
 * many active templates of the module stop sending (a count read, shown only once known, D-39).
 */
function ModuleActions({ module }: { readonly module: string }): ReactElement | null {
  const t = useTranslations('mail');
  const f = useFormat();
  const labels = useTemplateLabels();
  const errorText = useErrorText(MAIL_ERRORS);
  const count = useEmailTemplates({
    'filter[module][in]': module,
    'filter[active][eq]': '1',
    ...FACETS,
  });
  const all = useModuleActive();
  const [open, setOpen] = useState(false);
  if (count.data === undefined) return null;
  const total = count.data.meta.total ?? count.data.data.length;
  const amount = { count: total, countN: f.number(total) };

  async function enable(): Promise<void> {
    const outcome = await all.trigger({ module, active: true });
    if (outcome.ok) {
      const changed = outcome.data.changed;
      toast.success(t('enabled_many_toast', { count: changed, countN: f.number(changed) }), {
        duration: CLIENT_TIMINGS.toast.durationMs,
      });
    } else {
      toast.error(errorText(outcome), { duration: CLIENT_TIMINGS.toast.durationMs });
    }
  }

  async function disable(): Promise<ConfirmOutcome> {
    const outcome = await all.trigger({ module, active: false });
    if (outcome.ok) {
      const changed = outcome.data.changed;
      toast.success(t('disabled_many_toast', { count: changed, countN: f.number(changed) }), {
        duration: CLIENT_TIMINGS.toast.durationMs,
      });
    }
    return outcome;
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={all.isMutating}
        aria-busy={all.isMutating}
        onClick={() => {
          void enable();
        }}
      >
        {t('enable_all')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={all.isMutating}
        onClick={() => {
          // The count may have moved since it was read (a switch in the list): read it again.
          void count.mutate();
          setOpen(true);
        }}
      >
        {t('disable_all')}
      </Button>
      <ConfirmDialog
        kind="access"
        open={open}
        onOpenChange={setOpen}
        title={t('disable_all_title', { ...amount, module: labels.module(module) })}
        body={t('disable_all_body')}
        dismissLabel={t('keep_templates_active')}
        confirmLabel={t('disable_count_templates', amount)}
        pendingLabel={t('disabling_templates')}
        featureErrors={MAIL_ERRORS}
        onConfirm={disable}
      />
    </>
  );
}

/**
 * Setup > Email > Email Templates (Perfex's `admin/emails/email_templates.php`) on
 * `ListPageTemplate`: the scope notice with Perfex's link, search, the Module, Translation and
 * Status filters in the URL (K1, K2), the columns Template Name, Module, Sent to, Languages and
 * Active, the pager and every state in the D-39 order. There is no create: each template belongs
 * to a send point in a module's code (Perfex has none either). The row's Edit is one quiet outline
 * button and "Sent emails" (administrators only, the log is theirs, D-05) sits in the row menu, in
 * the sticky actions column (`compactRowActions`). Keys, modules and locales are React text only,
 * in `<bdi>` (T-4.3-16). Flow parity and the drops are in the feature README (FE-18).
 */
export function EmailTemplatesList(): ReactElement {
  const t = useTranslations('mail');
  const tc = useTranslations('common');
  const router = useRouter();
  const labels = useTemplateLabels();
  const { can, isAdmin } = usePermissions();
  const canView = can(PERMISSIONS.settings.emailTemplates.view);
  const canEdit = can(PERMISSIONS.settings.emailTemplates.edit);
  const [query] = useListQueryState(EMAIL_TEMPLATE_FILTERS);
  const facets = useEmailTemplates(FACETS);
  const supported = facets.data?.meta.locales ?? [];
  const chosenModules = asList(query.filters[MODULE_FILTER]);
  const oneModule = chosenModules.length === 1 ? (chosenModules[0] ?? null) : null;

  /** Opening a template records the list's URL and seeds the editor from the row (D-28, D-35). */
  const open = (row: TemplateListItem): void => {
    recordListReturn(EMAIL_TEMPLATES_BASE);
    seedRow(mailPaths.template(row.id), row);
    router.push(templateRoute(row));
  };

  const moduleOptions = (facets.data?.meta.modules ?? []).map((module) => ({
    value: module,
    label: labels.module(module),
  }));
  const single = (
    options: readonly { readonly value: string; readonly label: string }[],
  ): FilterControl['render'] =>
    function SingleFilter({ id, value, onChange, triggerText }) {
      return (
        <SearchableSelect
          id={id}
          options={options}
          value={asOne(value)}
          onChange={(next) => {
            onChange(next === null || next === ALL ? null : next);
          }}
          triggerText={triggerText}
        />
      );
    };
  const controls: readonly FilterControl[] = [
    {
      key: MODULE_FILTER,
      label: t('module'),
      inline: true,
      render: ({ id, value, onChange, triggerText }) => (
        <SearchableMultiSelect
          id={id}
          options={moduleOptions}
          value={asList(value)}
          onChange={(next) => {
            onChange(next);
          }}
          triggerText={triggerText}
          showChips={false}
        />
      ),
    },
    {
      key: TRANSLATION_FILTER,
      label: t('translation'),
      inline: true,
      render: single([
        { value: ALL, label: t('translation_all') },
        { value: 'complete', label: t('translation_complete') },
        { value: 'missing', label: t('translation_missing_filter') },
      ]),
    },
    {
      key: ACTIVE_FILTER,
      label: t('status'),
      inline: true,
      render: single([
        { value: '1', label: t('active') },
        { value: '0', label: t('inactive') },
        { value: ALL, label: t('status_all') },
      ]),
    },
  ];

  // Perfex's columns (`email_templates.php`: the name and its state) plus Node's Module, Sent to and
  // Languages (UI-SPEC § Columns); the row's actions follow them in the sticky column.
  const columns: readonly ListColumn<TemplateListItem>[] = [
    {
      id: 'name',
      header: t('email_templates_table_heading_name'),
      sortField: 'key',
      primary: true,
      cell: (row) => {
        const key = templateNameKey(row.key);
        return key === null ? rawWord(row.key) : readText(t(key));
      },
    },
    {
      id: 'module',
      header: t('module'),
      sortField: 'module',
      cell: (row) => rawWord(labels.module(row.module)),
    },
    {
      id: 'sentTo',
      header: t('sent_to'),
      hideBelow: 'md',
      cell: (row) => (row.audience === null ? <None /> : t(AUDIENCE_KEYS[row.audience])),
    },
    {
      id: 'languages',
      header: t('languages'),
      hideBelow: 'lg',
      cell: (row) => <LanguagesCell row={row} supported={supported} />,
    },
    {
      id: 'active',
      header: t('active'),
      cell: (row) => <ActiveCell row={row} name={labels.name(row)} canEdit={canEdit} />,
    },
  ];
  const rowActions = (row: TemplateListItem): readonly RowAction[] => {
    const name = labels.name(row);
    const edit: RowAction = {
      id: 'edit',
      kind: 'main',
      icon: 'pen-to-square',
      label: tc('edit'),
      ariaLabel: t('edit_named', { name }),
      onSelect: () => {
        open(row);
      },
    };
    if (!isAdmin) return [edit];
    return [
      edit,
      {
        id: 'sent-emails',
        kind: 'neutral',
        icon: 'inbox',
        label: t('view_sent_emails'),
        ariaLabel: t('view_sent_emails_named', { name }),
        href: `${SENT_EMAILS_BASE}?filter[template][in]=${encodeURIComponent(row.key)}`,
      },
    ];
  };

  const header: ReactNode = (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('email_templates')}</h1>
      <Alert data-testid="templates-scope-notice">
        <AlertDescription className="flex flex-col items-start gap-1">
          <p>{t('templates_scope_notice')}</p>
          {canView ? (
            <a
              href={PERFEX_TEMPLATES_HREF}
              className="text-foreground inline-flex items-center gap-1 underline underline-offset-4"
            >
              {t('open_perfex_templates')} <Icon name="external-link" className="size-3" />
              <span className="sr-only">{t('opens_in_perfex')}</span>
            </a>
          ) : null}
        </AlertDescription>
      </Alert>
    </div>
  );

  return (
    <ListPageTemplate
      title={t('email_templates')}
      header={header}
      path={MAIL_TEMPLATES_PATH}
      rowSchema={templateListItemSchema}
      filterBar={{ defs: EMAIL_TEMPLATE_FILTERS, controls }}
      {...(oneModule !== null && canEdit
        ? { toolbar: { beforeCreate: <ModuleActions key={oneModule} module={oneModule} /> } }
        : {})}
      listBase={EMAIL_TEMPLATES_BASE}
      rowKey={(row) => row.id}
      rowHref={templateRoute}
      recordName={labels.name}
      onRowOpen={(row) => {
        seedRow(mailPaths.template(row.id), row);
      }}
      columns={columns}
      rowActions={rowActions}
      compactRowActions
      empty={{
        nothingYetHeading: t('templates_empty_heading'),
        nothingYetBody: t('templates_empty_body'),
        noResultsHeading: () =>
          tc('no_match_filters_heading', { records: t('noun_email_templates') }),
        noResultsBody: tc('no_match_filters_body', { record: t('noun_email_template') }),
      }}
      recordsNoun={t('noun_email_templates')}
      featureErrors={MAIL_ERRORS}
    />
  );
}

/**
 * `/setup/email-templates` behind the two guards: the list skeleton until the session and `/me`
 * answer (D-39), then `ROUTE_GATES`' `settings.emailTemplates.view` (D-09, O-1); the api refuses
 * everyone else regardless.
 */
export const GuardedEmailTemplatesList = withAuth(
  withPermission(EmailTemplatesList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
