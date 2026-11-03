'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { cn } from 'cn';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  GROUP_IN_USE_CODE,
  KNOWLEDGE_BASE_GROUPS_EXPORT_PATH,
  KNOWLEDGE_BASE_GROUPS_PATH,
  knowledgeBaseGroupPath,
} from '@/features/knowledge-base/api/knowledge-base.endpoints';
import { KnowledgeBaseGroupModal } from '@/features/knowledge-base/components/KnowledgeBaseGroupModal';
import {
  useKnowledgeBaseGroups,
  useUpdateKnowledgeBaseGroup,
} from '@/features/knowledge-base/hooks/use-knowledge-base';
import type { KnowledgeBaseGroupRow } from '@/features/knowledge-base/schemas/knowledge-base.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { callApi } from '@/lib/api/call-api';
import { downloadFile, type DownloadFormat } from '@/lib/api/download-file';
import { revalidateLists } from '@/lib/api/row-seed';
import { useAutoDismiss } from '@/lib/hooks/use-auto-dismiss';

const PAGE_SIZE_10 = 10;
const PAGE_SIZE_25 = 25;
const PAGE_SIZE_50 = 50;
const PAGE_SIZE_100 = 100;
const PAGE_SIZE_ALL = 999999;

function ActiveSwitch({
  group,
  onMutated,
}: {
  readonly group: KnowledgeBaseGroupRow;
  readonly onMutated: () => Promise<void>;
}): ReactElement {
  const update = useUpdateKnowledgeBaseGroup(group.id);
  const [pending, setPending] = useState<boolean | null>(null);

  const toggle = async (checked: boolean): Promise<void> => {
    setPending(checked);
    const outcome = await update.trigger({ active: checked, disabled: !checked });
    setPending(null);
    if (outcome.ok) {
      await onMutated();
    }
  };

  return (
    <Switch
      checked={pending ?? group.active}
      disabled={update.isMutating}
      onCheckedChange={(checked) => {
        void toggle(checked);
      }}
      className="data-checked:bg-blue-600 data-[state=checked]:bg-blue-600 data-unchecked:bg-slate-200 data-[state=unchecked]:bg-slate-200"
    />
  );
}

type SortField = 'name' | 'active';

interface TableProps {
  readonly groups: readonly KnowledgeBaseGroupRow[];
  readonly sortField: SortField;
  readonly sortAsc: boolean;
  readonly onSort: (field: SortField) => void;
  readonly onEdit: (group: KnowledgeBaseGroupRow) => void;
  readonly onDelete: (group: KnowledgeBaseGroupRow) => void;
  readonly onMutated: () => Promise<void>;
}

function GroupsTable({
  groups,
  sortField,
  sortAsc,
  onSort,
  onEdit,
  onDelete,
  onMutated,
}: TableProps): ReactElement {
  const t = useTranslations('knowledge-base');

  return (
    <div className="overflow-x-auto">
      <Table className="w-full table-fixed">
        <TableHeader>
          <TableRow className="bg-slate-100 hover:bg-slate-100 border-y border-slate-200">
            <TableHead className="font-semibold text-slate-700 w-[45%] py-3 px-4 border-r border-slate-200">
              <button
                type="button"
                className="group w-full flex items-center justify-between pe-1 cursor-pointer select-none text-start font-semibold text-slate-700 text-sm focus:outline-none"
                onClick={() => {
                  onSort('name');
                }}
              >
                <span>{t('name')}</span>
                <span
                  className={cn(
                    'inline-flex items-center justify-center w-6 h-5 rounded bg-slate-200 text-slate-700 transition-opacity select-none',
                    sortField === 'name' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                  )}
                >
                  <Icon
                    name="chevron-down"
                    className={cn(
                      'size-4 text-slate-700 stroke-[2.5]',
                      sortField === 'name' && sortAsc && 'rotate-180',
                    )}
                  />
                </span>
              </button>
            </TableHead>
            <TableHead className="font-semibold text-slate-700 w-[35%] py-3 px-4 border-r border-slate-200">
              <button
                type="button"
                className="group w-full flex items-center justify-between pe-1 cursor-pointer select-none text-start font-semibold text-slate-700 text-sm focus:outline-none"
                onClick={() => {
                  onSort('active');
                }}
              >
                <span>{t('active')}</span>
                <span
                  className={cn(
                    'inline-flex items-center justify-center w-6 h-5 rounded bg-slate-200 text-slate-700 transition-opacity select-none',
                    sortField === 'active' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                  )}
                >
                  <Icon
                    name="chevron-down"
                    className={cn(
                      'size-4 text-slate-700 stroke-[2.5]',
                      sortField === 'active' && sortAsc && 'rotate-180',
                    )}
                  />
                </span>
              </button>
            </TableHead>
            <TableHead className="font-semibold text-slate-700 w-[20%] py-3 px-4 text-sm">
              <div className="w-full flex items-center justify-between pe-2 select-none font-semibold text-slate-700 text-sm">
                <span>{t('options')}</span>
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.id} className="hover:bg-slate-50/50 border-b border-slate-100">
              <TableCell className="w-[45%] py-3 px-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800 text-sm">{group.name}</span>
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    {group.totalArticles}
                  </span>
                </div>
              </TableCell>
              <TableCell className="w-[35%] py-3 px-4">
                <ActiveSwitch group={group} onMutated={onMutated} />
              </TableCell>
              <TableCell className="w-[20%] py-3 px-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={t('edit_action_named', { name: group.name })}
                    onClick={() => {
                      onEdit(group);
                    }}
                    className="p-1 text-slate-500 hover:text-slate-800 rounded cursor-pointer"
                  >
                    <Icon name="pen-to-square" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('delete_action_named', { name: group.name })}
                    onClick={() => {
                      onDelete(group);
                    }}
                    className="p-1 text-slate-500 hover:text-red-600 rounded cursor-pointer"
                  >
                    <Icon name="trash-can" className="h-4 w-4" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface ToolbarProps {
  readonly pageSize: number;
  readonly search: string;
  readonly onPageSizeChange: (val: number) => void;
  readonly onSearchChange: (val: string) => void;
  readonly onExport: (format: DownloadFormat | 'print') => void;
}

