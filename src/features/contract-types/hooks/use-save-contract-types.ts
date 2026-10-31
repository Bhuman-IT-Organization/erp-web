import {
  CONTRACT_TYPES_ENDPOINTS,
  CONTRACT_TYPES_PATH,
  contractTypesPath,
} from '@/features/contract-types/api/contract-types.endpoints';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  contractTypesSchema,
  type ContractTypes,
  type ContractTypesFormValues,
} from '@/features/contract-types/schemas/contract-types.schema';

/** The two writes of the form, one for each screen. */
export interface ContractTypesSave {
  readonly create: CommonMutation<ContractTypesFormValues, ContractTypes>;
  readonly update: CommonMutation<ContractTypesFormValues, ContractTypes>;
}

/**
 * The writes (FE-03): `CONTRACT_TYPES_ENDPOINTS.create` and `.update`: the method and the path
 * come from the table the api module serves, NEVER
 * retried automatically (ADR-0031 §5); a 400 carries `issues` for the form. They invalidate
 * nothing: the screen swaps the saved row into the cached list pages after an edit and revalidates
 * them after a create, so no list page is asked again for an edit (D-36). With no id (the create
 * screen) `update` is never triggered.
 */
export function useSaveContractTypes(id: string | null): ContractTypesSave {
  const create = useCommonMutation<ContractTypesFormValues, ContractTypes>(CONTRACT_TYPES_PATH, {
    method: CONTRACT_TYPES_ENDPOINTS.create.method,
    schema: contractTypesSchema,
    invalidate: [],
  });
  const update = useCommonMutation<ContractTypesFormValues, ContractTypes>(
    id === null ? CONTRACT_TYPES_PATH : contractTypesPath(id),
    { method: CONTRACT_TYPES_ENDPOINTS.update.method, schema: contractTypesSchema, invalidate: [] },
  );
  return { create, update };
}
