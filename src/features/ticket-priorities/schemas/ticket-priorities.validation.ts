import type { TicketPriority } from '@/lib/hooks/useTicketPriorities';
import { ticketPriorityNameSchema } from '../api/schemas';

/**
 * Returns the id of a ticket priority.
 */
export const getPriorityId = (p: TicketPriority): number => p.id;

/**
 * Returns the message of an unknown error, or the fallback.
 */
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

/**
 * Validates a priority name. Returns an error message, or null when valid.
 * `currentId` is the row being edited (null when creating), so a row can keep its own name.
 */
export function validatePriorityName(
  value: string,
  currentId: number | null,
  all: TicketPriority[],
): string | null {
  const result = ticketPriorityNameSchema.safeParse(value);
  if (!result.success) return result.error.issues[0]?.message ?? 'Invalid name';

  const name = result.data.toLowerCase();
  const duplicate = all.some(
    (p) => getPriorityId(p) !== currentId && p.name.trim().toLowerCase() === name,
  );
  if (duplicate) return 'This priority name already exists';

  return null;
}
