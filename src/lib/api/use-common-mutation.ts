import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import useSWRMutation from 'swr/mutation';
import type { z } from 'zod';
import { callApi, type ApiAdapter, type ApiPath, type ApiResult } from './call-api';
import { matchesPrefix } from './keys';

/**
 * The WRITE hook (FE-03): `useSWRMutation` over `callApi`. It NEVER retries (ADR-0031 §5): axios
 * does not, `callApi` does not, `useSWRMutation` has no retry of its own, and the fetcher never
 * throws, so SWR's `onErrorRetry` never sees a mutation. A failed write is retried only by the
 * user pressing the button again. The result is the plain `ApiResult` — on a 400
 * `ERP-VALIDATION-0001` it carries `issues` for the form to zod-parse and map onto its fields.
 *
 * On `ok`, every cached key under each `invalidate` prefix is revalidated (`matchesPrefix` over
 * the string keys from `keys.ts`), so a list and its filtered pages refresh after a create.
 * Writes never go through `swrFetcher`; reads never call `callApi` — see `use-common-api.ts`.
 *
 * `trigger(body, { ifMatch, idempotencyKey })` passes both to `callApi` (M4, ADR-0040, BE-15): a
 * save names `{ ifMatch: record.etag }`, a keyed POST the key minted when the form opened.
 */
export type MutationMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface CommonMutationOptions<TRes> {
  readonly method: MutationMethod;
  readonly schema: z.ZodType<TRes>;
  /** Key prefixes (paths) whose cached pages are stale after this write. */
  readonly invalidate: readonly ApiPath[];
  readonly expectNoContent?: boolean;
  /** Tests only: a fake adapter standing in for the network. */
  readonly adapter?: ApiAdapter;
}

/** Per call: the record's version and the submit's key (`If-Match`, `Idempotency-Key`). */
export interface MutationCallOptions {
  readonly ifMatch?: string;
  readonly idempotencyKey?: string;
}

export interface CommonMutation<TReq, TRes> {
  readonly trigger: (body: TReq, options?: MutationCallOptions) => Promise<ApiResult<TRes>>;
  readonly isMutating: boolean;
  /** The last result; `undefined` before the first trigger or after `reset`. */
  readonly result: ApiResult<TRes> | undefined;
  readonly reset: () => void;
}

export function useCommonMutation<TReq, TRes>(
  path: ApiPath,
  options: CommonMutationOptions<TRes>,
): CommonMutation<TReq, TRes> {
  const { method, schema, invalidate, expectNoContent, adapter } = options;
  // The provider-scoped mutate: a test that mounts its own cache invalidates that cache only.
  const { mutate } = useSWRConfig();

  // The extra argument is boxed so SWR's trigger overloads resolve for a generic `TReq`
  // (an unboxed `TReq` could be `undefined`, which selects a different overload).
  const {
    trigger: swrTrigger,
    isMutating,
    data,
    reset,
  } = useSWRMutation<
    ApiResult<TRes>,
    never,
    ApiPath,
    { readonly body: TReq; readonly call: MutationCallOptions | undefined }
  >(
    path,
    (key, { arg }) =>
      callApi(key, {
        method,
        body: arg.body,
        ...arg.call,
        schema,
        ...(expectNoContent !== undefined ? { expectNoContent } : {}),
        ...(adapter !== undefined ? { adapter } : {}),
      }),
    {
      throwOnError: false,
      // A failed write is a resolved `{ ok: false }`, which SWR would count as a success and
      // revalidate the mutation key on; the prefix revalidation below is the only one, gated on `ok`.
      revalidate: false,
      onSuccess: (result) => {
        if (!result.ok) return;
        for (const prefix of invalidate) void mutate(matchesPrefix(prefix));
      },
    },
  );

  const trigger = useCallback(
    (body: TReq, call?: MutationCallOptions) => swrTrigger({ body, call }),
    [swrTrigger],
  );

  return { trigger, isMutating, result: data, reset };
}
