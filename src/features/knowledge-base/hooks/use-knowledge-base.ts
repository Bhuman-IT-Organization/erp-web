import {
  knowledgeBaseHooks,
  knowledgeBaseGroupHooks,
} from '@/features/knowledge-base/api/knowledge-base.endpoints';
import type { Params } from '@/lib/api/keys';
import type { CommonApiResult, ListPage } from '@/lib/api/use-common-api';
import type { CommonMutation } from '@/lib/api/use-common-mutation';
import type {
  KnowledgeBase,
  KnowledgeBaseGroupRow,
  KnowledgeBaseGroupFormValues,
} from '@/features/knowledge-base/schemas/knowledge-base.schema';

/**
 * The record read (FE-03): `GET /api/v1/knowledge-base/:id` through SWR under the global policy: a
 * 5xx, a timeout or a network failure is retried, a 4xx never. A `null` id (the create screen) is
 * a `null` key: no request. The list itself is `ListPageTemplate`'s read, not a hook here.
 */
export function useKnowledgeBase(id: string | null): CommonApiResult<KnowledgeBase> {
  return knowledgeBaseHooks.useOne(id);
}

/**
 * `DELETE /api/v1/knowledge-base/:id` (the `useDeleteRole` shape): 204 is success and revalidates the
 * list pages (the totals moved); a 409 `ERP-KNOWLEDGEBASE-0001` (still in use) or a 404 is a resolved
 * failure the dialog shows. A write is NEVER retried (ADR-0031 §5).
 */
export function useDeleteKnowledgeBase(id: string): CommonMutation<undefined, null> {
  return knowledgeBaseHooks.useRemove(id);
}

export function useKnowledgeBaseGroups(
  params?: Params,
): CommonApiResult<ListPage<KnowledgeBaseGroupRow>> {
  return knowledgeBaseGroupHooks.useList(params);
}

export function useKnowledgeBaseGroup(id: string | null): CommonApiResult<KnowledgeBaseGroupRow> {
  return knowledgeBaseGroupHooks.useOne(id);
}

export function useCreateKnowledgeBaseGroup(): CommonMutation<
  KnowledgeBaseGroupFormValues,
  KnowledgeBaseGroupRow
> {
  return knowledgeBaseGroupHooks.useCreate();
}

export function useUpdateKnowledgeBaseGroup(
  id: string,
): CommonMutation<
  Partial<KnowledgeBaseGroupFormValues> & { active?: boolean },
  KnowledgeBaseGroupRow
> {
  return knowledgeBaseGroupHooks.useUpdate(id);
}

export function useDeleteKnowledgeBaseGroup(id: string): CommonMutation<undefined, null> {
  return knowledgeBaseGroupHooks.useRemove(id);
}
