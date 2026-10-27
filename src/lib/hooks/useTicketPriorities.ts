'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { callApi } from '@/lib/api/call-api';

/**
 * Shape of the ticket priority record matching the backend DTO.
 */
export interface TicketPriority {
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

      if (!res.ok) throw new Error('Failed to fetch ticket priorities');

      setPriorities(res.data.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch ticket priorities');
    } finally {
      setLoading(false);
    }
  }, []);

  // effect: load priorities on mount
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
    if (!res.ok) throw new Error('Failed to update priority');
    await loadPriorities();
  };

  const deletePriority = async (id: number) => {
    const res = await callApi(`/api/v1/ticket-priorities/${id.toString()}`, {
      method: 'DELETE',
      schema: z.any(),
    });
    if (!res.ok) throw new Error('Failed to delete priority');
    await loadPriorities();
  };

  const createPriority = async (data: { name: string }) => {
    const res = await callApi('/api/v1/ticket-priorities', {
      method: 'POST',
      body: data,
      schema: priorityResponseSchema,
    });
    if (!res.ok) throw new Error('Failed to create priority');
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
