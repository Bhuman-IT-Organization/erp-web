import {
  LEAD_STATUSES_ENDPOINTS,
  LEAD_STATUSES_PATH,
  leadStatusesPath,
} from '@/features/lead-statuses/api/lead-statuses.endpoints';

import {
  leadStatusesSchema,
  type LeadStatuses,
  type LeadStatusesFormValues,
} from '@/features/lead-statuses/schemas/lead-statuses.schema';

import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';

export interface LeadStatusesSave {
  readonly create: CommonMutation<LeadStatusesFormValues, LeadStatuses>;

  readonly update: CommonMutation<LeadStatusesFormValues, LeadStatuses>;
}

/**
 * Create and update Lead Statuses.
 * Mutations are not automatically retried.
 * The form handles list-cache refresh after saving.
 */
export function useSaveLeadStatuses(id: string | null): LeadStatusesSave {
  const create = useCommonMutation<LeadStatusesFormValues, LeadStatuses>(LEAD_STATUSES_PATH, {
    method: LEAD_STATUSES_ENDPOINTS.create.method,
    schema: leadStatusesSchema,
    invalidate: [],
  });

  const update = useCommonMutation<LeadStatusesFormValues, LeadStatuses>(
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
