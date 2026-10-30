import {
  TICKET_STATUSES_ENDPOINTS,
  TICKET_STATUSES_PATH,
  ticketStatusesPath,
} from '@/features/ticket-statuses/api/ticket-statuses.endpoints';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  ticketStatusSchema,
  type TicketStatus,
  type TicketStatusWriteValues,
} from '@/features/ticket-statuses/schemas/ticket-status.schema';
export interface TicketStatusSave {
  readonly create: CommonMutation<TicketStatusWriteValues, TicketStatus>;
  readonly update: CommonMutation<TicketStatusWriteValues, TicketStatus>;
}

/** The two writes of the form. NEVER retried automatically; they invalidate nothing (the screen does it). */
export function useSaveTicketStatuses(id: string | null): TicketStatusSave {
  const create = useCommonMutation<TicketStatusWriteValues, TicketStatus>(TICKET_STATUSES_PATH, {
    method: TICKET_STATUSES_ENDPOINTS.create.method,
    schema: ticketStatusSchema,
    invalidate: [],
  });
  const update = useCommonMutation<TicketStatusWriteValues, TicketStatus>(
    id === null ? TICKET_STATUSES_PATH : ticketStatusesPath(id),
    { method: TICKET_STATUSES_ENDPOINTS.update.method, schema: ticketStatusSchema, invalidate: [] },
  );
  return { create, update };
}
