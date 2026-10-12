/**
 * The one console sink. `no-console` is a lint error in every other source file (eslint.config.mjs
 * S16), so a future error-reporting transport swaps in HERE and nowhere else.
 *
 * `debug`/`info` are silent outside development; `warn`/`error` always forward. `NODE_ENV` is the
 * one `process.env` read allowed outside `src/lib/config/env.ts` (S21): Next.js inlines it at build
 * time, so the development branches are dead code in a production bundle. No `server-only` — the
 * sink is used by client components too.
 */
type LogArgs = readonly unknown[];

const isDevelopment = (): boolean => process.env.NODE_ENV === 'development';

export const log = Object.freeze({
  debug: (...args: LogArgs): void => {
    if (isDevelopment()) console.debug(...args);
  },
  info: (...args: LogArgs): void => {
    if (isDevelopment()) console.info(...args);
  },
  warn: (...args: LogArgs): void => {
    console.warn(...args);
  },
  error: (...args: LogArgs): void => {
    console.error(...args);
  },
});

export type Log = typeof log;
