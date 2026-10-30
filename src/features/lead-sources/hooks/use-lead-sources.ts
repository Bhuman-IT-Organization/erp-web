import { leadSourcesHooks } from '@/features/lead-sources/api/lead-sources.endpoints';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import type { CommonMutation } from '@/lib/api/use-common-mutation';
import type { LeadSources } from '@/features/lead-sources/schemas/lead-sources.schema';

/**
 * The record read (FE-03): `GET /api/v1/lead-sources/:id` through SWR under the global policy: a
 * 5xx, a timeout or a network failure is retried, a 4xx never. A `null` id (the create screen) is
 * a `null` key: no request. The list itself is `ListPageTemplate`'s read, not a hook here.
 */
export function useLeadSources(id: string | null): CommonApiResult<LeadSources> {
  return leadSourcesHooks.useOne(id);
}

/**
 * `DELETE /api/v1/lead-sources/:id`: 204 is success and revalidates the
 * list pages (the totals moved); a 409 (still in use) or a 404 is a resolved
 * failure the dialog shows. A write is NEVER retried (ADR-0031 §5).
 */
export function useDeleteLeadSource(id: string): CommonMutation<undefined, null> {
  return leadSourcesHooks.useRemove(id);
}
