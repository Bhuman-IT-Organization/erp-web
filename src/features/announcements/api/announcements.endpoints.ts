import type { ApiPath } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  announcementsSchema,
  type Announcements,
  type AnnouncementsFormValues,
} from '@/features/announcements/schemas/announcements.schema';

/** The wire contract: the six routes of erp-api `src/v1/announcements` (including export). */
export const ANNOUNCEMENTS_ENDPOINTS = {
  list: { method: 'GET', path: '/api/v1/announcements' },
  detail: { method: 'GET', path: '/api/v1/announcements/:id' },
  create: { method: 'POST', path: '/api/v1/announcements' },
  update: { method: 'PATCH', path: '/api/v1/announcements/:id' },
  remove: { method: 'DELETE', path: '/api/v1/announcements/:id' },
  export: { method: 'GET', path: '/api/v1/announcements/export' },
} as const;

export const ANNOUNCEMENTS_PATH = ANNOUNCEMENTS_ENDPOINTS.list.path satisfies ApiPath;
export const ANNOUNCEMENTS_EXPORT_PATH = ANNOUNCEMENTS_ENDPOINTS.export.path satisfies ApiPath;
export const ANNOUNCEMENTS_EXPORT_COLUMNS = ['id', 'name', 'dateadded'] as const;

export function announcementsPath(id: string): ApiPath {
  return ANNOUNCEMENTS_ENDPOINTS.detail.path.replace(':id', encodeURIComponent(id)) as ApiPath;
}

export const announcementsHooks = createResourceHooks<Announcements, AnnouncementsFormValues>(
  ANNOUNCEMENTS_PATH,
  announcementsSchema,
);

export const VALIDATION_CODE = 'ERP-VALIDATION-0001';
export const NOT_FOUND_CODE = 'ERP-CORE-0004';

export const ANNOUNCEMENTS_ERRORS: FeatureErrorCodes = {
  namespace: 'announcements',
  codes: [NOT_FOUND_CODE],
};
