'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import {
  NOT_FOUND_CODE,
  PREDEFINED_REPLIES_ERRORS,
  PREDEFINED_REPLIES_PATH,
  PREDEFINED_REPLIES_EXPORT_PATH,
  PREDEFINED_REPLIES_EXPORT_COLUMNS,
  predefinedRepliesHooks,
  predefinedRepliesPath,
} from '@/features/predefined-replies/api/predefined-replies.endpoints';
import {
  predefinedRepliesRowSchema,
  type PredefinedRepliesRow,
} from '@/features/predefined-replies/schemas/predefined-replies.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists, seedRow } from '@/lib/api/row-seed';

const LIST_BASE = '/setup/predefined-replies';

const itemRoute = (row: PredefinedRepliesRow): string =>
  `${LIST_BASE}/${encodeURIComponent(row.id)}`;

export function PredefinedRepliesList(): ReactElement {
  const t = useTranslations('predefined-replies');
  const tc = useTranslations('common');

  const [deleting, setDeleting] = useState<{
    readonly row: PredefinedRepliesRow;
    readonly open: boolean;
  } | null>(null);

  const remove = predefinedRepliesHooks.useRemove(deleting?.row.id ?? '0');
  const row = deleting?.row;

  const columns: readonly ListColumn<PredefinedRepliesRow>[] = [
    {
      id: 'name',
      header: t('predefined_replies_dt_name'),
      sortField: 'name',
      primary: true,
      cell: (item) => item.name,
    },
  ];

  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);

    if (outcome.ok) {
      toast.success(t('deleted_toast'), {
        duration: CLIENT_TIMINGS.toast.durationMs,
      });
    } else if (outcome.code === NOT_FOUND_CODE) {
      await revalidateLists(PREDEFINED_REPLIES_PATH);
    }

    return outcome;
  }

  return (
    <>
      <ListPageTemplate
        title={t('predefined_replies')}
        path={PREDEFINED_REPLIES_PATH}
        rowSchema={predefinedRepliesRowSchema}
        listBase={LIST_BASE}
        rowKey={(item) => item.id}
        rowHref={itemRoute}
        recordName={(item) => item.name}
        onRowOpen={(item) => {
          seedRow(predefinedRepliesPath(item.id), item);
        }}
        columns={columns}
        rowActions={(item) => [
          {
            id: 'edit',
            kind: 'main',
            icon: 'pen-to-square',
            label: tc('edit'),
            ariaLabel: t('edit_action_named', { name: item.name }),
            onSelect: () => {
              seedRow(predefinedRepliesPath(item.id), item);
              window.location.assign(itemRoute(item));
            },
          },
          {
            id: 'delete',
            kind: 'destructive',
            icon: 'trash-can',
            label: tc('delete'),
            ariaLabel: t('delete_action_named', { name: item.name }),
            onSelect: () => {
              setDeleting({ row: item, open: true });
            },
          },
        ]}
        createAction={{ label: t('new_predefined_reply'), href: `${LIST_BASE}/new` }}
        exportAction={{
          path: PREDEFINED_REPLIES_EXPORT_PATH,
          columns: PREDEFINED_REPLIES_EXPORT_COLUMNS,
          labels: {
            name: t('predefined_replies_dt_name'),
          },
        }}
        empty={{
          nothingYetHeading: t('empty_heading'),
          nothingYetBody: t('empty_body'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        recordsNoun={t('noun_predefined_replies')}
        featureErrors={PREDEFINED_REPLIES_ERRORS}
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
          noun: t('noun_predefined_reply'),
        })}
        confirmLabel={tc('delete_noun', {
          noun: t('noun_predefined_reply'),
        })}
        pendingLabel={tc('deleting_noun', {
          noun: t('noun_predefined_reply'),
        })}
        featureErrors={PREDEFINED_REPLIES_ERRORS}
        onConfirm={confirmDelete}
      />
    </>
  );
}

export const GuardedPredefinedRepliesList = withAuth(
  withPermission(PredefinedRepliesList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
