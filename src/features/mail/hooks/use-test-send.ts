import { useCallback, useRef } from 'react';
import { MAIL_SENT_EMAILS_PATH, mailPaths } from '@/features/mail/api/mail.endpoints';
import type { MailDraft } from '@/features/mail/hooks/use-template-preview';
import {
  acceptedResponseSchema,
  testStateResponseSchema,
  type TestStateResponse,
} from '@/features/mail/schemas/mail.schema';
import type { ApiResult } from '@/lib/api/call-api';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { useCommonApi, type CommonApiResult } from '@/lib/api/use-common-api';
import { useCommonMutation } from '@/lib/api/use-common-mutation';

/** 16 random bytes as 32 hex characters: inside the api's `[A-Za-z0-9_-]{16,128}` key grammar (BE-15). */
const KEY_BYTES = 16;
const HEX = 16;
const HEX_WIDTH = 2;

/**
 * A fresh `Idempotency-Key`. `getRandomValues`, not `randomUUID`: it also exists outside a secure
 * context (a deployment served over plain http), where `randomUUID` is undefined.
 */
export function newIdempotencyKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(KEY_BYTES)), (byte) =>
    byte.toString(HEX).padStart(HEX_WIDTH, '0'),
  ).join('');
}

/** One click: the draft it sent (none from the status page) and the key minted for it. */
interface Click {
  readonly draft: MailDraft | undefined;
  readonly key: string;
}

export interface SendTest {
  /** A new click: a new key; the editor sends the previewed draft, the status page nothing. */
  send(draft?: MailDraft): Promise<ApiResult<{ readonly id: string }>>;
  /** The Retry of the last click (a network or server failure): the same draft and the same key. */
  retry(): Promise<ApiResult<{ readonly id: string }>>;
  readonly pending: boolean;
}

/**
 * "Send a test to me" (D-04, D-10; 04.3 UI-SPEC § Send a test to me): `POST templates/:id/test`
 * with the draft (the editor, a template id), or `POST status/test` with no body (the status page,
 * plan 10, `null`). Each
 * click mints one `Idempotency-Key`, so a double click sends one email and the api's replay answers
 * the same 202; Retry re-sends the same click with the same key (BE-15). Never retried by itself
 * (a write, ADR-0031 §5). The log's pages are stale after a send (a new test row).
 */
export function useSendTest(templateId: string | null): SendTest {
  const path = templateId === null ? mailPaths.statusTest : mailPaths.templateTest(templateId);
  const mutation = useCommonMutation<MailDraft | undefined, { readonly id: string }>(path, {
    method: 'POST',
    schema: acceptedResponseSchema,
    invalidate: [MAIL_SENT_EMAILS_PATH],
  });
  const { trigger } = mutation;
  const last = useRef<Click | null>(null);

  const sendClick = useCallback(
    (click: Click) => trigger(click.draft, { idempotencyKey: click.key }),
    [trigger],
  );
  const send = useCallback(
    (draft?: MailDraft) => {
      last.current = { draft, key: newIdempotencyKey() };
      return sendClick(last.current);
    },
    [sendClick],
  );
  const retry = useCallback(
    () => (last.current === null ? send() : sendClick(last.current)),
    [send, sendClick],
  );
  return { send, retry, pending: mutation.isMutating };
}

/** Still on its way: the state is read again every `CLIENT_TIMINGS.mail.pollMs`. */
export const isTestUnderway = (state: TestStateResponse): boolean =>
  state.status === 'queued' || state.status === 'retrying';

/**
 * `GET /api/v1/mail/tests/:id`: the member's own test (the log detail is administrator-only),
 * re-read every `CLIENT_TIMINGS.mail.pollMs` through SWR `refreshInterval` while
 * it is queued or retrying, and no longer once it is sent or failed; no effect (FE-04). `onFinal` is
 * called once per test, when its state is first known to be sent or failed. `null` asks nothing.
 */
export function useTestState(
  id: string | null,
  onFinal?: () => void,
): CommonApiResult<TestStateResponse> {
  const reported = useRef<string | null>(null);
  return useCommonApi(id === null ? null : mailPaths.test(id), testStateResponseSchema, undefined, {
    refreshInterval: (data) =>
      data !== undefined && isTestUnderway(data) ? CLIENT_TIMINGS.mail.pollMs : 0,
    onSuccess: (data) => {
      if (isTestUnderway(data) || reported.current === data.id) return;
      reported.current = data.id;
      onFinal?.();
    },
  });
}
