'use client';

import type { KeyboardEvent } from 'react';
import type { TicketPriority } from '@/lib/hooks/useTicketPriorities';
import { PRIORITY_NAME_MAX } from '../api/schemas';
import { LABELS, STYLES } from '../schemas/ticket-priorities.constants';
import { getPriorityId } from '../schemas/ticket-priorities.validation';
import type { TableApi } from '../hooks/use-priorities-table';

type RowMode = 'edit' | 'confirm' | 'view';

interface RowProps {
  item: TicketPriority;
  table: TableApi;
}

function rowMode(id: number, editingId: number | null, confirmId: number | null): RowMode {
  if (editingId === id) return 'edit';
  if (confirmId === id) return 'confirm';
  return 'view';
}

function EditCell({ item, table }: RowProps) {
  const id = getPriorityId(item);
  const tone = table.editError === null ? STYLES.inputOk : STYLES.inputError;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') void table.saveEdit(item);
    if (e.key === 'Escape') table.cancelEdit();
  };

  return (
    <div>
      <input
        autoFocus
        value={table.editValue}
        maxLength={PRIORITY_NAME_MAX}
        disabled={table.busy}
        onChange={(e) => {
          table.changeEdit(id, e.target.value);
        }}
        onKeyDown={onKeyDown}
        className={`w-full max-w-xs rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 ${tone}`}
      />
      {table.editError !== null && <p className="mt-1 text-xs text-red-500">{table.editError}</p>}
    </div>
  );
}

function EditActions({ item, table }: RowProps) {
  const label = table.busy ? LABELS.saving : LABELS.save;
  return (
    <div className="flex justify-end gap-2">
      <button
        onClick={() => {
          void table.saveEdit(item);
        }}
        disabled={table.busy || table.editError !== null}
        className={STYLES.primaryBtn}
      >
        {label}
      </button>
      <button onClick={table.cancelEdit} disabled={table.busy} className={STYLES.neutralBtn}>
        {LABELS.cancel}
      </button>
    </div>
  );
}

function ConfirmActions({ item, table }: RowProps) {
  const id = getPriorityId(item);
  const label = table.busy ? LABELS.deleting : LABELS.yes;
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-gray-600">{LABELS.confirmDelete}</span>
      <button
        onClick={() => {
          void table.confirmDelete(id);
        }}
        disabled={table.busy}
        className={STYLES.dangerBtn}
      >
        {label}
      </button>
      <button onClick={table.cancelDelete} disabled={table.busy} className={STYLES.neutralBtn}>
        {LABELS.no}
      </button>
    </div>
  );
}

function ViewActions({ item, table }: RowProps) {
  const id = getPriorityId(item);
  return (
    <div className="flex justify-end gap-2">
      <button
        onClick={() => {
          table.startEdit(item);
        }}
        className={STYLES.editBtn}
      >
        {LABELS.edit}
      </button>
      <button
        onClick={() => {
          table.askDelete(id);
        }}
        className={STYLES.deleteBtn}
      >
        {LABELS.delete}
      </button>
    </div>
  );
}

function RowActions({ mode, item, table }: RowProps & { mode: RowMode }) {
  if (mode === 'edit') return <EditActions item={item} table={table} />;
  if (mode === 'confirm') return <ConfirmActions item={item} table={table} />;
  return <ViewActions item={item} table={table} />;
}

/**
 * One table row: id, name (inline editable) and its action buttons.
 */
export function PriorityRow({ item, table }: RowProps) {
  const id = getPriorityId(item);
  const mode = rowMode(id, table.editingId, table.confirmDeleteId);

  return (
    <tr>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{id}</td>
      <td className="px-6 py-4 text-sm text-gray-900">
        {mode === 'edit' ? <EditCell item={item} table={table} /> : item.name}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-end text-sm font-medium">
        <RowActions mode={mode} item={item} table={table} />
      </td>
    </tr>
  );
}
