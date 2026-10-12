/**
 * The shared error map (FE-13: this fills the reserved `src/lib/errors`). A problem-details code
 * becomes a message KEY, never text: the key names plain-language copy in a message file, and no
 * error code, HTTP status or technical wording is ever rendered (D-32). The ERP code is for logs
 * only (`log.warn`); the api's own `message` is never shown.
 *
 * A feature's own codes (`ERP-IDENTITY-*` …) resolve to `<feature>.errors.<code>` first; the shared
 * transport, auth and validation codes to `common.errors.<code>`; anything else to
 * `common.errors.unknown`. Pure: `use-error-text.ts` is the React door that renders the key.
 */

/** The codes with a shared `common.errors.<code>` message (`src/messages/common/<locale>.json`). */
export const COMMON_ERROR_CODES = [
  'ERP-NETWORK-0001',
  'ERP-TIMEOUT-0001',
  'ERP-UPSTREAM-0001',
  'ERP-AUTH-0004',
  'ERP-AUTH-0005',
  'ERP-VALIDATION-0001',
] as const;

/** Codes for which a screen offers "Try again" (an explicit click is the only retry path). */
export const RETRYABLE_CODES = [
  'ERP-UPSTREAM-0001',
  'ERP-NETWORK-0001',
  'ERP-TIMEOUT-0001',
] as const;

export function isRetryableCode(code: string): boolean {
  return (RETRYABLE_CODES as readonly string[]).includes(code);
}

/** A feature's own codes, each with a `<namespace>.errors.<code>` message. */
export interface FeatureErrorCodes {
  readonly namespace: string;
  readonly codes: readonly string[];
}

/** A message key and the ICU values it takes; rendered as `t(`${namespace}.${key}`, values)`. */
export interface ErrorMessageRef {
  readonly namespace: string;
  readonly key: string;
  readonly values: Readonly<Record<string, string>>;
}

/**
 * The message for a code. `seconds` is the string `'none'` without a `Retry-After`, so the ICU
 * `select` in the message picks its "in a moment" branch. The code itself is never a value.
 */
export function errorMessageRef(
  code: string,
  retryAfterS: number | null,
  feature?: FeatureErrorCodes,
): ErrorMessageRef {
  const values = { seconds: retryAfterS === null ? 'none' : String(retryAfterS) };
  if (feature?.codes.includes(code) === true) {
    return { namespace: feature.namespace, key: `errors.${code}`, values };
  }
  if ((COMMON_ERROR_CODES as readonly string[]).includes(code)) {
    return { namespace: 'common', key: `errors.${code}`, values };
  }
  return { namespace: 'common', key: 'errors.unknown', values };
}
