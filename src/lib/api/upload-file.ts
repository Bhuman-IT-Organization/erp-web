import {
  Upload,
  type HttpRequest,
  type HttpResponse,
  type PreviousUpload,
  type UploadOptions,
} from 'tus-js-client';
import { getAccessToken, getSessionStatus, recoverSession } from '@/lib/auth/session';
import { CLIENT_CODE, NETWORK_CODE } from './call-api';
import { CLIENT_TIMINGS } from './client-timings';

/**
 * The browser's one door to resumable uploads (P-12, ADR-0041, PATTERNS M9): the only erp-web file
 * that imports `tus-js-client`, tested by a scan in its test until plan 23 adds the `P_TUS`
 * restricted-import entry. A file goes to `POST /api/v1/uploads` (plan 03) in 2 MiB chunks, with
 * `purpose` and `filename` in the tus metadata beside the caller's `meta` (which cannot replace them).
 *
 * - **The bearer is set on every request, in `onBeforeRequest`.** The access token lives in memory
 *   only (ADR-0005) and rotates every 15 minutes, so an upload that outlives one token sends the
 *   next; while the tab's session is still `pending` the request waits for `recoverSession()`, as
 *   the axios instance's gate does. The token is never put in a URL or in tus's storage: tus keeps
 *   only the upload URL, which the api binds to the staff member who created it (T-4.2-46).
 * - **Resume.** tus remembers each unfinished upload under the file's fingerprint in localStorage
 *   (`storeFingerprintForResuming`, dropped on success). `start()` resumes the newest one of the same
 *   file whose metadata matches exactly (a file half-sent to another record or purpose starts over),
 *   and the offset the server answers to tus's `HEAD` is reported through `onResumeFrom`. A dropped
 *   chunk is retried after `CLIENT_TIMINGS.uploads.retryDelaysMs`; offline, tus gives up at once and
 *   the outcome is a retryable failure (the queue shows it paused).
 * - **Answers.** Hook refusals are `application/problem+json` with a `code`; tus's own protocol
 *   errors are plain text, so a code is read only from problem+json (plan 03). 413 is
 *   `ERP-FILES-0002` and 422 `ERP-FILES-0001` even when no code came (rejected: never attached,
 *   T-4.2-47); no response is `ERP-NETWORK-0001`, retryable; anything else keeps its code or
 *   `ERP-HTTP-<status>` and is retryable only from 500 up.
 * - **Cancel** terminates the server upload (`abort(true)`, a tus DELETE) and resolves `start()` as
 *   `cancelled`.
 *
 * Never throws: every end is an `UploadOutcome`.
 */
export const UPLOADS_PATH = '/api/v1/uploads';
/** 2 MiB (ADR-0041): Fastify's 1 MiB body limit does not apply to a tus chunk (plan 03); Nginx admits 64m. */
export const UPLOAD_CHUNK_BYTES = 2_097_152;
/** The header the api answers on the last chunk with the stored resource's id (plan 03). */
export const UPLOAD_RESOURCE_HEADER = 'Erp-Upload-Resource';

const PROBLEM_JSON = 'application/problem+json';
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNPROCESSABLE = 422;
const HTTP_SERVER_ERROR_FLOOR = 500;
/** The code a refusal carries when it came as plain text (tus's own 413) or without one. */
const REJECTED_CODE: Readonly<Record<number, string>> = Object.freeze({
  [HTTP_PAYLOAD_TOO_LARGE]: 'ERP-FILES-0002',
  [HTTP_UNPROCESSABLE]: 'ERP-FILES-0001',
});

/** Where a file goes: the api's purpose name, and the extra metadata that purpose reads (`relId`). */
export interface UploadTarget {
  readonly purpose: string;
  readonly meta?: Readonly<Record<string, string>>;
}

/** How one upload ended; `rejected` is the api's check refusing the file, never a transport failure. */
export type UploadOutcome =
  | { readonly kind: 'done'; readonly uploadId: string; readonly resourceId: string | null }
  | { readonly kind: 'rejected'; readonly code: string }
  | { readonly kind: 'failed'; readonly code: string; readonly retryable: boolean }
  | { readonly kind: 'cancelled' };

/** Byte progress, and the server's offset when tus resumes a partial upload. */
export interface UploadEvents {
  readonly onProgress: (sent: number, total: number) => void;
  readonly onResumeFrom?: (offset: number, total: number) => void;
}

/** One file's upload: `start` (again after a failure) and `abort` (terminates the server upload). */
export interface UploadHandle {
  readonly start: () => Promise<UploadOutcome>;
  readonly abort: () => Promise<void>;
}

/** The tus-js-client class; tests pass a fake. */
export interface UploadDeps {
  readonly Upload: typeof Upload;
}

const DEFAULT_DEPS: UploadDeps = { Upload };

