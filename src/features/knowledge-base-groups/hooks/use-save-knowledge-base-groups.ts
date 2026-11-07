import {
  KNOWLEDGE_BASE_GROUPS_ENDPOINTS,
  KNOWLEDGE_BASE_GROUPS_PATH,
  knowledgeBaseGroupPath,
} from '@/features/knowledge-base-groups/api/knowledge-base-groups.endpoints';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  knowledgeBaseGroupRowSchema,
  type KnowledgeBaseGroupRow,
  type KnowledgeBaseGroupWriteValues,
} from '@/features/knowledge-base-groups/schemas/knowledge-base-groups.schema';

export interface KnowledgeBaseGroupSave {
  readonly create: CommonMutation<KnowledgeBaseGroupWriteValues, KnowledgeBaseGroupRow>;
  readonly update: CommonMutation<KnowledgeBaseGroupWriteValues, KnowledgeBaseGroupRow>;
}

/** The two writes of the form. NEVER retried automatically; they invalidate nothing (the screen does it). */
export function useSaveKnowledgeBaseGroups(id: string | null): KnowledgeBaseGroupSave {
  const create = useCommonMutation<KnowledgeBaseGroupWriteValues, KnowledgeBaseGroupRow>(
    KNOWLEDGE_BASE_GROUPS_PATH,
    {
      method: KNOWLEDGE_BASE_GROUPS_ENDPOINTS.create.method,
      schema: knowledgeBaseGroupRowSchema,
      invalidate: [],
    },
  );
  const update = useCommonMutation<KnowledgeBaseGroupWriteValues, KnowledgeBaseGroupRow>(
    id === null ? KNOWLEDGE_BASE_GROUPS_PATH : knowledgeBaseGroupPath(id),
    {
      method: KNOWLEDGE_BASE_GROUPS_ENDPOINTS.update.method,
      schema: knowledgeBaseGroupRowSchema,
      invalidate: [],
    },
  );
  return { create, update };
}
