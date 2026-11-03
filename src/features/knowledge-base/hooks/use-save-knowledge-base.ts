import {
  KNOWLEDGE_BASE_ENDPOINTS,
  KNOWLEDGE_BASE_PATH,
  knowledgeBasePath,
} from '@/features/knowledge-base/api/knowledge-base.endpoints';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  knowledgeBaseSchema,
  type KnowledgeBase,
  type KnowledgeBaseFormValues,
} from '@/features/knowledge-base/schemas/knowledge-base.schema';

/** The two writes of the form, one for each screen. */
export interface KnowledgeBaseSave {
  readonly create: CommonMutation<KnowledgeBaseFormValues, KnowledgeBase>;
  readonly update: CommonMutation<KnowledgeBaseFormValues, KnowledgeBase>;
}

/**
 * The writes (FE-03): `KNOWLEDGE_BASE_ENDPOINTS.create` and `.update`, each with the body `{ name }`:
 * the method and the path come from the table the api module is held to, NEVER retried
 * automatically (ADR-0031 §5); a 400 carries `issues` for the form, a 404 says the record is gone.
 * They invalidate nothing: the screen swaps the saved row into the cached list pages after an edit
 * and revalidates them after a create, so no list page is asked again for an edit (D-36). With no
 * id (the create screen) `update` is never triggered.
 */
export function useSaveKnowledgeBase(id: string | null): KnowledgeBaseSave {
  const create = useCommonMutation<KnowledgeBaseFormValues, KnowledgeBase>(KNOWLEDGE_BASE_PATH, {
    method: KNOWLEDGE_BASE_ENDPOINTS.create.method,
    schema: knowledgeBaseSchema,
    invalidate: [],
  });
  const update = useCommonMutation<KnowledgeBaseFormValues, KnowledgeBase>(
    id === null ? KNOWLEDGE_BASE_PATH : knowledgeBasePath(id),
    { method: KNOWLEDGE_BASE_ENDPOINTS.update.method, schema: knowledgeBaseSchema, invalidate: [] },
  );
  return { create, update };
}
