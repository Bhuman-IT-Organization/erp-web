/* eslint-disable react/jsx-no-literals -- text strings not yet extracted to i18n */
'use client';

import { useMemo, useState } from 'react';
import { useTicketPriorities } from '@/lib/hooks/useTicketPriorities';
import { getPriorityId, validatePriorityName } from '../validation';
import type { TicketPriority } from '@/lib/hooks/useTicketPriorities';

type SortOrder = 'latest' | 'asc' | 'desc';

export function PrioritiesList() {
  const { priorities, loading, error, updatePriority, deletePriority } = useTicketPriorities();
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');

  const sorted = useMemo(() => {
    const list = [...priorities];
    if (sortOrder === 'asc') {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    } else if (sortOrder === 'desc') {
      list.sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: 'base' }));
    } else {
      list.sort((a, b) => getPriorityId(b) - getPriorityId(a));
    }
    return list;
  }, [priorities, sortOrder]);

  const toggleSort = () => {
    setSortOrder((prev) => {
      if (prev === 'latest') return 'asc';
      if (prev === 'asc') return 'desc';
      return 'latest';
    });
  };

  let sortIndicator = '↕';
  if (sortOrder === 'asc') sortIndicator = '▲';
  if (sortOrder === 'desc') sortIndicator = '▼';

  if (loading) return <p className="p-6 text-gray-500">Loading priorities...</p>;
  if (error) return <p className="p-6 text-red-500">Error: {error}</p>;

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="w-24 px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
              ID
            </th>
            <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
              <button
                type="button"
                onClick={toggleSort}
                className="inline-flex items-center gap-1 uppercase hover:text-gray-900"
                title="Sort: latest → A-Z → Z-A"
              >
                Priority Name <span aria-hidden>{sortIndicator}</span>
              </button>
            </th>
            <th className="w-64 px-6 py-3 text-end text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">
                No ticket priorities found.
              </td>
            </tr>
          ) : (
            sorted.map((item) => (
              <PriorityRow
                key={getPriorityId(item)}
                item={item}
                priorities={priorities}
                updatePriority={updatePriority}
                deletePriority={deletePriority}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  item: TicketPriority;
  priorities: TicketPriority[];
  updatePriority: (id: number, data: { name: string }) => Promise<void>;
  deletePriority: (id: number) => Promise<void>;
}

// eslint-disable-next-line complexity -- Row requires multiple conditional states for inline editing/deleting
function PriorityRow({ item, priorities, updatePriority, deletePriority }: RowProps) {
  const id = getPriorityId(item);
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [editValue, setEditValue] = useState(item.name);
  const [editError, setEditError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setIsEditing(true);
    setEditValue(item.name);
    setEditError(null);
    setIsConfirming(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditValue('');
    setEditError(null);
  };

  const saveEdit = async () => {
    const err = validatePriorityName(editValue, id, priorities);
    if (err) {
      setEditError(err);
      return;
    }
    if (editValue.trim() === item.name) {
      cancelEdit();
      return;
    }
    try {
      setBusy(true);
      await updatePriority(id, { name: editValue.trim() });
      cancelEdit();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    try {
      setBusy(true);
      await deletePriority(id);
      setIsConfirming(false);
    } catch {
      // Removed the unused 'e' variable binding here
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{id}</td>
      <td className="px-6 py-4 text-sm text-gray-900">
        {isEditing ? (
          <div>
            <input
              autoFocus
              value={editValue}
              maxLength={50}
              disabled={busy}
              onChange={(e) => {
                setEditValue(e.target.value);
                setEditError(validatePriorityName(e.target.value, id, priorities));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
              className={`w-full max-w-xs rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 ${
                editError
                  ? 'border-red-400 focus:ring-red-300'
                  : 'border-gray-300 focus:ring-blue-300'
              }`}
            />
            {editError && <p className="mt-1 text-xs text-red-500">{editError}</p>}
          </div>
        ) : (
          item.name
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-end text-sm font-medium">
        {isEditing && (
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                void saveEdit();
              }}
              disabled={busy || !!editError}
              className="rounded-md bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={cancelEdit}
              disabled={busy}
              className="rounded-md border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}

        {isConfirming && !isEditing && (
          <div className="flex items-center justify-end gap-2">
            <span className="text-gray-600">Delete?</span>
            <button
              onClick={() => {
                void confirmDelete();
              }}
              disabled={busy}
              className="rounded-md bg-red-600 px-3 py-1 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Deleting...' : 'Yes'}
            </button>
            <button
              onClick={() => {
                setIsConfirming(false);
              }}
              disabled={busy}
              className="rounded-md border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50"
            >
              No
            </button>
          </div>
        )}

        {!isEditing && !isConfirming && (
          <div className="flex justify-end gap-2">
            <button
              onClick={startEdit}
              className="rounded-md border border-blue-200 px-3 py-1 text-blue-600 hover:bg-blue-50"
            >
              Edit
            </button>
            <button
              onClick={() => {
                setIsConfirming(true);
              }}
              className="rounded-md border border-red-200 px-3 py-1 text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
