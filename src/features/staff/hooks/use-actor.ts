import { AUTH_ME_PATH } from '@/features/staff/api/staff.endpoints';
import { actorSchema } from '@/features/staff/schemas/staff.schema';
import { useCommonApi } from '@/lib/api/use-common-api';
import { useSessionStatus } from '@/lib/hooks/use-session';

/**
 * The actor's own administrator flag — the ONE gate on every granting control (ADR-0034 d.2).
 *
 * It is read from the session's `/api/v1/auth/me` payload and NEVER from a permission code:
 * `staff.roles.*` and `staff.members.edit` gate nothing about granting in Node, precisely because a
 * code can be handed out by the mechanism it protects. `usePermissions()` is deliberately not used
 * here — it is the menu's presentation helper, and reading a code for this decision would
 * reintroduce the confusion ADR-0034 closes.
 *
 * The key is the same string `usePermissions` uses, and `schemas/staff.schema.ts`'s `actorSchema`
 * declares the same fields as its `meSchema`, so the two share one cache entry with no loss
 * whichever fetches first. `/me` is asked only once this tab's session is `signedIn`: before that
 * the key is null, exactly as `usePermissions` does (WR-08) — a `/me` fetched before the token
 * existed was a 401 SWR cached and never retried.
 *
 * Presentation only, like every client-side gate: the api refuses a granting write from a
 * non-administrator with 403 `ERP-IDENTITY-0001` whatever the UI rendered (FE-16, T-3.1-60).
 */
export interface ActorAccess {
  /** `tblstaff.admin = 1`. False while the session or `/me` is still in flight — fail closed. */
  readonly isAdmin: boolean;
  /** The actor's own staff id, `null` until `/me` answers. */
  readonly staffId: number | null;
  readonly isLoading: boolean;
}

export function useActor(): ActorAccess {
  const status = useSessionStatus();
  const { data, isLoading } = useCommonApi(
    status === 'signedIn' ? AUTH_ME_PATH : null,
    actorSchema,
  );
  return {
    isAdmin: data?.isAdmin ?? false,
    staffId: data?.staffId ?? null,
    isLoading: status === 'pending' || isLoading,
  };
}
