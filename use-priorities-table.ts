'use client';

import { useMemo, useState } from 'react';
import { useTicketPriorities, type TicketPriority } from '@/lib/hooks/useTicketPriorities';
import { LABELS } from '../schemas/ticket-priorities.constants';
import { nextSortOrder, sortPriorities, type SortOrder } from '../schemas/ticket-priorities.sort';
import { errorMessage, getPriorityId, validatePriorityName } from '../schemas/ticket-priorities.validation';

/**
 * State and handlers for the priorities table: sorting, inline edit and delete.
 */
export function usePrioritiesTable() {
  const { priorities, loading, error, updatePriority, deletePriority } = useTicketPriorities();

  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const sorted = useMemo(() => sortPriorities(priorities, sortOrder), [priorities, sortOrder]);

  const toggleSort = (): void => {
    setSortOrder((prev) => nextSortOrder(prev));
  };

  const startEdit = (p: TicketPriority): void => {
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

  const saveEdit = async (p: TicketPriority): Promise<void> => {
    const id = getPriorityId(p);
    const err = validatePriorityName(editValue, id, priorities);
    if (err !== null) {
      setEditError(err);
      return;
    }
    if (editValue.trim() === p.name) {
      cancelEdit();
      return;
    }
    setBusy(true);
    try {
      await updatePriority(id, { name: editValue.trim() });
      cancelEdit();
    } catch (e) {
      setEditError(errorMessage(e, LABELS.updateFailed));
    } finally {
      setBusy(false);
    }
  };

  const askDelete = (id: number): void => {
    setConfirmDeleteId(id);
    setActionError(null);
  };

  const cancelDelete = (): void => {
    setConfirmDeleteId(null);
  };

  const confirmDelete = async (id: number): Promise<void> => {
    setBusy(true);
    setActionError(null);
    try {
      await deletePriority(id);
      setConfirmDeleteId(null);
    } catch (e) {
      setActionError(errorMessage(e, LABELS.deleteFailed));
    } finally {
      setBusy(false);
    }
  };

  return {
    sorted,
    loading,
    error,
    sortOrder,
    editingId,
    editValue,
    editError,
    confirmDeleteId,
    busy,
    actionError,
    toggleSort,
    startEdit,
    cancelEdit,
    changeEdit,
    saveEdit,
    askDelete,
    cancelDelete,
    confirmDelete,
  };
}

export type TableApi = ReturnType<typeof usePrioritiesTable>;
