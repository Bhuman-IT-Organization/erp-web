'use client';

import { useMemo, useState } from 'react';
import { ticketPrioritiesHooks, type Priority } from '../api';
import { nextSortOrder, sortPriorities, type SortOrder } from '../schemas/ticket-priorities.sort';
import { getPriorityId, validatePriorityName } from '../schemas/ticket-priorities.validation';

export type TableApi = ReturnType<typeof usePrioritiesTable>;
export function usePrioritiesTable() {
  const { data, error: listError, isLoading: loading } = ticketPrioritiesHooks.useList();
  const priorities = useMemo(() => [...(data?.data ?? [])], [data]);
  const error = listError ? listError.message : null;

  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // The hooks take the id at call time; startEdit/askDelete set these ids first, so the
  // mutation always points at the right row. With no row selected it is never triggered.
  const update = ticketPrioritiesHooks.useUpdate(String(editingId ?? ''));
  const remove = ticketPrioritiesHooks.useRemove(String(confirmDeleteId ?? ''));

  const sorted = useMemo(() => sortPriorities(priorities, sortOrder), [priorities, sortOrder]);

  const toggleSort = (): void => setSortOrder((prev) => nextSortOrder(prev));

  const startEdit = (p: Priority): void => {
    setEditingId(getPriorityId(p));
    setEditValue(p.name);
    setEditError(null);
    setActionError(null);
    setConfirmDeleteId(null);
  };

  const cancelEdit = (): void => {
    setEditingId(null);
    setEditValue('');
    setEditError(null);
  };

  const changeEdit = (id: number, value: string): void => {
    setEditValue(value);
    setEditError(validatePriorityName(value, id, priorities));
  };

  const saveEdit = async (p: Priority): Promise<void> => {
    const id = getPriorityId(p);
    const err = validatePriorityName(editValue, id, priorities);
    if (err) {
      setEditError(err);
      return;
    }
    setBusy(true);
    setActionError(null);
    const result = await update.trigger({ name: editValue.trim() });
    setBusy(false);
    if (result.ok) cancelEdit();
    else setActionError('Failed to update priority');
  };

  // ...your existing askDelete / cancelDelete stay as they are...

  const confirmDelete = async (): Promise<void> => {
    if (confirmDeleteId === null) return;
    setBusy(true);
    setActionError(null);
    const result = await remove.trigger(undefined);
    setBusy(false);
    if (result.ok) setConfirmDeleteId(null);
    else setActionError('Failed to delete priority');
  };
    const askDelete = (id: number): void => {
    setConfirmDeleteId(id);
    setEditingId(null);
    setActionError(null);
  };

  const cancelDelete = (): void => setConfirmDeleteId(null);

    return {
    sorted,
    loading,
    error,
    sortOrder,
    toggleSort,
    editingId,
    editValue,
    editError,
    startEdit,
    cancelEdit,
    changeEdit,
    saveEdit,
    confirmDeleteId,
    askDelete,
    cancelDelete,
    confirmDelete,
    busy,
    actionError,
  };
}