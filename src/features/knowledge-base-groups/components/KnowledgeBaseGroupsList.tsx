'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/molecules/StatusBadge';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import { Switch } from '@/components/ui/switch';
import { PERMISSIONS } from '@/config/permissions';
import {
  GROUP_IN_USE_CODE,
  KNOWLEDGE_BASE_GROUPS_ERRORS,
  KNOWLEDGE_BASE_GROUPS_EXPORT_COLUMNS,
  KNOWLEDGE_BASE_GROUPS_EXPORT_PATH,
  KNOWLEDGE_BASE_GROUPS_PATH,
  knowledgeBaseGroupPath,
  NOT_FOUND_CODE,
} from '@/features/knowledge-base-groups/api/knowledge-base-groups.endpoints';
import {
  useDeleteKnowledgeBaseGroup,
  useUpdateKnowledgeBaseGroupActive,
} from '@/features/knowledge-base-groups/hooks/use-knowledge-base-groups';
import {
  knowledgeBaseGroupRowSchema,
  type KnowledgeBaseGroupRow,
} from '@/features/knowledge-base-groups/schemas/knowledge-base-groups.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { replaceRowInLists, revalidateLists, seedRow } from '@/lib/api/row-seed';
import { usePermissions } from '@/lib/auth/use-permissions';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';

const LIST_BASE = '/setup/knowledge-base-groups';

const itemRoute = (row: KnowledgeBaseGroupRow): string =>
  `${LIST_BASE}/${encodeURIComponent(row.id)}`;

