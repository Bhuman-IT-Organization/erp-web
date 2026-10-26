import {
  TICKETSTATUSES_ENDPOINTS,
  TICKETSTATUSES_PATH,
  ticketStatusesPath,
} from '@/features/ticket/api/ticket-status.endpoints';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  ticketStatusSchema,
  type TicketStatus,
  type TicketStatusFormValues,
} from '@/features/ticket/schemas/ticket-status.schema';
export interface TicketStatusSave {
  readonly create: CommonMutation<TicketStatusFormValues, TicketStatus>;
  readonly update: CommonMutation<TicketStatusFormValues, TicketStatus>;
}

/** The two writes of the form. NEVER retried automatically; they invalidate nothing (the screen does it). */
export function useSaveTicketStatuses(id: string | null): TicketStatusSave {
  const create = useCommonMutation<TicketStatusFormValues, TicketStatus>(TICKETSTATUSES_PATH, {
    method: TICKETSTATUSES_ENDPOINTS.create.method,
    schema: ticketStatusSchema,
    invalidate: [],
  });
  const update = useCommonMutation<TicketStatusFormValues, TicketStatus>(
    id === null ? TICKETSTATUSES_PATH : ticketStatusesPath(id),
    { method: TICKETSTATUSES_ENDPOINTS.update.method, schema: ticketStatusSchema, invalidate: [] },
  );
  return { create, update };
}
