import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  ticketStatusSchema,
  type TicketStatus,
  type TicketStatusWriteValues,
} from '@/features/ticket-statuses/schemas/ticket-status.schema';

/**
 * The resource's wire contract: every call this feature makes, method and path. The api half is
 * erp-api `src/v1/ticket-statuses`. A row uses `ticketstatusid`, `name`, `isdefault`,
 * `statuscolor`, and `statusorder`. A delete is `DELETE …/:id` (204, 404, or 409 when deletion is
 * refused by the backend).
 */
export const TICKET_STATUSES_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/ticket-statuses' },
  export: { method: 'GET', path: '/api/v1/ticket-statuses/export' },
  detail: { method: 'GET', path: '/api/v1/ticket-statuses/:id' },
  create: { method: 'POST', path: '/api/v1/ticket-statuses' },
  update: { method: 'PATCH', path: '/api/v1/ticket-statuses/:id' },
  remove: { method: 'DELETE', path: '/api/v1/ticket-statuses/:id' },
} as const;

export const TICKET_STATUSES_PATH = TICKET_STATUSES_ENDPOINTS.list.path satisfies ApiPath;
export const TICKET_STATUSES_EXPORT_PATH = TICKET_STATUSES_ENDPOINTS.export.path satisfies ApiPath;
export const TICKET_STATUSES_EXPORT_COLUMNS = ['id', 'name', 'ticket_count'] as const;
export type TicketStatusesExportColumn = (typeof TICKET_STATUSES_EXPORT_COLUMNS)[number];

/** One record's path, the id encoded. */
export function ticketStatusesPath(id: string): ApiPath {
  return TICKET_STATUSES_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

export const ticketStatusesHooks = createResourceHooks<
  TicketStatus,
  TicketStatusWriteValues,
  TicketStatusWriteValues
>(TICKET_STATUSES_PATH, ticketStatusSchema);

/** The 400 whose problem body carries `issues` the form maps onto its fields. */
export const VALIDATION_CODE = 'ERP-VALIDATION-0001';

/** The api's one not-found answer. */
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

/** The delete refused while a ticket uses the ticket status (409). MUST equal the code the api module throws. */
export const IN_USE_CODE = 'ERP-TICKETSTATUSES-0001';
/** The api refuses deletion of statuses marked `isdefault = 1`. */
export const BUILT_IN_CODE = 'ERP-TICKETSTATUSES-0002';
/** The api refuses deletion of status configured as default ticket reply status. */
export const DEFAULT_REPLY_STATUS_CODE = 'ERP-TICKETSTATUSES-0003';

export const TICKET_STATUSES_ERRORS: FeatureErrorCodes = {
  namespace: 'ticket-statuses',
  codes: [NOT_FOUND_CODE, IN_USE_CODE, BUILT_IN_CODE, DEFAULT_REPLY_STATUS_CODE],
};