function GroupsToolbar({
  pageSize,
  search,
  onPageSizeChange,
  onSearchChange,
  onExport,
}: ToolbarProps): ReactElement {
  const t = useTranslations('knowledge-base');
  const tc = useTranslations('common');

  return (
    <div className="p-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200">
      <div className="flex items-center gap-2">
        <Select
          value={String(pageSize)}
          onValueChange={(val) => {
            onPageSizeChange(Number(val));
          }}
        >
          <SelectTrigger className="w-16 h-9 px-2.5 border border-slate-300 rounded-md text-sm text-slate-700 bg-white cursor-pointer focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus-visible:outline-none focus-visible:border-blue-600 focus-visible:ring-1 focus-visible:ring-blue-600 data-[state=open]:border-blue-600 data-[state=open]:ring-1 data-[state=open]:ring-blue-600 active:border-blue-600 active:ring-1 active:ring-blue-600">
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            position="popper"
            sideOffset={4}
            className="min-w-[var(--radix-select-trigger-width)] w-[var(--radix-select-trigger-width)] p-0 rounded-sm border border-slate-300 bg-white shadow-sm overflow-hidden"
          >
            <SelectItem
              value={String(PAGE_SIZE_10)}
              className="py-1.5 px-3 text-sm cursor-pointer rounded-none text-slate-700 hover:bg-slate-100 hover:text-slate-900 data-[state=checked]:bg-blue-700 data-[state=checked]:text-white data-[state=checked]:hover:bg-blue-700 data-[state=checked]:hover:text-white [&_svg]:hidden pe-3"
            >
              {t('page_size_10')}
            </SelectItem>
            <SelectItem
              value={String(PAGE_SIZE_25)}
              className="py-1.5 px-3 text-sm cursor-pointer rounded-none text-slate-700 hover:bg-slate-100 hover:text-slate-900 data-[state=checked]:bg-blue-700 data-[state=checked]:text-white data-[state=checked]:hover:bg-blue-700 data-[state=checked]:hover:text-white [&_svg]:hidden pe-3"
            >
              {t('page_size_25')}
            </SelectItem>
            <SelectItem
              value={String(PAGE_SIZE_50)}
              className="py-1.5 px-3 text-sm cursor-pointer rounded-none text-slate-700 hover:bg-slate-100 hover:text-slate-900 data-[state=checked]:bg-blue-700 data-[state=checked]:text-white data-[state=checked]:hover:bg-blue-700 data-[state=checked]:hover:text-white [&_svg]:hidden pe-3"
            >
              {t('page_size_50')}
            </SelectItem>
            <SelectItem
              value={String(PAGE_SIZE_100)}
              className="py-1.5 px-3 text-sm cursor-pointer rounded-none text-slate-700 hover:bg-slate-100 hover:text-slate-900 data-[state=checked]:bg-blue-700 data-[state=checked]:text-white data-[state=checked]:hover:bg-blue-700 data-[state=checked]:hover:text-white [&_svg]:hidden pe-3"
            >
              {t('page_size_100')}
            </SelectItem>
            <SelectItem
              value={String(PAGE_SIZE_ALL)}
              className="py-1.5 px-3 text-sm cursor-pointer rounded-none text-slate-700 hover:bg-slate-100 hover:text-slate-900 data-[state=checked]:bg-blue-700 data-[state=checked]:text-white data-[state=checked]:hover:bg-blue-700 data-[state=checked]:hover:text-white [&_svg]:hidden pe-3"
            >
              {t('page_size_all')}
            </SelectItem>
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm font-normal border border-slate-300 rounded-md text-slate-700 bg-white hover:bg-slate-50 cursor-pointer focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus-visible:outline-none focus-visible:border-blue-600 focus-visible:ring-1 focus-visible:ring-blue-600 active:border-blue-600 active:ring-1 active:ring-blue-600 data-[state=open]:border-blue-600 data-[state=open]:ring-1 data-[state=open]:ring-blue-600"
            >
              {tc('dt_button_export')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => {
                onExport('csv');
              }}
            >
              {tc('dt_button_csv')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                onExport('xlsx');
              }}
            >
              {tc('dt_button_excel')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                onExport('pdf');
              }}
            >
              {tc('dt_button_pdf')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                onExport('print');
              }}
            >
              {tc('dt_button_print')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center group">
        <label
          htmlFor="kb-groups-search"
          className="h-9 px-3 flex items-center justify-center border border-e-0 border-slate-300 rounded-s-md bg-white text-slate-500 cursor-pointer select-none shrink-0 group-focus-within:border-blue-600"
        >
          <Icon name="magnifying-glass" className="h-4 w-4 text-slate-500 shrink-0" />
        </label>
        <Input
          id="kb-groups-search"
          value={search}
          onChange={(e) => {
            onSearchChange(e.target.value);
          }}
          placeholder={`${tc('search')}...`}
          className="w-48 sm:w-60 h-9 text-sm border border-slate-300 rounded-s-none rounded-e-md placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus-visible:outline-none focus-visible:border-blue-600 focus-visible:ring-1 focus-visible:ring-blue-600 bg-white"
        />
      </div>
    </div>
  );
}

