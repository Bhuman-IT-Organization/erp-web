import { getFormatter } from 'next-intl/server';
import { DEFAULT_FORMAT_SETTINGS, formatWith, type Format, type FormatSettings } from './format';

/**
 * The server door (Server Components, route handlers): the same `Format` over next-intl's
 * `getFormatter`, for the settings the caller passes (`(await getBranding()).formats`). Split from
 * `format.ts` per the `*.server.ts` convention (`next-intl/server` is server-only); the shape spec
 * exempts it from a unit test for the same reason.
 */
export async function getFormat(
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS,
): Promise<Format> {
  return formatWith(settings, await getFormatter());
}
