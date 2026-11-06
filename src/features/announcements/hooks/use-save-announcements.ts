import {
  ANNOUNCEMENTS_ENDPOINTS,
  ANNOUNCEMENTS_PATH,
  announcementsPath,
} from '@/features/announcements/api/announcements.endpoints';
import {
  announcementsSchema,
  type Announcements,
  type AnnouncementsFormValues,
} from '@/features/announcements/schemas/announcements.schema';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';

/** The two writes of the form, one for each screen. */
export interface AnnouncementsSave {
  readonly create: CommonMutation<AnnouncementsFormValues, Announcements>;
  readonly update: CommonMutation<AnnouncementsFormValues, Announcements>;
}

/**
 * The writes (FE-03): `ANNOUNCEMENTS_ENDPOINTS.create` and `.update`, each with the body
 * `{ name, message, showToUsers, showToStaff, showName }`, NEVER retried automatically
 * (ADR-0031 §5). They invalidate nothing: the screen swaps the saved row into the cached list
 * pages after an edit and revalidates them after a create. With no id (the create screen) `update`
 * is never triggered.
 */
export function useSaveAnnouncements(id: string | null): AnnouncementsSave {
  const create = useCommonMutation<AnnouncementsFormValues, Announcements>(ANNOUNCEMENTS_PATH, {
    method: ANNOUNCEMENTS_ENDPOINTS.create.method,
    schema: announcementsSchema,
    invalidate: [],
  });
  const update = useCommonMutation<AnnouncementsFormValues, Announcements>(
    id === null ? ANNOUNCEMENTS_PATH : announcementsPath(id),
    {
      method: ANNOUNCEMENTS_ENDPOINTS.update.method,
      schema: announcementsSchema,
      invalidate: [],
    },
  );
  return { create, update };
}
