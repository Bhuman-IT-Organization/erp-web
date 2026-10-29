import { ticketPrioritiesHooks } from '@/features/ticket-priorities/api/ticket-priorities.endpoints';
import type { TicketPriorities } from '@/features/ticket-priorities/schemas/ticket-priorities.schema';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import type { CommonMutation } from '@/lib/api/use-common-mutation';

/**
 * The record read (FE-03): `GET /api/v1/ticket-priorities/:id` through SWR under the global policy:
 * a 5xx, a timeout or a network failure is retried, a 4xx never. A `null` id (the create screen) is
 * a `null` key: no request. The list itself is `ListPageTemplate`'s read, not a hook here.
 */
export function useTicketPriorities(id: string | null): CommonApiResult<TicketPriorities> {
  return ticketPrioritiesHooks.useOne(id);
}

/**
 * `DELETE /api/v1/ticket-priorities/:id`: 204 is success and revalidates the list pages; a 409
 * (`ERP-TICKETPRIORITIES-0001` or `-0002`) or a 404 is a resolved failure the dialog shows. A write
 * is NEVER retried (ADR-0031 §5).
 */
export function useDeleteTicketPriority(id: string): CommonMutation<undefined, null> {
  return ticketPrioritiesHooks.useRemove(id);
}
