import {
  paymentModeActivePath,
  paymentModesHooks,
  PAYMENT_MODES_ENDPOINTS,
} from '@/features/payment-modes/api/payment-modes.endpoints';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';
import {
  paymentModesActiveSchema,
  type PaymentModes,
  type PaymentModesActive,
} from '@/features/payment-modes/schemas/payment-modes.schema';

/**
 * The record read (FE-03): `GET /api/v1/payment-modes/:id` through SWR under the global policy: a
 * 5xx, a timeout or a network failure is retried, a 4xx never. A `null` id (the create screen) is
 * a `null` key: no request. The list itself is `ListPageTemplate`'s read, not a hook here.
 */
export function usePaymentModes(id: string | null): CommonApiResult<PaymentModes> {
  return paymentModesHooks.useOne(id);
}

/**
 * `DELETE /api/v1/payment-modes/:id` (the `useDeleteRole` shape): 204 is success and revalidates the
 * list pages (the totals moved); a 409 `ERP-PAYMENTMODES-0001` (still in use) or
 * `ERP-PAYMENTMODES-0002` (the credit expense mode), or a 404, is a resolved failure the dialog
 * shows. A write is NEVER retried (ADR-0031 §5).
 */
export function useDeletePaymentMode(id: string): CommonMutation<undefined, null> {
  return paymentModesHooks.useRemove(id);
}

/**
 * `PATCH /api/v1/payment-modes/:id/active` with `{ active }`, the list's one-click switch (D-34, the
 * custom-fields shape): its own mutation, NEVER retried (ADR-0031 §5); it answers `{ id, active }`
 * and the list swaps the row in place, so nothing is invalidated (no list page is asked again).
 */
export function usePaymentModeActive(
  id: string,
): CommonMutation<{ active: boolean }, PaymentModesActive> {
  return useCommonMutation(paymentModeActivePath(id), {
    method: PAYMENT_MODES_ENDPOINTS.active.method,
    schema: paymentModesActiveSchema,
    invalidate: [],
  });
}
