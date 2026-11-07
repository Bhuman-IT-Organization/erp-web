import {
  knowledgeBaseGroupHooks,
  knowledgeBaseGroupPath,
} from '@/features/knowledge-base-groups/api/knowledge-base-groups.endpoints';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  knowledgeBaseGroupRowSchema,
  type KnowledgeBaseGroupRow,
} from '@/features/knowledge-base-groups/schemas/knowledge-base-groups.schema';

/** `GET /api/v1/knowledge-base-groups/:id`. A `null` id (the create screen) is no request. */
export function useKnowledgeBaseGroup(id: string | null): CommonApiResult<KnowledgeBaseGroupRow> {
  return knowledgeBaseGroupHooks.useOne(id);
}

/** `DELETE /api/v1/knowledge-base-groups/:id`: 204 revalidates the list; a 409 or 404 is a resolved failure the dialog shows. */
export function useDeleteKnowledgeBaseGroup(id: string): CommonMutation<undefined, null> {
  return knowledgeBaseGroupHooks.useRemove(id);
}

/** Active switch toggle mutation on `/api/v1/knowledge-base-groups/:id`. */
export function useUpdateKnowledgeBaseGroupActive(
  id: string,
): CommonMutation<{ disabled: boolean }, KnowledgeBaseGroupRow> {
  return useCommonMutation(knowledgeBaseGroupPath(id), {
    method: 'PATCH',
    schema: knowledgeBaseGroupRowSchema,
    invalidate: [],
  });
}
