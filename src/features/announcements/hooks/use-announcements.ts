import { announcementsHooks } from '@/features/announcements/api/announcements.endpoints';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import type { CommonMutation } from '@/lib/api/use-common-mutation';
import type { Announcements } from '@/features/announcements/schemas/announcements.schema';

/**
 * The record read (FE-03): `GET /api/v1/announcements/:id` through SWR. A `null` id (the create
 * screen) is a `null` key: no request. The list itself is `ListPageTemplate`'s read, not a hook here.
 */
export function useAnnouncements(id: string | null): CommonApiResult<Announcements> {
  return announcementsHooks.useOne(id);
}

/**
 * `DELETE /api/v1/announcements/:id`: 204 is success and revalidates the list pages; a 404 is a
 * resolved failure the dialog shows. A write is NEVER retried (ADR-0031 §5).
 */
export function useDeleteAnnouncement(id: string): CommonMutation<undefined, null> {
  return announcementsHooks.useRemove(id);
}
