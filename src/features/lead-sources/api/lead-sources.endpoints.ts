import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  leadSourcesSchema,
  type LeadSources,
  type LeadSourcesFormValues,
} from '@/features/lead-sources/schemas/lead-sources.schema';

/**
 * The resource's wire contract: every call this feature makes, method and path. The api half is
 * erp-api `src/v1/lead-sources` which serves exactly these six routes. The list,
 * `GET …?q&sort&limit&cursor`, answers `{ data: LeadSources[], meta: { nextCursor, prevCursor,
 * total, rangeStart, exportLimit, printLimit } }` (`ListPageTemplate` reads it), name
 * ascending by default; each row includes usage groups so a delete can be refused
 * up front (D-07, D-28). A record is `GET|PATCH …/:id`, a new one `POST` (the body
 * `{ name }`), the export `GET …/export` with the list's query and one `header` per column (D-26,
 * D-42, ADR-0043), and a delete `DELETE …/:id` (204, 404, or 409 while in use).
 *
 * No axios import, no raw transport, no duration literal here: reads go through `useCommonApi`
 * (retried per ADR-0031 §5 by SWR), writes through `useCommonMutation` (NEVER retried; the form
 * offers Retry for a retryable code), FE-03.
 */
export const LEAD_SOURCES_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/lead-sources' },
  export: { method: 'GET', path: '/api/v1/lead-sources/export' },
  detail: { method: 'GET', path: '/api/v1/lead-sources/:id' },
  create: { method: 'POST', path: '/api/v1/lead-sources' },
  update: { method: 'PATCH', path: '/api/v1/lead-sources/:id' },
  remove: { method: 'DELETE', path: '/api/v1/lead-sources/:id' },
} as const;

export const LEAD_SOURCES_PATH = LEAD_SOURCES_ENDPOINTS.list.path satisfies ApiPath;
export const LEAD_SOURCES_EXPORT_PATH = LEAD_SOURCES_ENDPOINTS.export.path satisfies ApiPath;

/**
 * The export's columns in the api's order (Perfex's ID, Source Name, and Total Leads);
 * `ListExport` types one label per column against it.
 */
export const LEAD_SOURCES_EXPORT_COLUMNS = ['id', 'name', 'totalLeads'] as const;
export type LeadSourcesExportColumn = (typeof LEAD_SOURCES_EXPORT_COLUMNS)[number];

/** One record's path (its detail read, its update, its seed from the list row), the id encoded. */
export function leadSourcesPath(id: string): ApiPath {
  return LEAD_SOURCES_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

export const leadSourcesHooks = createResourceHooks<LeadSources, LeadSourcesFormValues>(
  LEAD_SOURCES_PATH,
  leadSourcesSchema,
);

/** The 400 whose problem body carries `issues` the form maps onto its fields. */
export const VALIDATION_CODE = 'ERP-VALIDATION-0001';

/**
 * The api's one not-found answer: a record that is not there, or one the caller may not read (the
 * same 404, so an id reveals nothing). A permalink to it says so in plain words (D-32).
 */
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

/**
 * The api's refusal of a delete while any reference group uses the source (409, D-07, D-28). The
 * list refuses up front from the row's usage (`refusedCode`) and keeps the live answer for the race.
 */
export const IN_USE_CODE = 'ERP-LEADSOURCES-0001';

/** The api's refusal of a delete while this is the configured default source. */
export const DEFAULT_SOURCE_CODE = 'ERP-LEADSOURCES-0002';

/**
 * The feature's own codes, each with a `lead-sources.errors.<code>` message: `useErrorText` renders
 * a refusal as `'errors.<code>'` of this namespace (messages/en.json), so the list, the dialog and
 * the save summary say it in the feature's words (D-32).
 */
export const LEAD_SOURCES_ERRORS: FeatureErrorCodes = {
  namespace: 'lead-sources',
  codes: [NOT_FOUND_CODE, IN_USE_CODE, DEFAULT_SOURCE_CODE],
};
