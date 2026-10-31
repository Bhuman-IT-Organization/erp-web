import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  ticketPrioritiesSchema,
  type TicketPriorities,
  type TicketPrioritiesFormValues,
} from '@/features/ticket-priorities/schemas/ticket-priorities.schema';

/**
 * The resource's wire contract: every call this feature makes, method and path (erp-api
 * `src/v1/ticket-priorities`). The list answers `{ data, meta }` (BE-19; `ListPageTemplate` reads
 * it); a record is `GET|PATCH …/:id`, a new one `POST` (body `{ name }`), a delete `DELETE …/:id`
 * (204, 404, or 409 while the priority is used by a ticket or is the email-piping default).
 *
 * No axios import, no raw transport here: reads go through `useCommonApi` (retried per ADR-0031 §5
 * by SWR), writes through `useCommonMutation` (NEVER retried), FE-03.
 */
export const TICKET_PRIORITIES_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/ticket-priorities' },
  export: { method: 'GET', path: '/api/v1/ticket-priorities/export' },
  detail: { method: 'GET', path: '/api/v1/ticket-priorities/:id' },
  create: { method: 'POST', path: '/api/v1/ticket-priorities' },
  update: { method: 'PATCH', path: '/api/v1/ticket-priorities/:id' },
  remove: { method: 'DELETE', path: '/api/v1/ticket-priorities/:id' },
} as const;

export const TICKET_PRIORITIES_PATH = TICKET_PRIORITIES_ENDPOINTS.list.path satisfies ApiPath;

/** One record's path (its detail read, its update, its seed from the list row), the id encoded. */
export function ticketPrioritiesPath(id: string): ApiPath {
  return TICKET_PRIORITIES_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

export const ticketPrioritiesHooks = createResourceHooks<
  TicketPriorities,
  TicketPrioritiesFormValues
>(TICKET_PRIORITIES_PATH, ticketPrioritiesSchema);

export const TICKET_PRIORITIES_EXPORT_PATH = TICKET_PRIORITIES_ENDPOINTS.export
  .path satisfies ApiPath;

/** The export's columns in the api's order (erp-api's export columns). */
export const TICKET_PRIORITIES_EXPORT_COLUMNS = ['id', 'name'] as const;
export type TicketPrioritiesExportColumn = (typeof TICKET_PRIORITIES_EXPORT_COLUMNS)[number];

/** The 400 whose problem body carries `issues` the form maps onto its fields. */
export const VALIDATION_CODE = 'ERP-VALIDATION-0001';

/** The api's one not-found answer: a record that is not there, or one the caller may not read. */
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

/** 409: a ticket still uses this priority, so it cannot be deleted. */
export const IN_USE_CODE = 'ERP-TICKETPRIORITIES-0001';

/** 409: this priority is the default of tickets opened by email piping, so it cannot be deleted. */
export const EMAIL_PIPING_DEFAULT_CODE = 'ERP-TICKETPRIORITIES-0002';

/**
 * The feature's own codes, each with a `ticket-priorities.errors.<code>` message: `useErrorText`
 * renders a refusal as `'errors.<code>'` of this namespace (messages/en.json). Perfex has no
 * unique-name rule, so there is no "name taken" code.
 */
export const TICKET_PRIORITIES_ERRORS: FeatureErrorCodes = {
  namespace: 'ticket-priorities',
  codes: [NOT_FOUND_CODE, IN_USE_CODE, EMAIL_PIPING_DEFAULT_CODE],
};
