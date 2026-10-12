import type { AbstractIntlMessages } from 'next-intl';

/**
 * The named top-level namespaces of a message pack, for a nested `NextIntlClientProvider` that
 * should carry one feature's slice (+ `common`) into the client bundle instead of the whole pack.
 * A nested provider REPLACES the messages, so callers always include `common`. Missing namespaces
 * are omitted, never `undefined`.
 */
export function pick(
  messages: AbstractIntlMessages,
  namespaces: readonly string[],
): AbstractIntlMessages {
  const out: AbstractIntlMessages = {};
  for (const ns of namespaces) {
    const slice = messages[ns];
    if (slice !== undefined) out[ns] = slice;
  }
  return out;
}
