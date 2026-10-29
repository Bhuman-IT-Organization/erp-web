import { ticketStatusesHooks } from '@/features/ticket-statuses/api/ticket-statuses.endpoints';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import type { CommonMutation } from '@/lib/api/use-common-mutation';
import type { TicketStatus } from '@/features/ticket-statuses/schemas/ticket-status.schema';

/** `GET /api/v1/ticket-statuses/:id`. A `null` id (the create screen) is no request. */
export function useTicketStatuses(id: string | null): CommonApiResult<TicketStatus> {
  return ticketStatusesHooks.useOne(id);
}

/** `DELETE /api/v1/ticket-statuses/:id`: 204 revalidates the list; a 409 or 404 is a resolved failure the dialog shows. */
export function useDeleteTicketStatus(id: string): CommonMutation<undefined, null> {
  return ticketStatusesHooks.useRemove(id);
}
