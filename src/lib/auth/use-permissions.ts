import { z } from 'zod';
import type { ModuleName } from '@/config/modules';
import type { PermissionCode } from '@/config/permissions';
import type { ApiError } from '@/lib/api/api-error';
import { useCommonApi } from '@/lib/api/use-common-api';
import { useSessionStatus } from '@/lib/hooks/use-session';

/**
 * The browser's copy of `GET /api/v1/auth/me` (FE-16). It is PRESENTATION ONLY: it decides what the
 * menu and the buttons show, never what a member may do. Every api call is guarded server side and
 * answers 401/403 regardless (T-3.1-33), and `withAuth`/`withPermission` are a second layer, never
 * the only one.
 *
 * `can` is deliberately byte-for-byte the api's rule — erp-api `AuthService.hasPermission` is
 * `isAdmin || codes.includes(code)` and ADR-0033 decision 4 says the administrator flag bypasses the
 * permission set entirely. If the two ever disagree the menu lies, so they are written the same way
 * on both sides and this comment is the reason.
 *
 * The codes are CLEAN ADR-0033 names: the api's enricher maps every Perfex row through
 * `toCleanPermission` and drops what it cannot map, so a Perfex code can never arrive here (D-12).
 *
 * `/me` is asked only once this tab's session is `signedIn`: the SWR key is `null` until then, so
 * no request is made (WR-08). A `/me` fetched before the token existed was a 401 that SWR cached
 * and never retried (a 4xx is not retryable), which left the menu and `withPermission` anonymous
 * until the window refocused. `isLoading` is true while the session is still `pending`; a
 * `signedOut` session is not loading and can do nothing.
 *
 * `disabledModules` is the deployment's module switch (ADR-0042), equally presentation only: no
 * module of this copy is switchable (`MODULE_NAMES` is empty), and the api refuses a switched-off
 * module's calls anyway.
 */

/** Mirrors erp-api's `meResponseSchema` (`src/v1/auth/dto/auth.dto.ts`); only what the shell reads. */
const meSchema = z.object({
  staffId: z.number().int(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  isAdmin: z.boolean(),
  roleId: z.number().int().nullable(),
  permissions: z.array(z.string()),
  locale: z.string().nullable(),
  /** Absent from an older api: every module on. */
  disabledModules: z.array(z.string()).default([]),
});

export type Me = z.infer<typeof meSchema>;

export interface Permissions {
  readonly isAdmin: boolean;
  readonly codes: readonly string[];
  readonly isLoading: boolean;
  /**
   * The `/me` payload itself (the account menu's name and e-mail), from the SAME SWR key, so a
   * second reader costs no request (D-36). `undefined` while loading, signed out or failed.
   */
  readonly me: Me | undefined;
  /**
   * The `/me` failure, once it has failed (a 5xx after SWR's retries, a timeout, a network error).
   * A failed `/me` also permits nothing, so a guard must check this BEFORE refusing: an outage is
   * not "no access" (D-39, 03.2 RESEARCH Pitfall 7).
   */
  readonly error: ApiError | undefined;
  /** A `/me` request is in flight (SWR's `isValidating`): after an error, the Retry is busy. */
  readonly isValidating: boolean;
  /** Asks `/me` again (the Retry of the guard's inline error). */
  readonly retry: () => void;
  /** Identical semantics to the api's `AuthService.hasPermission`: `isAdmin || codes.includes(code)`. */
  can: (code: PermissionCode) => boolean;
  /** ANY of — the view/viewOwn pair (D-09) and the sidebar's gate. `undefined` means always visible. */
  canAny: (codes: PermissionCode | readonly PermissionCode[] | undefined) => boolean;
  /** The modules this deployment switches off (ADR-0042); empty while loading, signed out or failed. */
  readonly disabledModules: readonly string[];
  /** False while `/me` is loading or failed: the api refuses regardless, this only shapes the screen. */
  isModuleDisabled: (name: ModuleName) => boolean;
}

export function usePermissions(): Permissions {
  const status = useSessionStatus();
  const swr = useCommonApi(status === 'signedIn' ? '/api/v1/auth/me' : null, meSchema);
  const { data } = swr;
  const isLoading = status === 'pending' || swr.isLoading;
  const isAdmin = data?.isAdmin ?? false;
  const codes: readonly string[] = data?.permissions ?? [];
  const can = (code: PermissionCode): boolean => isAdmin || codes.includes(code);
  const canAny = (wanted: PermissionCode | readonly PermissionCode[] | undefined): boolean =>
    wanted === undefined
      ? true
      : typeof wanted === 'string'
        ? can(wanted)
        : wanted.some((code) => can(code));
  const disabledModules: readonly string[] = data?.disabledModules ?? [];
  const isModuleDisabled = (name: ModuleName): boolean => disabledModules.includes(name);
  const retry = (): void => {
    void swr.mutate();
  };
  return {
    isAdmin,
    codes,
    isLoading,
    me: data,
    error: swr.error,
    isValidating: swr.isValidating,
    retry,
    can,
    canAny,
    disabledModules,
    isModuleDisabled,
  };
}
