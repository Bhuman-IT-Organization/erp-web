'use client';

import { LABELS, STYLES } from '../schemas/ticket-priorities.constants';
import { SORT_INDICATOR, type SortOrder } from '../schemas/ticket-priorities.sort';
import { PriorityRow } from './PriorityRow';
import { usePrioritiesTable } from '../hooks/use-priorities-table';

const COLUMN_COUNT = 3;

function TableHead({ sortOrder, onToggle }: { sortOrder: SortOrder; onToggle: () => void }) {
  return (
    <thead className="bg-gray-50">
      <tr>
        <th className={`w-24 ${STYLES.th}`}>{LABELS.colId}</th>
        <th className={STYLES.th}>
          <button
            type="button"
            onClick={() => {
              onToggle();
            }}
            className="inline-flex items-center gap-1 uppercase hover:text-gray-900"
            title={LABELS.sortHint}
          >
            {LABELS.nameField}
            <span aria-hidden>{SORT_INDICATOR[sortOrder]}</span>
          </button>
        </th>
        <th className={`w-64 ${STYLES.thEnd}`}>{LABELS.colActions}</th>
      </tr>
    </thead>
  );
}

function EmptyRow() {
  return (
    <tr>
      <td colSpan={COLUMN_COUNT} className="px-6 py-4 text-center text-sm text-gray-500">
        {LABELS.empty}
      </td>
    </tr>
  );
}

/**
 * Table of ticket priorities with sorting, inline edit and delete.
 */
export function PrioritiesList() {
  const table = usePrioritiesTable();

  if (table.loading) return <p className="p-6 text-gray-500">{LABELS.loadingList}</p>;
  if (table.error !== null) {
    const message = [LABELS.error, table.error].join(' ');
    return <p className="p-6 text-red-500">{message}</p>;
  }

  return (
    <>
      {table.actionError !== null && (
        <p className="mb-3 rounded-md bg-red-50 px-4 py-2 text-sm text-red-600">
          {table.actionError}
        </p>
      )}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <TableHead sortOrder={table.sortOrder} onToggle={table.toggleSort} />
          <tbody className="bg-white divide-y divide-gray-200">
            {table.sorted.length === 0 ? (
              <EmptyRow />
            ) : (
              table.sorted.map((item) => <PriorityRow key={item.id} item={item} table={table} />)
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