interface PaginationProps {
  readonly page: number;
  readonly totalPages: number;
  readonly startEntry: number;
  readonly endEntry: number;
  readonly totalEntries: number;
  readonly onPageChange: (page: number) => void;
}

function GroupsPagination({
  page,
  totalPages,
  startEntry,
  endEntry,
  totalEntries,
  onPageChange,
}: PaginationProps): ReactElement {
  const t = useTranslations('knowledge-base');
  const tc = useTranslations('common');

  return (
    <div className="p-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 text-sm text-slate-500">
      <div>
        {t('showing_entries', {
          start: startEntry,
          end: endEntry,
          total: totalEntries,
        })}
      </div>
      <div className="flex items-center gap-2 select-none">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => {
            onPageChange(page - 1);
          }}
          className={`text-sm px-1.5 py-0.5 rounded border border-transparent ${
            page <= 1
              ? 'text-slate-400 cursor-not-allowed'
              : 'text-slate-600 hover:text-slate-900 cursor-pointer focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 active:border-blue-600'
          }`}
        >
          {tc('previous')}
        </button>
        <button
          type="button"
          className="min-w-[28px] h-7 px-2 text-xs font-semibold rounded bg-slate-100 text-slate-800 border border-slate-200 inline-flex items-center justify-center cursor-pointer hover:border-blue-500 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 active:border-blue-600 active:ring-1 active:ring-blue-600"
        >
          {page}
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => {
            onPageChange(page + 1);
          }}
          className={`text-sm px-1.5 py-0.5 rounded border border-transparent ${
            page >= totalPages
              ? 'text-slate-400 cursor-not-allowed'
              : 'text-slate-600 hover:text-slate-900 cursor-pointer focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 active:border-blue-600'
          }`}
        >
          {tc('next')}
        </button>
      </div>
    </div>
  );
}

interface FloatAlertProps {
  readonly message: string;
  readonly onClose: () => void;
}

