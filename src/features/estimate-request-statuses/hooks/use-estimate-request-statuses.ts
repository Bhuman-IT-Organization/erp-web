import { estimateRequestStatusesHooks } from '@/features/estimate-request-statuses/api/estimate-request-statuses.endpoints';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import type { CommonMutation } from '@/lib/api/use-common-mutation';
import type { EstimateRequestStatus } from '@/features/estimate-request-statuses/schemas/estimate-request-status.schema';

export function useEstimateRequestStatuses(
  id: string | null,
): CommonApiResult<EstimateRequestStatus> {
  return estimateRequestStatusesHooks.useOne(id);
}

export function useDeleteEstimateRequestStatus(id: string): CommonMutation<undefined, null> {
  return estimateRequestStatusesHooks.useRemove(id);
}
