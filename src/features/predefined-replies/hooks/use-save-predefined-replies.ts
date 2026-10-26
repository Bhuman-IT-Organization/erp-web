import {
  PREDEFINED_REPLIES_ENDPOINTS,
  PREDEFINED_REPLIES_PATH,
  predefinedRepliesPath,
} from '@/features/predefined-replies/api/predefined-replies.endpoints';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  predefinedRepliesSchema,
  type PredefinedReplies,
  type PredefinedRepliesFormValues,
} from '@/features/predefined-replies/schemas/predefined-replies.schema';

/** The two writes of the form, one for each screen. */
export interface PredefinedRepliesSave {
  readonly create: CommonMutation<PredefinedRepliesFormValues, PredefinedReplies>;
  readonly update: CommonMutation<PredefinedRepliesFormValues, PredefinedReplies>;
}

/**
 * The writes (FE-03): `PREDEFINED_REPLIES_ENDPOINTS.create` and `.update`: the method and the path
 * come from the table the api module serves, NEVER
 * retried automatically (ADR-0031 §5); a 400 carries `issues` for the form. They invalidate
 * nothing: the screen swaps the saved row into the cached list pages after an edit and revalidates
 * them after a create, so no list page is asked again for an edit (D-36). With no id (the create
 * screen) `update` is never triggered.
 */
export function useSavePredefinedReplies(id: string | null): PredefinedRepliesSave {
  const create = useCommonMutation<PredefinedRepliesFormValues, PredefinedReplies>(
    PREDEFINED_REPLIES_PATH,
    {
      method: PREDEFINED_REPLIES_ENDPOINTS.create.method,
      schema: predefinedRepliesSchema,
      invalidate: [],
    },
  );
  const update = useCommonMutation<PredefinedRepliesFormValues, PredefinedReplies>(
    id === null ? PREDEFINED_REPLIES_PATH : predefinedRepliesPath(id),
    {
      method: PREDEFINED_REPLIES_ENDPOINTS.update.method,
      schema: predefinedRepliesSchema,
      invalidate: [],
    },
  );
  return { create, update };
}