function FloatAlert({ message, onClose }: FloatAlertProps): ReactElement {
  return (
    <div
      role="alert"
      className="fixed top-5 end-5 z-[1031] min-w-[280px] max-w-sm bg-emerald-50 border border-slate-200/60 border-s-4 border-s-emerald-500 px-4 py-3 shadow-lg flex items-center justify-between gap-3 text-sm"
    >
      <div className="flex items-center gap-2.5">
        <Icon name="bell" className="size-4 text-emerald-600 shrink-0" />
        <span className="font-medium text-emerald-800">{message}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="text-slate-400 hover:text-slate-600 rounded cursor-pointer inline-flex items-center justify-center p-0.5"
      >
        <Icon name="xmark" className="size-4" />
      </button>
    </div>
  );
}

interface GroupDialogsProps {
  readonly modal: { open: boolean; group?: KnowledgeBaseGroupRow | null } | null;
  readonly defaultOrder: number;
  readonly onModalClose: () => void;
  readonly onModalSuccess: (action: 'created' | 'updated') => void;
}

function GroupDialogs({
  modal,
  defaultOrder,
  onModalClose,
  onModalSuccess,
}: GroupDialogsProps): ReactElement {
  const modalKey = modal?.group?.id ?? 'new';

  return (
    <>
      {modal?.open && (
        <KnowledgeBaseGroupModal
          key={modalKey}
          open={modal.open}
          group={modal.group}
          defaultOrder={defaultOrder}
          onClose={onModalClose}
          onSuccess={onModalSuccess}
        />
      )}
    </>
  );
}

function filterGroups(
  groups: readonly KnowledgeBaseGroupRow[],
  search: string,
): readonly KnowledgeBaseGroupRow[] {
  if (!search.trim()) return groups;
  const q = search.toLowerCase();
  return groups.filter(
    (g) => g.name.toLowerCase().includes(q) || (g.description?.toLowerCase().includes(q) ?? false),
  );
}

function sortGroups(
  groups: readonly KnowledgeBaseGroupRow[],
  sortField: SortField,
  sortAsc: boolean,
): readonly KnowledgeBaseGroupRow[] {
  return [...groups].sort((a, b) => {
    if (sortField === 'active') {
      const valA = a.active ? 1 : 0;
      const valB = b.active ? 1 : 0;
      const cmp = sortAsc ? valA - valB : valB - valA;
      if (cmp !== 0) return cmp;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    }
    const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return sortAsc ? cmp : -cmp;
  });
}

function paginateGroups(
  sorted: readonly KnowledgeBaseGroupRow[],
  page: number,
  pageSize: number,
): readonly KnowledgeBaseGroupRow[] {
  if (pageSize >= PAGE_SIZE_ALL) {
    return sorted;
  }
  const start = (page - 1) * pageSize;
  return sorted.slice(start, start + pageSize);
}

function getNextSort(currentField: SortField, currentAsc: boolean, nextField: SortField): boolean {
  if (currentField === nextField) {
    return !currentAsc;
  }
  return nextField !== 'active';
}

function getPaginationMeta(
  total: number,
  page: number,
  pageSize: number,
): { start: number; end: number; pages: number } {
  const isAll = pageSize >= PAGE_SIZE_ALL;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = isAll ? total : Math.min(page * pageSize, total);
  const pages = isAll ? 1 : Math.ceil(total / pageSize) || 1;
  return { start, end, pages };
}

