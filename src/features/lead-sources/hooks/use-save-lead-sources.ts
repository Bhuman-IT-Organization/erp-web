import {
  LEAD_SOURCES_ENDPOINTS,
  LEAD_SOURCES_PATH,
  leadSourcesPath,
} from '@/features/lead-sources/api/lead-sources.endpoints';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  leadSourcesSchema,
  type LeadSources,
  type LeadSourcesFormValues,
} from '@/features/lead-sources/schemas/lead-sources.schema';

/** The two writes of the form, one for each screen. */
export interface LeadSourcesSave {
  readonly create: CommonMutation<LeadSourcesFormValues, LeadSources>;
  readonly update: CommonMutation<LeadSourcesFormValues, LeadSources>;
}

/**
 * The writes (FE-03): `LEAD_SOURCES_ENDPOINTS.create` and `.update`, each with the body `{ name }`:
 * the method and the path come from the table the api module is held to, NEVER retried
 * automatically (ADR-0031 §5); a 400 carries `issues` for the form, a 404 says the record is gone.
 * They invalidate nothing: the screen swaps the saved row into the cached list pages after an edit
 * and revalidates them after a create, so no list page is asked again for an edit (D-36). With no
 * id (the create screen) `update` is never triggered.
 */
export function useSaveLeadSources(id: string | null): LeadSourcesSave {
  const create = useCommonMutation<LeadSourcesFormValues, LeadSources>(LEAD_SOURCES_PATH, {
    method: LEAD_SOURCES_ENDPOINTS.create.method,
    schema: leadSourcesSchema,
    invalidate: [],
  });
  const update = useCommonMutation<LeadSourcesFormValues, LeadSources>(
    id === null ? LEAD_SOURCES_PATH : leadSourcesPath(id),
    { method: LEAD_SOURCES_ENDPOINTS.update.method, schema: leadSourcesSchema, invalidate: [] },
  );
  return { create, update };
}
