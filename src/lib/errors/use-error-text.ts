import { useTranslations } from 'next-intl';
import { errorMessageRef, type FeatureErrorCodes } from './error-messages';

/**
 * The React door of the shared error map (FE-13): `const errorText = useErrorText(STAFF_ERRORS);
 * errorText(result)` → the plain-language message for the failure, in the current locale. The
 * feature's own codes win, then `common.errors.*`, then `common.errors.unknown`. The code, the HTTP
 * status and the api's `message` are never part of the text (D-32); log the code instead.
 */
export function useErrorText(
  feature?: FeatureErrorCodes,
): (error: { readonly code: string; readonly retryAfterS: number | null }) => string {
  const t = useTranslations();
  return ({ code, retryAfterS }) => {
    const ref = errorMessageRef(code, retryAfterS, feature);
    return t(`${ref.namespace}.${ref.key}`, ref.values);
  };
}