export function KnowledgeBaseGroups(): ReactElement {
  const t = useTranslations('knowledge-base');
  const { data, mutate } = useKnowledgeBaseGroups();

  const [query, setQuery] = useState<{
    search: string;
    pageSize: number;
    page: number;
    sortAsc: boolean;
    sortField: SortField;
  }>({
    search: '',
    pageSize: PAGE_SIZE_25,
    page: 1,
    sortAsc: true,
    sortField: 'name',
  });

  const [modal, setModal] = useState<{
    open: boolean;
    group?: KnowledgeBaseGroupRow | null;
  } | null>(null);
  const [floatAlert, showFloatAlert, clearFloatAlert] = useAutoDismiss();

  const groups = useMemo(() => data?.data ?? [], [data?.data]);
  const filteredGroups = useMemo(() => filterGroups(groups, query.search), [groups, query.search]);
  const sortedGroups = useMemo(
    () => sortGroups(filteredGroups, query.sortField, query.sortAsc),
    [filteredGroups, query.sortAsc, query.sortField],
  );
  const pagedGroups = useMemo(
    () => paginateGroups(sortedGroups, query.page, query.pageSize),
    [sortedGroups, query.page, query.pageSize],
  );

  const handleDelete = async (group: KnowledgeBaseGroupRow): Promise<void> => {
    if (group.totalArticles > 0) {
      toast.error(t('errors.ERP-KNOWLEDGEBASE-0002'));
      return;
    }
    // eslint-disable-next-line no-alert -- Perfex CRM legacy delete confirmation prompt (Image 3)
    const confirmed = window.confirm(t('confirm_action_prompt'));
    if (!confirmed) return;

    const outcome = await callApi(knowledgeBaseGroupPath(group.id), {
      method: 'DELETE',
      schema: z.null(),
      expectNoContent: true,
    });
    if (outcome.ok) {
      showFloatAlert(t('deleted'));
      await revalidateLists(KNOWLEDGE_BASE_GROUPS_PATH);
      await mutate();
    } else {
      toast.error(
        outcome.code === GROUP_IN_USE_CODE ? t('errors.ERP-KNOWLEDGEBASE-0002') : outcome.code,
      );
    }
  };

  const handleModalSuccess = (action: 'created' | 'updated'): void => {
    if (action === 'updated') {
      showFloatAlert(t('updated_successfully'));
    } else {
      showFloatAlert(t('added_successfully'));
    }
    void mutate();
  };

  const handleExport = (format: DownloadFormat | 'print'): void => {
    if (format === 'print') {
      window.print();
      return;
    }
    const q = query.search.trim() ? query.search : undefined;
    void downloadFile(KNOWLEDGE_BASE_GROUPS_EXPORT_PATH, { format, q }, undefined, format);
  };

  const totalEntries = filteredGroups.length;
  const paginationMeta = getPaginationMeta(totalEntries, query.page, query.pageSize);

  return (
    <div className="min-h-full -m-4 md:-m-6 p-4 md:p-6 bg-zinc-100 space-y-4">
      {floatAlert && <FloatAlert message={floatAlert} onClose={clearFloatAlert} />}

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('groups')}</h1>
        <div>
          <Link
            href="/setup/knowledge-base"
            className="text-sm font-medium text-blue-600 hover:underline inline-flex items-center gap-1"
          >
            {t('articles_link')}
          </Link>
        </div>
      </div>

      <div>
        <Button
          type="button"
          onClick={() => {
            setModal({ open: true, group: null });
          }}
          className={cn(
            'bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-md px-3.5 py-2 inline-flex items-center gap-1.5 border border-slate-900 shadow-xs cursor-pointer transition-colors',
            'focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500 focus-visible:outline-none focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 active:border-blue-600 active:ring-2 active:ring-blue-500',
            modal?.open && !modal.group && 'border-blue-600 ring-2 ring-blue-500',
          )}
        >
          <span className="text-base leading-none font-bold">{t('add_symbol')}</span>
          {t('new_group')}
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-6">
          <p className="text-slate-600 text-sm">{t('no_groups_found')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
          <GroupsToolbar
            pageSize={query.pageSize}
            search={query.search}
            onPageSizeChange={(val) => {
              setQuery((prev) => ({ ...prev, pageSize: val, page: 1 }));
            }}
            onSearchChange={(val) => {
              setQuery((prev) => ({ ...prev, search: val, page: 1 }));
            }}
            onExport={handleExport}
          />

          <GroupsTable
            groups={pagedGroups}
            sortField={query.sortField}
            sortAsc={query.sortAsc}
            onSort={(field) => {
              setQuery((prev) => ({
                ...prev,
                sortField: field,
                sortAsc: getNextSort(prev.sortField, prev.sortAsc, field),
              }));
            }}
            onEdit={(group) => {
              setModal({ open: true, group });
            }}
            onDelete={(group) => {
              void handleDelete(group);
            }}
            onMutated={async () => {
              await mutate();
            }}
          />

          <GroupsPagination
            page={query.page}
            totalPages={paginationMeta.pages}
            startEntry={paginationMeta.start}
            endEntry={paginationMeta.end}
            totalEntries={totalEntries}
            onPageChange={(p) => {
              setQuery((prev) => ({ ...prev, page: p }));
            }}
          />
        </div>
      )}

      <GroupDialogs
        modal={modal}
        defaultOrder={groups.length + 1}
        onModalClose={() => {
          setModal(null);
        }}
        onModalSuccess={handleModalSuccess}
      />
    </div>
  );
}

export const GuardedKnowledgeBaseGroups = withAuth(
  withPermission(KnowledgeBaseGroups, { skeleton: 'list' }),
  { skeleton: 'list' },
);
