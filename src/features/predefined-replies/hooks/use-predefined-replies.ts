import { predefinedRepliesHooks } from '@/features/predefined-replies/api/predefined-replies.endpoints';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import type { PredefinedReplies } from '@/features/predefined-replies/schemas/predefined-replies.schema';

/**
 * The record read (FE-03): `GET /api/v1/predefined-replies/:id` through SWR under the global policy: a
 * 5xx, a timeout or a network failure is retried, a 4xx never. A `null` id (the create screen) is
 * a `null` key: no request. The list itself is `ListPageTemplate`'s read, not a hook here.
 */
export function usePredefinedReplies(id: string | null): CommonApiResult<PredefinedReplies> {
  return predefinedRepliesHooks.useOne(id);
}
