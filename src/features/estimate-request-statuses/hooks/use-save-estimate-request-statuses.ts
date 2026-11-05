import {
  ESTIMATE_REQUEST_STATUSES_ENDPOINTS,
  ESTIMATE_REQUEST_STATUSES_PATH,
  estimateRequestStatusesPath,
} from '@/features/estimate-request-statuses/api/estimate-request-statuses.endpoints';
import {
  estimateRequestStatusSchema,
  type EstimateRequestStatus,
  type EstimateRequestStatusWriteValues,
} from '@/features/estimate-request-statuses/schemas/estimate-request-statuses.schema';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';

export interface EstimateRequestStatusSave {
  readonly create: CommonMutation<EstimateRequestStatusWriteValues, EstimateRequestStatus>;
  readonly update: CommonMutation<EstimateRequestStatusWriteValues, EstimateRequestStatus>;
}

export function useSaveEstimateRequestStatuses(id: string | null): EstimateRequestStatusSave {
  const create = useCommonMutation<EstimateRequestStatusWriteValues, EstimateRequestStatus>(
    ESTIMATE_REQUEST_STATUSES_PATH,
    {
      method: ESTIMATE_REQUEST_STATUSES_ENDPOINTS.create.method,
      schema: estimateRequestStatusSchema,
      invalidate: [],
    },
  );
  const update = useCommonMutation<EstimateRequestStatusWriteValues, EstimateRequestStatus>(
    id === null ? ESTIMATE_REQUEST_STATUSES_PATH : estimateRequestStatusesPath(id),
    {
      method: ESTIMATE_REQUEST_STATUSES_ENDPOINTS.update.method,
      schema: estimateRequestStatusSchema,
      invalidate: [],
    },
  );
  return { create, update };
}
