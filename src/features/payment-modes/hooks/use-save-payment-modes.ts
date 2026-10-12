import {
  PAYMENT_MODES_ENDPOINTS,
  PAYMENT_MODES_PATH,
  paymentModesPath,
} from '@/features/payment-modes/api/payment-modes.endpoints';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  paymentModesSchema,
  type PaymentModes,
  type PaymentModesFormValues,
} from '@/features/payment-modes/schemas/payment-modes.schema';

/** The two writes of the form, one for each screen. */
export interface PaymentModesSave {
  readonly create: CommonMutation<PaymentModesFormValues, PaymentModes>;
  readonly update: CommonMutation<PaymentModesFormValues, PaymentModes>;
}

/**
 * The writes (FE-03): `PAYMENT_MODES_ENDPOINTS.create` and `.update`, each with the seven fields of
 * Perfex's form (every box sent, so an unticked one saves 0, D-34): the method and the path come
 * from the table the api module is held to, NEVER retried automatically (ADR-0031 §5); a 400
 * carries `issues` for the form, a 404 says the record is gone. They invalidate
 * nothing: the screen swaps the saved row into the cached list pages after an edit and revalidates
 * them after a create, so no list page is asked again for an edit (D-36). With no id (the create
 * screen) `update` is never triggered.
 */
export function useSavePaymentModes(id: string | null): PaymentModesSave {
  const create = useCommonMutation<PaymentModesFormValues, PaymentModes>(PAYMENT_MODES_PATH, {
    method: PAYMENT_MODES_ENDPOINTS.create.method,
    schema: paymentModesSchema,
    invalidate: [],
  });
  const update = useCommonMutation<PaymentModesFormValues, PaymentModes>(
    id === null ? PAYMENT_MODES_PATH : paymentModesPath(id),
    { method: PAYMENT_MODES_ENDPOINTS.update.method, schema: paymentModesSchema, invalidate: [] },
  );
  return { create, update };
}
