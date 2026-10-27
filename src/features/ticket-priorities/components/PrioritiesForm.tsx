'use client';

import { PRIORITY_NAME_MAX } from '../api/schemas';
import { LABELS, STYLES } from '../schemas/ticket-priorities.constants';
import { usePriorityForm } from '../hooks/use-priority-form';

interface Props {
  priorityId?: number;
}

/**
 * Create / edit form for one ticket priority.
 */
export function PrioritiesForm({ priorityId }: Props) {
  const form = usePriorityForm(priorityId);

  if (form.loading) return <p className="text-gray-500">{LABELS.loading}</p>;

  const title = form.isEdit ? LABELS.editTitle : LABELS.createTitle;
  const idleLabel = form.isEdit ? LABELS.update : LABELS.create;
  const submitLabel = form.saving ? LABELS.saving : idleLabel;
  const tone = form.error === null ? STYLES.inputOk : STYLES.inputError;

  return (
    <form
      onSubmit={(e) => {
        void form.onSubmit(e);
      }}
      className="max-w-md space-y-4 rounded-lg border bg-white p-6 shadow-sm"
    >
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
          {LABELS.nameField}
        </label>
        <input
          id="name"
          value={form.name}
          maxLength={PRIORITY_NAME_MAX}
          disabled={form.saving}
          onChange={(e) => {
            form.onChange(e.target.value);
          }}
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${tone}`}
        />
        {form.error !== null && <p className="mt-1 text-xs text-red-500">{form.error}</p>}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={form.saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={form.cancel}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          {LABELS.cancel}
        </button>
      </div>
    </form>
  );
}