/** Sets the bearer of this moment on one tus request, after the tab's session has settled. */
async function authorize(request: HttpRequest): Promise<void> {
  if (getSessionStatus() === 'pending') await recoverSession();
  const token = getAccessToken();
  if (token !== null) request.setHeader('Authorization', `Bearer ${token}`);
}

/** The `code` of a problem+json body; `null` for plain text or a body that is not JSON. */
function problemCode(response: HttpResponse): string | null {
  if (!(response.getHeader('Content-Type') ?? '').includes(PROBLEM_JSON)) return null;
  try {
    const body: unknown = JSON.parse(response.getBody());
    return typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      typeof body.code === 'string'
      ? body.code
      : null;
  } catch {
    return null;
  }
}

/** What a tus error means for the file. */
export function outcomeOf(error: Error): UploadOutcome {
  const response =
    'originalResponse' in error ? (error.originalResponse as HttpResponse | null) : null;
  if (response === null) {
    return 'originalRequest' in error
      ? { kind: 'failed', code: NETWORK_CODE, retryable: true }
      : { kind: 'failed', code: CLIENT_CODE, retryable: false };
  }
  const status = response.getStatus();
  const code = problemCode(response);
  const rejected = REJECTED_CODE[status];
  if (rejected !== undefined) return { kind: 'rejected', code: code ?? rejected };
  return {
    kind: 'failed',
    code: code ?? `ERP-HTTP-${String(status)}`,
    retryable: status >= HTTP_SERVER_ERROR_FLOOR,
  };
}

/** Same keys, same values: the previous upload was made for exactly this target. */
function sameMetadata(
  stored: Readonly<Record<string, string>>,
  wanted: Readonly<Record<string, string>>,
): boolean {
  const keys = Object.keys(wanted);
  return Object.keys(stored).length === keys.length && keys.every((k) => stored[k] === wanted[k]);
}

/**
 * The newest unfinished upload of this file for this exact target, if the browser still knows one.
 *
 * @complexity O(n) over the uploads tus remembers for this file
 */
function newestMatching(
  previous: readonly PreviousUpload[],
  metadata: Readonly<Record<string, string>>,
): PreviousUpload | undefined {
  let newest: PreviousUpload | undefined;
  for (const candidate of previous) {
    if (!sameMetadata(candidate.metadata, metadata)) continue;
    if (newest === undefined || candidate.creationTime > newest.creationTime) newest = candidate;
  }
  return newest;
}

/** The last path segment of the upload URL: the api's 32-hex upload id. */
function uploadIdOf(url: string | null): string {
  return url?.split('/').pop() ?? '';
}

/**
 * One file's upload. `start()` may be called again after a failure: a new tus upload that resumes
 * where the server holds the file.
 */
export function createUpload(
  file: File,
  target: UploadTarget,
  events: UploadEvents,
  deps: UploadDeps = DEFAULT_DEPS,
): UploadHandle {
  const metadata = { ...target.meta, purpose: target.purpose, filename: file.name };
  let current: Upload | undefined;
  let finish: ((outcome: UploadOutcome) => void) | undefined;
  let cancelled = false;

  const options = (settle: (outcome: UploadOutcome) => void): UploadOptions => ({
    endpoint: UPLOADS_PATH,
    chunkSize: UPLOAD_CHUNK_BYTES,
    retryDelays: [...CLIENT_TIMINGS.uploads.retryDelaysMs],
    metadata,
    storeFingerprintForResuming: true,
    removeFingerprintOnSuccess: true,
    onBeforeRequest: authorize,
    onAfterResponse: (request, response) => {
      if (request.getMethod() !== 'HEAD') return;
      const offset = Number(response.getHeader('Upload-Offset'));
      if (Number.isFinite(offset) && offset > 0) events.onResumeFrom?.(offset, file.size);
    },
    onProgress: events.onProgress,
    onSuccess: ({ lastResponse }) => {
      settle({
        kind: 'done',
        uploadId: uploadIdOf(current?.url ?? null),
        resourceId: lastResponse.getHeader(UPLOAD_RESOURCE_HEADER) ?? null,
      });
    },
    onError: (error) => {
      settle(outcomeOf(error));
    },
  });

  const start = (): Promise<UploadOutcome> => {
    cancelled = false;
    return new Promise<UploadOutcome>((resolve) => {
      finish = resolve;
      const upload = new deps.Upload(file, options(resolve));
      current = upload;
      void upload.findPreviousUploads().then(
        (previous) => {
          if (cancelled) return;
          const resumable = newestMatching(previous, metadata);
          if (resumable !== undefined) upload.resumeFromPreviousUpload(resumable);
          upload.start();
        },
        () => {
          if (!cancelled) upload.start();
        },
      );
    });
  };

  const abort = async (): Promise<void> => {
    cancelled = true;
    finish?.({ kind: 'cancelled' });
    try {
      await current?.abort(true);
    } catch {
      // The DELETE did not arrive: the api's hourly cleanup removes the partial upload (plan 04).
    }
  };

  return { start, abort };
}
