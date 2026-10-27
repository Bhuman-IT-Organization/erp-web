import type { TicketPriority } from '@/lib/hooks/useTicketPriorities';
import { ticketPriorityNameSchema } from '../api/schemas';

export const getPriorityId = (p: TicketPriority): number => p.id;

export function validatePriorityName(
  value: string,
  currentId: number | null,
  all: TicketPriority[],
): string | null {
  // 1. Format rules come from the zod schema
  const result = ticketPriorityNameSchema.safeParse(value);
  if (!result.success) return result.error.issues[0]?.message ?? 'Invalid name';

  // 2. Duplicate check needs the current list, so it stays outside the schema
  const name = result.data.toLowerCase();
  const duplicate = all.some(
    (p) => getPriorityId(p) !== currentId && p.name.trim().toLowerCase() === name,
  );
  if (duplicate) return 'This priority name already exists';

  return null;
}