function ActiveCell({
  group,
  canEdit,
}: {
  readonly group: KnowledgeBaseGroupRow;
  readonly canEdit: boolean;
}): ReactElement {
  const t = useTranslations('knowledge-base-groups');
  const update = useUpdateKnowledgeBaseGroupActive(group.id);
  const [state, setState] = useState<{
    readonly pending: boolean | null;
    readonly failed: boolean;
  }>({ pending: null, failed: false });

  if (!canEdit) {
    return (
      <StatusBadge
        status={group.active ? 'active' : 'inactive'}
        label={t(group.active ? 'active' : 'inactive')}
      />
    );
  }

  const toggle = async (checked: boolean): Promise<void> => {
    setState({ pending: checked, failed: false });
    const outcome = await update.trigger({ disabled: !checked });
    if (outcome.ok) {
      await replaceRowInLists(
        KNOWLEDGE_BASE_GROUPS_PATH,
        { ...group, active: outcome.data.active },
        (one: KnowledgeBaseGroupRow) => one.id === group.id,
      );
      toast.success(t(outcome.data.active ? 'activated_toast' : 'deactivated_toast'), {
        duration: CLIENT_TIMINGS.toast.durationMs,
      });
    }
    setState({ pending: null, failed: !outcome.ok });
  };

  return (
    <div data-row-ignore="" className="flex items-center gap-2">
      <Switch
        checked={state.pending ?? group.active}
        disabled={update.isMutating}
        aria-label={t('toggle_active_named', { name: group.name })}
        onCheckedChange={(checked) => {
          void toggle(checked);
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

export function KnowledgeBaseGroupsList(): ReactElement {
  const t = useTranslations('knowledge-base-groups');
  const tc = useTranslations('common');
  const router = useRouter();
  const { can } = usePermissions();

  const canCreate = can(PERMISSIONS.knowledgeBase.articles.create);
  const canEdit = can(PERMISSIONS.knowledgeBase.articles.edit);
  const canDelete = can(PERMISSIONS.knowledgeBase.articles.delete);

  const [deleting, setDeleting] = useState<{
    readonly row: KnowledgeBaseGroupRow;
    readonly open: boolean;
  } | null>(null);

  const remove = useDeleteKnowledgeBaseGroup(deleting?.row.id ?? '0');

  const open = (row: KnowledgeBaseGroupRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(knowledgeBaseGroupPath(row.id), row);
    router.push(itemRoute(row));
  };

  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);

    if (outcome.ok) {
      toast.success(t('deleted_toast'), {
        duration: CLIENT_TIMINGS.toast.durationMs,
      });
      setDeleting(null);
    } else if (outcome.code === NOT_FOUND_CODE || outcome.code === GROUP_IN_USE_CODE) {
      await revalidateLists(KNOWLEDGE_BASE_GROUPS_PATH);
    }

    return outcome;
  }

  const columns: readonly ListColumn<KnowledgeBaseGroupRow>[] = [
    {
      id: 'name',
      header: t('name'),
      sortField: 'name',
      primary: true,
      cell: (one) => (
        <div className="flex items-center gap-2">
          <span>{one.name}</span>
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            <span aria-hidden="true">{one.totalArticles}</span>
            <span className="sr-only">{t('total_articles', { count: one.totalArticles })}</span>
          </span>
        </div>
      ),
    },
    {
      id: 'active',
      header: t('active'),
      sortField: 'active',
      cell: (one) => <ActiveCell group={one} canEdit={canEdit} />,
    },
  ];

  const row = deleting?.row;

  return (
    <>
      <ListPageTemplate
        title={t('groups')}
        header={
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">{t('groups')}</h1>
            <div>
              <Link
                href="/admin/knowledge_base"
                className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
              >
                {t('articles_link')}
              </Link>
            </div>
          </div>
        }
        path={KNOWLEDGE_BASE_GROUPS_PATH}
        rowSchema={knowledgeBaseGroupRowSchema}
        listBase={LIST_BASE}
        rowKey={(one) => one.id}
        rowHref={itemRoute}
        recordName={(one) => one.name}
        onRowOpen={(one) => {
          seedRow(knowledgeBaseGroupPath(one.id), one);
        }}
        columns={columns}
        rowActions={(one) => [
          ...(canEdit
            ? [
                {
                  id: 'edit',
                  kind: 'main' as const,
                  icon: 'pen-to-square' as const,
                  label: tc('edit'),
                  ariaLabel: t('edit_action_named', { name: one.name }),
                  onSelect: () => {
                    open(one);
                  },
                },
              ]
            : []),
          ...(canDelete
            ? [
                {
                  id: 'delete',
                  kind: 'destructive' as const,
                  icon: 'trash-can' as const,
                  label: tc('delete'),
                  ariaLabel: t('delete_action_named', { name: one.name }),
                  onSelect: () => {
                    setDeleting({ row: one, open: true });
                  },
                },
              ]
            : []),
        ]}
        createAction={
          canCreate
            ? {
                label: t('new_group'),
                href: `${LIST_BASE}/new`,
              }
            : null
        }
        exportAction={{
          path: KNOWLEDGE_BASE_GROUPS_EXPORT_PATH,
          columns: KNOWLEDGE_BASE_GROUPS_EXPORT_COLUMNS,
          labels: {
            id: t('id'),
            name: t('name'),
            color: t('color'),
            groupOrder: t('order'),
            active: t('active'),
            totalArticles: t('articles'),
          },
        }}
        empty={{
          nothingYetHeading: t('empty_heading'),
          nothingYetBody: t('empty_body'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        recordsNoun={t('noun_knowledge_base_groups')}
        featureErrors={KNOWLEDGE_BASE_GROUPS_ERRORS}
      />

      <ConfirmDialog
        kind="destructive"
        open={deleting?.open === true}
        onOpenChange={(next) => {
          setDeleting((current) => (current === null ? null : { ...current, open: next }));
        }}
        title={t('delete_title', { name: row?.name ?? '' })}
        body={t('delete_body')}
        dismissLabel={tc('keep_noun', {
          noun: t('noun_knowledge_base_group'),
        })}
        confirmLabel={tc('delete_noun', {
          noun: t('noun_knowledge_base_group'),
        })}
        pendingLabel={tc('deleting_noun', {
          noun: t('noun_knowledge_base_group'),
        })}
        featureErrors={KNOWLEDGE_BASE_GROUPS_ERRORS}
        refusal={(code) => (code === GROUP_IN_USE_CODE ? t('is_referenced') : undefined)}
        refusedCode={row && row.totalArticles > 0 ? GROUP_IN_USE_CODE : undefined}
        onConfirm={confirmDelete}
      />
    </>
  );
}

export const GuardedKnowledgeBaseGroupsList = withAuth(
  withPermission(KnowledgeBaseGroupsList, { skeleton: 'list' }),
  { skeleton: 'list' },
);

export const KnowledgeBaseGroups = KnowledgeBaseGroupsList;
export const GuardedKnowledgeBaseGroups = GuardedKnowledgeBaseGroupsList;
