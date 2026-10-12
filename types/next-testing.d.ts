/**
 * Upstream type shim for next@16.3.5 and 16.3.6 (still broken there): type-only, like the four Yarn
 * patches the README lists, but cheap enough not to need one.
 *
 * `next/dist/experimental/testing/server/middleware-testing-utils.d.ts:3` imports
 * `MiddlewareConfigMatcherInput` from `next/dist/build/segment-config/middleware/middleware-config`,
 * which exports only `MiddlewareConfigInput`. The name was never shipped, so `tsc` fails on the
 * import as soon as anything reaches `next/experimental/testing/server` — and erp-web runs with
 * `skipLibCheck: false` on purpose, so the broken declaration is not silently skipped.
 *
 * `__tests__/proxy.test.ts` needs that module: `unstable_doesMiddlewareMatch` is the only honest way
 * to assert `proxy.ts`'s `config.matcher`, because calling the proxy function directly never
 * consults the matcher. This declaration MERGES the missing alias into the real module (module
 * augmentation, not a replacement) and is the same shape the module's own `matcher` field has.
 *
 * Delete it when next ships the corrected declaration.
 */
import type {} from 'next/dist/build/segment-config/middleware/middleware-config';

declare module 'next/dist/build/segment-config/middleware/middleware-config' {
  export type MiddlewareConfigMatcherInput = MiddlewareConfigInput['matcher'];
}
