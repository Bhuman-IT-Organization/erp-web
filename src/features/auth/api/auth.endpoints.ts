import { z } from 'zod';
import { callApi, type ApiAdapter, type ApiResult } from '@/lib/api/call-api';
import type { LoginInput } from '@/features/auth/schemas/login.schema';

/**
 * The auth endpoints (contract: erp-api src/v1/auth, plan 01.3-05 `<interfaces>`). Every function
 * is ONE `callApi` call: no axios import, no raw transport, no duration literal here — the shared
 * axios instance behind `callApi` owns the timeout and the interceptors (ADR-0002, ADR-0031 §5).
 * Never throws; discriminated results. Paths are relative, so the request goes to the Nginx
 * origin the page was served from. `adapter` is a test seam only (a fake transport).
 *
 * `login` is a mutation: it is NEVER retried automatically (a retried password check would
 * double-count the lockout). The form offers "Try again" for `RETRYABLE_LOGIN_CODES`.
 */
export type AuthResult<T> = ApiResult<T>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int(),
  csrfToken: z.string(),
  user: z.object({
    staffId: z.number().int(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    isAdmin: z.boolean(),
    // BCP-47 from `tblstaff.default_language`, `null` when unset; optional until every deployment
    // serves an api from plan 03-01. The form writes the `erp_locale` cookie from it (FE-08).
    locale: z.string().nullable().optional(),
  }),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const csrfResponseSchema = z.object({ csrfToken: z.string() });
export type CsrfResponse = z.infer<typeof csrfResponseSchema>;

export const AUTH_PATHS = {
  login: '/api/v1/auth/login',
  csrf: '/api/v1/auth/csrf',
  refresh: '/api/v1/auth/refresh',
  logout: '/api/v1/auth/logout',
} as const;

const CSRF_HEADER = 'x-csrf-token';

export function login(input: LoginInput, adapter?: ApiAdapter): Promise<AuthResult<LoginResponse>> {
  return callApi(AUTH_PATHS.login, {
    method: 'POST',
    body: input,
    schema: loginResponseSchema,
    ...(adapter ? { adapter } : {}),
  });
}

export function fetchCsrf(adapter?: ApiAdapter): Promise<AuthResult<CsrfResponse>> {
  return callApi(AUTH_PATHS.csrf, {
    schema: csrfResponseSchema,
    ...(adapter ? { adapter } : {}),
  });
}

export function refresh(
  csrfToken: string,
  adapter?: ApiAdapter,
): Promise<AuthResult<LoginResponse>> {
  return callApi(AUTH_PATHS.refresh, {
    method: 'POST',
    headers: { [CSRF_HEADER]: csrfToken },
    schema: loginResponseSchema,
    ...(adapter ? { adapter } : {}),
  });
}

export function logout(
  accessToken: string,
  csrfToken: string,
  adapter?: ApiAdapter,
): Promise<AuthResult<null>> {
  return callApi(AUTH_PATHS.logout, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, [CSRF_HEADER]: csrfToken },
    schema: z.null(),
    expectNoContent: true,
    ...(adapter ? { adapter } : {}),
  });
}

/** Codes for which the form shows "Try again" (an explicit click is the only retry path). */
export const RETRYABLE_LOGIN_CODES = [
  'ERP-UPSTREAM-0001',
  'ERP-NETWORK-0001',
  'ERP-TIMEOUT-0001',
] as const;

export function isRetryableLoginCode(code: string): boolean {
  return (RETRYABLE_LOGIN_CODES as readonly string[]).includes(code);
}

/** A message key under the `auth` namespace plus the ICU values it takes; the form renders `t(key, values)`. */
export interface MessageRef {
  readonly key: string;
  readonly values: Record<string, string>;
}

/** The codes with their own `auth.errors.<code>` message (`src/features/auth/messages/<locale>.json`). */
export const KNOWN_LOGIN_CODES = [
  'ERP-AUTH-0001',
  'ERP-AUTH-0006',
  'ERP-AUTH-0007',
  'ERP-VALIDATION-0001',
  'ERP-UPSTREAM-0001',
  'ERP-NETWORK-0001',
  'ERP-TIMEOUT-0001',
] as const;

/**
 * The message key per code — never text (FE-08). One message for ERP-AUTH-0001 whatever the
 * cause (T-1.3-23). `seconds` is the string `'none'` when there is no Retry-After, so the ICU
 * `select` in the message picks its "a moment" / "shortly" branch.
 */
export function messageKeyFor(code: string, retryAfterS: number | null): MessageRef {
  if ((KNOWN_LOGIN_CODES as readonly string[]).includes(code)) {
    return {
      key: `errors.${code}`,
      values: { seconds: retryAfterS === null ? 'none' : String(retryAfterS) },
    };
  }
  return { key: 'errors.unknown', values: { code } };
}
