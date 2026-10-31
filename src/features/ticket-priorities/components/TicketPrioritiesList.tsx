'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import {
  NOT_FOUND_CODE,
  TICKET_PRIORITIES_ERRORS,
  TICKET_PRIORITIES_EXPORT_COLUMNS,
  TICKET_PRIORITIES_EXPORT_PATH,
  TICKET_PRIORITIES_PATH,
  ticketPrioritiesPath,
} from '@/features/ticket-priorities/api/ticket-priorities.endpoints';
import { useDeleteTicketPriority } from '@/features/ticket-priorities/hooks/use-ticket-priorities';
import {
  ticketPrioritiesRowSchema,
  type TicketPrioritiesRow,
} from '@/features/ticket-priorities/schemas/ticket-priorities.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists, seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';

/** The list's own route: where the return to the list is recorded and restored. */
const LIST_BASE = '/setup/ticket-priorities';
const itemRoute = (row: TicketPrioritiesRow): string =>
  `${LIST_BASE}/${encodeURIComponent(row.id)}`;

/**
 * The Ticket Priorities list of Perfex's `admin/tickets/priorities` on the kit's
 * `ListPageTemplate`: the template owns the URL state, the search, the sort, the pager, every
 * state (loading, empty, no results, error, loaded) and the Export menu; this screen owns the two
 * columns, ID and Ticket Priority Name, the labelled Edit and Delete, and the delete dialog. No bulk
 * action: Perfex has none here. Every visible string is a key (FE-19), classes are the kit's, and a
 * name is rendered as React text only, never markup.
 *
 * **Delete** is ConfirmDialog kind 1. The row carries no usage, so the api decides: a 409
 * `ERP-TICKETPRIORITIES-0001` (a ticket uses it) or `-0002` (the email-piping default) stays inside
 * the dialog in the feature's words; a 404 means the list is stale, so the list pages ask again;
 * a 204 toasts and the hook revalidates the list pages.
 */
export function TicketPrioritiesList(): ReactElement {
  const t = useTranslations('ticket-priorities');
  const ts = useTranslations('shell');
  const tc = useTranslations('common');
  const router = useRouter();
  const [deleting, setDeleting] = useState<{
    readonly row: TicketPrioritiesRow;
    readonly open: boolean;
  } | null>(null);
  // One mutation for the list's one dialog, keyed on the row it names (never triggered while none).
  const remove = useDeleteTicketPriority(deleting?.row.id ?? '0');
  const noun = t('ticket_priority_lowercase');

  /** Opening a priority: record the list's URL and scroll, seed the form from the row. */
  const open = (row: TicketPrioritiesRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(ticketPrioritiesPath(row.id), row);
    router.push(itemRoute(row));
  };

  /** The delete's outcome, shown by the dialog: a refusal stays inside it. */
  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);
    if (outcome.ok) {
      toast.success(t('deleted_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    } else if (outcome.code === NOT_FOUND_CODE) {
      await revalidateLists(TICKET_PRIORITIES_PATH);
    }
    return outcome;
  }

  // Perfex's columns: ID and Priority Name (`ticket_priority_dt_name`); the actions column is the template's.
  const columns: readonly ListColumn<TicketPrioritiesRow>[] = [
    {
      id: 'id',
      header: t('id'),
      sortField: 'id',
      cell: (one) => <bdi className="tabular-nums">{one.id}</bdi>,
    },
    {
      id: 'name',
      header: t('ticket_priority_dt_name'),
      sortField: 'name',
      primary: true,
      cell: (one) => one.name,
    },
  ];

  return (
    <>
      <ListPageTemplate
        title={ts('acs_ticket_priority_submenu')}
        path={TICKET_PRIORITIES_PATH}
        rowSchema={ticketPrioritiesRowSchema}
        listBase={LIST_BASE}
        rowKey={(one) => one.id}
        rowHref={itemRoute}
        recordName={(one) => one.name}
        // The record opens at once from the row it was clicked on.
        onRowOpen={(one) => {
          seedRow(ticketPrioritiesPath(one.id), one);
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
        createAction={{ label: t('new_ticket_priority'), href: `${LIST_BASE}/new` }}
        empty={{
          nothingYetHeading: t('no_ticket_priorities_found'),
          nothingYetBody: t('empty_body'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        exportAction={{
          path: TICKET_PRIORITIES_EXPORT_PATH,
          columns: TICKET_PRIORITIES_EXPORT_COLUMNS,
          labels: {
            id: t('id'),
            name: t('ticket_priority_dt_name'),
          },
        }}
        recordsNoun={t('noun_ticket_priorities')}
        featureErrors={TICKET_PRIORITIES_ERRORS}
      />
      <ConfirmDialog
        kind="destructive"
        open={deleting?.open === true}
        onOpenChange={(next) => {
          setDeleting((current) => (current === null ? null : { ...current, open: next }));
        }}
        title={t('delete_title', { name: deleting?.row.name ?? '' })}
        body={t('delete_body')}
        dismissLabel={tc('keep_noun', { noun })}
        confirmLabel={tc('delete_noun', { noun })}
        pendingLabel={tc('deleting_noun', { noun })}
        featureErrors={TICKET_PRIORITIES_ERRORS}
        onConfirm={confirmDelete}
      />
    </>
  );
}

/**
 * `/setup/ticket-priorities` behind the two guards: a list skeleton until the session and `/me`
 * answer, then the gate `ROUTE_GATES` declares for the path (`src/config/route-gates.ts`).
 */
export const GuardedTicketPrioritiesList = withAuth(
  withPermission(TicketPrioritiesList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
