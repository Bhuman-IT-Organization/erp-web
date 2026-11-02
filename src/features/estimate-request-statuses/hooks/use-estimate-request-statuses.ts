import { estimateRequestStatusesHooks } from '@/features/estimate-request-statuses/api/estimate-request-statuses.endpoints';
import type { EstimateRequestStatus } from '@/features/estimate-request-statuses/schemas/estimate-request-status.schema';
import type { CommonApiResult, ListPage } from '@/lib/api/use-common-api';
import { useList } from '@/lib/api/use-common-api';
import { ESTIMATE_REQUEST_STATUSES_PATH } from '@/features/estimate-request-statuses/api/estimate-request-statuses.endpoints';
import { estimateRequestStatusRowSchema } from '@/features/estimate-request-statuses/schemas/estimate-request-status.schema';
import type { CommonMutation } from '@/lib/api/use-common-mutation';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import type { CommonMutation } from '@/lib/api/use-common-mutation';
import type { EstimateRequestStatus } from '@/features/estimate-request-statuses/schemas/estimate-request-status.schema';

export function useEstimateRequestStatuses(
  id: string | null,
): CommonApiResult<EstimateRequestStatus> {
  return estimateRequestStatusesHooks.useOne(id);
}

export function useEstimateRequestStatusesCount(): CommonApiResult<
  ListPage<EstimateRequestStatus>
> {
  return useList(ESTIMATE_REQUEST_STATUSES_PATH, estimateRequestStatusRowSchema);
}

export function useDeleteEstimateRequestStatus(id: string): CommonMutation<undefined, null> {
  return estimateRequestStatusesHooks.useRemove(id);
}
