import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  knowledgeBaseSchema,
  knowledgeBaseGroupRowSchema,
  type KnowledgeBase,
  type KnowledgeBaseFormValues,
  type KnowledgeBaseGroupRow,
  type KnowledgeBaseGroupFormValues,
} from '@/features/knowledge-base/schemas/knowledge-base.schema';

/**
 * The resource's wire contract: every call this feature makes, method and path. The api half is
 * erp-api `src/v1/knowledge-base`, which serves exactly these six routes. The list,
 * `GET …?q&sort&limit&cursor`, answers `{ data: KnowledgeBase[], meta: { nextCursor, prevCursor,
 * total, rangeStart, exportLimit, printLimit } }` (BE-19; `ListPageTemplate` reads it), the id
 * descending by default; a row is the whole record: the knowledge base, its Date Created (an
 * instant, or `null` when Perfex stored none) and its six usage groups (so a delete is refused up
 * front, D-07, D-28). A record is `GET|PATCH …/:id`, a new one `POST` (the body `{ name }`), the
 * export `GET …/export` with the list's query and one `header` per column (D-26, D-42, ADR-0043),
 * and a delete `DELETE …/:id` (204, 404, or 409 while in use).
 *
 * No axios import, no raw transport, no duration literal here: reads go through `useCommonApi`
 * (retried per ADR-0031 §5 by SWR), writes through `useCommonMutation` (NEVER retried; the form
 * offers Retry for a retryable code), FE-03.
 */
export const KNOWLEDGE_BASE_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/knowledge-base' },
  export: { method: 'GET', path: '/api/v1/knowledge-base/export' },
  detail: { method: 'GET', path: '/api/v1/knowledge-base/:id' },
  create: { method: 'POST', path: '/api/v1/knowledge-base' },
  update: { method: 'PATCH', path: '/api/v1/knowledge-base/:id' },
  remove: { method: 'DELETE', path: '/api/v1/knowledge-base/:id' },
} as const;

export const KNOWLEDGE_BASE_PATH = KNOWLEDGE_BASE_ENDPOINTS.list.path satisfies ApiPath;
export const KNOWLEDGE_BASE_EXPORT_PATH = KNOWLEDGE_BASE_ENDPOINTS.export.path satisfies ApiPath;

/**
 * The export's columns in the api's order (erp-api's export columns: Perfex's ID, Knowledge Base Name
 * and Date Created); `ListExport` types one label per column against it. The usage is never exported.
 */
export const KNOWLEDGE_BASE_EXPORT_COLUMNS = ['id', 'name', 'dateCreated'] as const;
export type KnowledgeBaseExportColumn = (typeof KNOWLEDGE_BASE_EXPORT_COLUMNS)[number];

/** One record's path (its detail read, its update, its seed from the list row), the id encoded. */
export function knowledgeBasePath(id: string): ApiPath {
  return KNOWLEDGE_BASE_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

export const knowledgeBaseHooks = createResourceHooks<KnowledgeBase, KnowledgeBaseFormValues>(
  KNOWLEDGE_BASE_PATH,
  knowledgeBaseSchema,
);

export const KNOWLEDGE_BASE_GROUPS_PATH = '/api/v1/knowledge-base/groups' as ApiPath;
export const KNOWLEDGE_BASE_GROUPS_EXPORT_PATH = '/api/v1/knowledge-base/groups/export' as ApiPath;

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
  return `${KNOWLEDGE_BASE_GROUPS_PATH}/${encodeURIComponent(id)}` as ApiPath;
}

export const knowledgeBaseGroupHooks = createResourceHooks<
  KnowledgeBaseGroupRow,
  KnowledgeBaseGroupFormValues,
  Partial<KnowledgeBaseGroupFormValues> & { active?: boolean }
>(KNOWLEDGE_BASE_GROUPS_PATH, knowledgeBaseGroupRowSchema);

/** The 400 whose problem body carries `issues` the form maps onto its fields. */
export const VALIDATION_CODE = 'ERP-VALIDATION-0001';

/**
 * The api's one not-found answer: a record that is not there, or one the caller may not read (the
 * same 404, so an id reveals nothing). A permalink to it says so in plain words (D-32).
 */
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

/**
 * The api's refusal of a delete while anything still uses the knowledge base: purchase requests,
 * purchase orders, purchase quotations, shipping charges, expenses or assets (409, D-07, D-28). The
 * list refuses up front from the row's usage (`refusedCode`) and keeps the live answer for the race.
 */
export const IN_USE_CODE = 'ERP-KNOWLEDGEBASE-0001';

export const GROUP_IN_USE_CODE = 'ERP-KNOWLEDGEBASE-0002';

/**
 * The feature's own codes, each with a `knowledge-base.errors.<code>` message: `useErrorText` renders
 * a refusal as `'errors.<code>'` of this namespace (messages/en.json), so the list, the dialog and
 * the save summary say it in the feature's words (D-32).
 */
export const KNOWLEDGE_BASE_ERRORS: FeatureErrorCodes = {
  namespace: 'knowledge-base',
  codes: [NOT_FOUND_CODE, IN_USE_CODE, GROUP_IN_USE_CODE],
};
