import {
  TICKET_PRIORITIES_ENDPOINTS,
  TICKET_PRIORITIES_PATH,
  ticketPrioritiesPath,
} from '@/features/ticket-priorities/api/ticket-priorities.endpoints';
import {
  ticketPrioritiesSchema,
  type TicketPriorities,
  type TicketPrioritiesFormValues,
} from '@/features/ticket-priorities/schemas/ticket-priorities.schema';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';

/** The two writes of the form, one for each screen. */
export interface TicketPrioritiesSave {
  readonly create: CommonMutation<TicketPrioritiesFormValues, TicketPriorities>;
  readonly update: CommonMutation<TicketPrioritiesFormValues, TicketPriorities>;
}

/**
 * The writes (FE-03): `.create` and `.update` of the endpoints table, each with the body
 * `{ name }`, NEVER retried automatically (ADR-0031 §5); a 400 carries `issues` for the form, a 404
 * says the record is gone. They invalidate nothing: the screen swaps the saved row into the cached
 * list pages after an edit and revalidates them after a create. With no id (the create screen)
 * `update` is never triggered.
 */
export function useSaveTicketPriorities(id: string | null): TicketPrioritiesSave {
  const create = useCommonMutation<TicketPrioritiesFormValues, TicketPriorities>(
    TICKET_PRIORITIES_PATH,
    {
      method: TICKET_PRIORITIES_ENDPOINTS.create.method,
      schema: ticketPrioritiesSchema,
      invalidate: [],
    },
  );
  const update = useCommonMutation<TicketPrioritiesFormValues, TicketPriorities>(
    id === null ? TICKET_PRIORITIES_PATH : ticketPrioritiesPath(id),
    {
      method: TICKET_PRIORITIES_ENDPOINTS.update.method,
      schema: ticketPrioritiesSchema,
      invalidate: [],
    },
  );
  return { create, update };
}
