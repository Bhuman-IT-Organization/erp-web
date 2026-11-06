'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import {
  ANNOUNCEMENTS_ERRORS,
  ANNOUNCEMENTS_EXPORT_COLUMNS,
  ANNOUNCEMENTS_EXPORT_PATH,
  ANNOUNCEMENTS_PATH,
  announcementsPath,
  NOT_FOUND_CODE,
} from '@/features/announcements/api/announcements.endpoints';
import { useDeleteAnnouncement } from '@/features/announcements/hooks/use-announcements';
import {
  announcementsRowSchema,
  type AnnouncementsRow,
} from '@/features/announcements/schemas/announcements.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists, seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';

/** The list's own route: where the return to the list is recorded and restored. */
const LIST_BASE = '/setup/announcements';
const itemRoute = (row: AnnouncementsRow): string => `${LIST_BASE}/${encodeURIComponent(row.id)}`;

/** A delete refused because the row is already gone (404): the list pages ask again. */
const STALE_LIST_CODES: readonly string[] = [NOT_FOUND_CODE];

/**
 * The Announcements list on the kit's `ListPageTemplate`: the template owns the URL state, the
 * search, the sort, the pager and every state (loading, empty, no results, error, loaded); this
 * screen owns Perfex's Subject and Date columns, the labelled Edit and Delete and the delete dialog.
 * Every visible string is a key, and a name is rendered as React text only, never markup.
 */
export function AnnouncementsList(): ReactElement {
  const t = useTranslations('announcements');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  const [deleting, setDeleting] = useState<{
    readonly row: AnnouncementsRow;
    readonly open: boolean;
  } | null>(null);
  // One mutation for the list's one dialog, keyed on the row it names (never triggered while none).
  const remove = useDeleteAnnouncement(deleting?.row.id ?? '0');
  const noun = t('announcement_lowercase');

  /** Opening an announcement: record the list's URL and scroll, seed the form from the row. */
  const open = (row: AnnouncementsRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(announcementsPath(row.id), row);
    router.push(itemRoute(row));
  };

  /** The delete's outcome, shown by the dialog: a refusal stays inside it. */
  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);
    if (outcome.ok) {
      toast.success(t('deleted_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    } else if (STALE_LIST_CODES.includes(outcome.code)) {
      await revalidateLists(ANNOUNCEMENTS_PATH);
    }
    return outcome;
  }

  const columns: readonly ListColumn<AnnouncementsRow>[] = [
    {
      id: 'name',
      header: t('announcement_name'),
      sortField: 'name',
      primary: true,
      cell: (one) => one.name,
    },
    {
      id: 'dateadded',
      header: t('date_added'),
      sortField: 'dateadded',
      cell: (one) => <time dateTime={one.dateAdded}>{f.dateTime(one.dateAdded)}</time>,
    },
  ];

  const row = deleting?.row;

  return (
    <>
      <ListPageTemplate
        title={t('announcements')}
        path={ANNOUNCEMENTS_PATH}
        rowSchema={announcementsRowSchema}
        listBase={LIST_BASE}
        rowKey={(one) => one.id}
        rowHref={itemRoute}
        recordName={(one) => one.name}
        onRowOpen={(one) => {
          seedRow(announcementsPath(one.id), one);
        }}
        columns={columns}
        rowActions={(one) => [
          {
            id: 'edit',
            kind: 'main',
            icon: 'pen-to-square',
            label: tc('edit'),
            ariaLabel: t('edit_action_named', { name: one.name }),
            onSelect: () => {
              open(one);
            },
          },
          {
            id: 'delete',
            kind: 'destructive',
            icon: 'trash-can',
            label: tc('delete'),
            ariaLabel: t('delete_action_named', { name: one.name }),
            onSelect: () => {
              setDeleting({ row: one, open: true });
            },
          },
        ]}
        createAction={{ label: t('new_announcement'), href: `${LIST_BASE}/new` }}
        exportAction={{
          path: ANNOUNCEMENTS_EXPORT_PATH,
          columns: ANNOUNCEMENTS_EXPORT_COLUMNS,
          labels: {
            id: t('announcement_id'),
            name: t('announcement_name'),
            dateadded: t('date_added'),
          },
        }}
        empty={{
          nothingYetHeading: t('empty_heading'),
          nothingYetBody: t('empty_body'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        recordsNoun={t('announcement_lowercase')}
        featureErrors={ANNOUNCEMENTS_ERRORS}
      />
      <ConfirmDialog
        kind="destructive"
        open={deleting?.open === true}
        onOpenChange={(next) => {
          setDeleting((current) => (current === null ? null : { ...current, open: next }));
        }}
        title={t('delete_title', { name: row?.name ?? '' })}
        body={t('delete_body')}
        dismissLabel={tc('keep_noun', { noun })}
        confirmLabel={tc('delete_noun', { noun })}
        pendingLabel={tc('deleting_noun', { noun })}
        featureErrors={ANNOUNCEMENTS_ERRORS}
        onConfirm={confirmDelete}
      />
    </>
  );
}

/** `/setup/announcements` behind the two guards: a list skeleton, then the gate `ROUTE_GATES` declares. */
export const GuardedAnnouncementsList = withAuth(
  withPermission(AnnouncementsList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
