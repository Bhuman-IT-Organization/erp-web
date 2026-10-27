'use client';

import { useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTicketPriorities } from '@/lib/hooks/useTicketPriorities';
import { LABELS, ROUTES } from '../schemas/ticket-priorities.constants';
import { errorMessage, getPriorityId, validatePriorityName } from '../schemas/ticket-priorities.validation';

/**
 * State and submit logic for the create / edit priority form.
 */
export function usePriorityForm(priorityId: number | undefined) {
  const router = useRouter();
  const { priorities, loading, createPriority, updatePriority } = useTicketPriorities();

  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const existing =
    priorityId === undefined ? undefined : priorities.find((p) => getPriorityId(p) === priorityId);
  const name = draft ?? existing?.name ?? '';

  const onChange = (value: string): void => {
    setDraft(value);
    setError(validatePriorityName(value, priorityId ?? null, priorities));
  };

  const persist = async (): Promise<void> => {
    const trimmed = name.trim();
    if (priorityId === undefined) await createPriority({ name: trimmed });
    else await updatePriority(priorityId, { name: trimmed });
  };

  const onSubmit = async (e: SyntheticEvent): Promise<void> => {
    e.preventDefault();
    const err = validatePriorityName(name, priorityId ?? null, priorities);
    if (err !== null) {
      setError(err);
      return;
    }
    setSaving(true);
    try {
      await persist();
      router.push(ROUTES.list);
    } catch (e2) {
      setError(errorMessage(e2, LABELS.saveFailed));
    } finally {
      setSaving(false);
    }
  };

  const cancel = (): void => {
    router.push(ROUTES.list);
  };

  return {
    loading,
    saving,
    error,
    name,
    isEdit: priorityId !== undefined,
    onChange,
    onSubmit,
    cancel,
  };
}