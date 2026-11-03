import { leadStatusesHooks } from '@/features/lead-statuses/api/lead-statuses.endpoints';

import type { LeadStatuses } from '@/features/lead-statuses/schemas/lead-statuses.schema';

import type { CommonApiResult } from '@/lib/api/use-common-api';

import type { CommonMutation } from '@/lib/api/use-common-mutation';

/**
 * Read one lead status by ID.
 * A null ID means no request is sent.
 */
export function useLeadStatuses(id: string | null): CommonApiResult<LeadStatuses> {
  return leadStatusesHooks.useOne(id);
}

/**
 * Delete a lead status by ID.
 * Successful deletion refreshes the resource list.
 * Protected statuses return API error codes.
 */
export function useDeleteLeadStatus(id: string): CommonMutation<undefined, null> {
  return leadStatusesHooks.useRemove(id);
}
