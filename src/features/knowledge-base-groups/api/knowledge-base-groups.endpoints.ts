import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  knowledgeBaseGroupRowSchema,
  type KnowledgeBaseGroupRow,
  type KnowledgeBaseGroupWriteValues,
} from '@/features/knowledge-base-groups/schemas/knowledge-base-groups.schema';

export const KNOWLEDGE_BASE_GROUPS_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/knowledge-base-groups' },
  export: { method: 'GET', path: '/api/v1/knowledge-base-groups/export' },
  detail: { method: 'GET', path: '/api/v1/knowledge-base-groups/:id' },
  create: { method: 'POST', path: '/api/v1/knowledge-base-groups' },
  update: { method: 'PATCH', path: '/api/v1/knowledge-base-groups/:id' },
  remove: { method: 'DELETE', path: '/api/v1/knowledge-base-groups/:id' },
} as const;

export const KNOWLEDGE_BASE_GROUPS_PATH = KNOWLEDGE_BASE_GROUPS_ENDPOINTS.list
  .path satisfies ApiPath;
export const KNOWLEDGE_BASE_GROUPS_EXPORT_PATH = KNOWLEDGE_BASE_GROUPS_ENDPOINTS.export
  .path satisfies ApiPath;

export const KNOWLEDGE_BASE_GROUPS_EXPORT_COLUMNS = [
  'id',
  'name',
  'color',
  'groupOrder',
  'active',
  'totalArticles',
] as const;
export type KnowledgeBaseGroupsExportColumn = (typeof KNOWLEDGE_BASE_GROUPS_EXPORT_COLUMNS)[number];

export function knowledgeBaseGroupPath(id: string): ApiPath {
  return KNOWLEDGE_BASE_GROUPS_ENDPOINTS.detail.path.replace(
    ':id',
    encodeURIComponent(id),
  ) as ApiPath;
}

export const knowledgeBaseGroupHooks = createResourceHooks<
  KnowledgeBaseGroupRow,
  KnowledgeBaseGroupWriteValues,
  Partial<KnowledgeBaseGroupWriteValues>
>(KNOWLEDGE_BASE_GROUPS_PATH, knowledgeBaseGroupRowSchema);

export const VALIDATION_CODE = 'ERP-VALIDATION-0001';
export const NOT_FOUND_CODE = 'ERP-CORE-0004';
export const GROUP_IN_USE_CODE = 'ERP-KNOWLEDGEBASEGROUPS-0001';

export const KNOWLEDGE_BASE_GROUPS_ERRORS: FeatureErrorCodes = {
  namespace: 'knowledge-base-groups',
  codes: [NOT_FOUND_CODE, GROUP_IN_USE_CODE],
};
