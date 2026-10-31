// @vitest-environment happy-dom
import { servicesHooks } from '@/features/services/api/services.endpoints';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import type { CommonMutation } from '@/lib/api/use-common-mutation';
import type { Services } from '@/features/services/schemas/services.schema';

/** `GET /api/v1/services/:id`. A `null` id (the create screen) is no request. */
export function useServices(id: string | null): CommonApiResult<Services> {
  return servicesHooks.useOne(id);
}

/** `DELETE /api/v1/services/:id`: 204 revalidates the list; a 409 or 404 is a resolved failure the dialog shows. */
export function useDeleteService(id: string): CommonMutation<undefined, null> {
  return servicesHooks.useRemove(id);
}
