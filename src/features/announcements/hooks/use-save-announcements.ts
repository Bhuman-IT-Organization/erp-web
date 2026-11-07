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
import type { ApiResult } from '@/lib/api/call-api';

/** The two writes of the form, one for each screen. */
export type AnnouncementsSaveValues = Omit<AnnouncementsFormValues, 'message'> & {
  readonly message?: string;
};

type AnnouncementsSaveMutation = Omit<
  CommonMutation<AnnouncementsRequest, Announcements>,
  'trigger'
> & {
  readonly trigger: (values: AnnouncementsSaveValues) => Promise<ApiResult<Announcements>>;
};

export interface AnnouncementsSave {
  readonly create: AnnouncementsSaveMutation;
  readonly update: AnnouncementsSaveMutation;
}

/** The API uses camelCase visibility fields; the form keeps the table's field names. */
interface AnnouncementsRequest {
  readonly name: string;
  readonly message?: string;
  readonly showToUsers: boolean;
  readonly showToStaff: boolean;
  readonly showName: boolean;
}

function toRequest(values: AnnouncementsSaveValues): AnnouncementsRequest {
  return {
    name: values.name,
    ...(values.message === undefined ? {} : { message: values.message }),
    showToUsers: values.showtousers,
    showToStaff: values.showtostaff,
    showName: values.showname,
  };
}

/**
 * The writes (FE-03): `ANNOUNCEMENTS_ENDPOINTS.create` and `.update`, each with the body
 * `{ name, message?, showToUsers, showToStaff, showName }`, NEVER retried automatically
 * (ADR-0031 §5). They invalidate nothing: the screen swaps the saved row into the cached list
 * pages after an edit and revalidates them after a create. With no id (the create screen) `update`
 * is never triggered.
 */
export function useSaveAnnouncements(id: string | null): AnnouncementsSave {
  const create = useCommonMutation<AnnouncementsRequest, Announcements>(ANNOUNCEMENTS_PATH, {
    method: ANNOUNCEMENTS_ENDPOINTS.create.method,
    schema: announcementsSchema,
    invalidate: [],
  });
  const update = useCommonMutation<AnnouncementsRequest, Announcements>(
    id === null ? ANNOUNCEMENTS_PATH : announcementsPath(id),
    {
      method: ANNOUNCEMENTS_ENDPOINTS.update.method,
      schema: announcementsSchema,
      invalidate: [],
    },
  );
  return {
    create: { ...create, trigger: (values) => create.trigger(toRequest(values)) },
    update: { ...update, trigger: (values) => update.trigger(toRequest(values)) },
  };
}
