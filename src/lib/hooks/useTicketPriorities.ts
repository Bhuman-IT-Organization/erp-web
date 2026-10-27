'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { callApi } from '@/lib/api/call-api';

/**
 * Shape of the ticket priority record matching the backend DTO.
 */
export interface TicketPriority {
  priorityid: number;
  id: number;
  name: string;
}

const priorityResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
});

const listResponseSchema = z.object({
  data: z.array(priorityResponseSchema),
});

/**
 * Hook to manage ticket priorities fetching and mutations.
 */
export function useTicketPriorities() {
  const [priorities, setPriorities] = useState<TicketPriority[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPriorities = useCallback(async (isInitial = false) => {
    try {
      if (!isInitial) setLoading(true);
      const res = await callApi('/api/v1/ticket-priorities', {
        method: 'GET',
        schema: listResponseSchema,
      });
      if (!res.ok) throw new Error(res.code);
      setPriorities(res.data.data.map((p) => ({ ...p, priorityid: p.id })));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch ticket priorities');
    } finally {
      setLoading(false);
    }
  }, []);

  // effect: subscribe: load the priorities list on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial data fetch on mount
    void loadPriorities(true);
  }, [loadPriorities]);

  const updatePriority = async (id: number, data: { name: string }) => {
    const res = await callApi(`/api/v1/ticket-priorities/${id.toString()}`, {
      method: 'PATCH',
      body: data,
      schema: priorityResponseSchema,
    });
    if (!res.ok) throw new Error(res.code);
    await loadPriorities();
  };

  const deletePriority = async (id: number) => {
    const res = await callApi(`/api/v1/ticket-priorities/${id.toString()}`, {
      method: 'DELETE',
      schema: z.null(),
      expectNoContent: true,
    });
    if (!res.ok) throw new Error(res.code);
    await loadPriorities();
  };

  const createPriority = async (data: { name: string }) => {
    const res = await callApi('/api/v1/ticket-priorities', {
      method: 'POST',
      body: data,
      schema: priorityResponseSchema,
    });
    if (!res.ok) throw new Error(res.code);
    await loadPriorities();
  };

  return {
    priorities,
    loading,
    error,
    loadPriorities,
    createPriority,
    updatePriority,
    deletePriority,
  };
}
