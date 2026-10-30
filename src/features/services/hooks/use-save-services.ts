// @vitest-environment happy-dom
import {
  SERVICES_ENDPOINTS,
  SERVICES_PATH,
  servicesPath,
} from '@/features/services/api/services.endpoints';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  servicesSchema,
  type Services,
  type ServicesFormValues,
} from '@/features/services/schemas/services.schema';

export interface ServicesSave {
  readonly create: CommonMutation<ServicesFormValues, Services>;
  readonly update: CommonMutation<ServicesFormValues, Services>;
}

/** The two writes of the form. NEVER retried automatically; they invalidate nothing (the screen does it). */
export function useSaveServices(id: string | null): ServicesSave {
  const create = useCommonMutation<ServicesFormValues, Services>(SERVICES_PATH, {
    method: SERVICES_ENDPOINTS.create.method,
    schema: servicesSchema,
    invalidate: [],
  });
  const update = useCommonMutation<ServicesFormValues, Services>(
    id === null ? SERVICES_PATH : servicesPath(id),
    { method: SERVICES_ENDPOINTS.update.method, schema: servicesSchema, invalidate: [] },
  );
  return { create, update };
}
