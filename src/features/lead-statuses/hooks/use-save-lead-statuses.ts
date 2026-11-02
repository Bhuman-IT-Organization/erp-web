import {
  LEAD_STATUSES_ENDPOINTS,
  LEAD_STATUSES_PATH,
  leadStatusesPath,
} from '@/features/lead-statuses/api/lead-statuses.endpoints';

import {
  leadStatusesSchema,
  type LeadStatuses,
  type LeadStatusesBody,
} from '@/features/lead-statuses/schemas/lead-statuses.schema';

import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';

export interface LeadStatusesSave {
  readonly create: CommonMutation<LeadStatusesBody, LeadStatuses>;

  readonly update: CommonMutation<LeadStatusesBody, LeadStatuses>;
}

/**
 * Create and update Lead Statuses.
 * Mutations are not automatically retried.
 * The form handles list-cache refresh after saving.
 */
export function useSaveLeadStatuses(id: string | null): LeadStatusesSave {
  const create = useCommonMutation<LeadStatusesBody, LeadStatuses>(LEAD_STATUSES_PATH, {
    method: LEAD_STATUSES_ENDPOINTS.create.method,
    schema: leadStatusesSchema,
    invalidate: [],
  });

  const update = useCommonMutation<LeadStatusesBody, LeadStatuses>(
    id === null ? LEAD_STATUSES_PATH : leadStatusesPath(id),
    {
      method: LEAD_STATUSES_ENDPOINTS.update.method,
      schema: leadStatusesSchema,
      invalidate: [],
    },
  );

  return {
    create,
    update,
  };
}
