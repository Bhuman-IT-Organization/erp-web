import {
  CUSTOMER_GROUPS_ENDPOINTS,
  CUSTOMER_GROUPS_PATH,
  customerGroupsPath,
} from '@/features/customer-groups/api/customer-groups.endpoints';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  customerGroupsSchema,
  type CustomerGroups,
  type CustomerGroupsFormValues,
} from '@/features/customer-groups/schemas/customer-groups.schema';

/** The two writes of the form, one for each screen. */
export interface CustomerGroupsSave {
  readonly create: CommonMutation<CustomerGroupsFormValues, CustomerGroups>;
  readonly update: CommonMutation<CustomerGroupsFormValues, CustomerGroups>;
}

/**
 * The writes (FE-03): `CUSTOMER_GROUPS_ENDPOINTS.create` and `.update`, each with the body
 * `{ name }`, NEVER retried automatically (ADR-0031 §5). They invalidate nothing: the screen swaps
 * the saved row into the cached list pages after an edit and revalidates them after a create. With
 * no id (the create screen) `update` is never triggered.
 */
export function useSaveCustomerGroups(id: string | null): CustomerGroupsSave {
  const create = useCommonMutation<CustomerGroupsFormValues, CustomerGroups>(CUSTOMER_GROUPS_PATH, {
    method: CUSTOMER_GROUPS_ENDPOINTS.create.method,
    schema: customerGroupsSchema,
    invalidate: [],
  });
  const update = useCommonMutation<CustomerGroupsFormValues, CustomerGroups>(
    id === null ? CUSTOMER_GROUPS_PATH : customerGroupsPath(id),
    {
      method: CUSTOMER_GROUPS_ENDPOINTS.update.method,
      schema: customerGroupsSchema,
      invalidate: [],
    },
  );
  return { create, update };
}
