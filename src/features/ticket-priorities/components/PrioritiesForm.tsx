/* eslint-disable react/jsx-no-literals -- text strings not yet extracted to i18n */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTicketPriorities } from '@/lib/hooks/useTicketPriorities';
import { getPriorityId, validatePriorityName } from '../validation';

interface Props {
  priorityId?: number;
}

export function PrioritiesForm({ priorityId }: Props) {
  const router = useRouter();
  const { priorities, loading, createPriority, updatePriority } = useTicketPriorities();

  const [name, setName] = useState(() => {
    if (priorityId === undefined) return '';
    const existing = priorities.find((p) => getPriorityId(p) === priorityId);
    return existing ? existing.name : '';
  });

  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const onChange = (value: string) => {
    setName(value);
    setTouched(true);
    setError(validatePriorityName(value, priorityId ?? null, priorities));
  };

  const onSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setTouched(true);
    const err = validatePriorityName(name, priorityId ?? null, priorities);
    if (err) {
      setError(err);
      return;
    }
    try {
      setSaving(true);
      if (priorityId !== undefined) {
        await updatePriority(priorityId, { name: name.trim() });
      } else {
        await createPriority({ name: name.trim() });
      }
      router.push('/setup/ticket-priorities');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;

  // Resolve nested ternaries outside of JSX
  let buttonText = 'Create';
  if (saving) buttonText = 'Saving...';
  else if (priorityId !== undefined) buttonText = 'Update';

  const titleText = priorityId !== undefined ? 'Edit Priority' : 'Create Priority';

  return (
    <form
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      className="max-w-md space-y-4 rounded-lg border bg-white p-6 shadow-sm"
    >
      <h1 className="text-xl font-semibold text-gray-900">{titleText}</h1>

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
          Priority Name
        </label>
        <input
          id="name"
          value={name}
          maxLength={50}
          disabled={saving}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
            touched && error
              ? 'border-red-400 focus:ring-red-300'
              : 'border-gray-300 focus:ring-blue-300'
          }`}
        />
        {touched && error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {buttonText}
        </button>
        <button
          type="button"
          onClick={() => {
            router.push('/setup/ticket-priorities');
          }}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
