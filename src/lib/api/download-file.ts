import { ApiError } from './api-error';
import { CLIENT_CODE, type ApiPath, type ApiResult } from './call-api';
import { http, toApiError } from './http';

/**
 * A file download from the api, through the ONE axios instance: the list's Export menu downloads
 * CSV, Excel (`xlsx`) or PDF from `GET <list>/export?format=...` (4.1.1 D-07); Print is not a file
 * and reads its rows through `export-rows.ts` instead (D-28). `DOWNLOAD_FORMATS` gives each format
 * the media type it asks for and the name it falls back to.
 *
 * - **Not an `<a href="/api/v1/…/export">`.** The access token lives in memory only and the refresh
 *   cookie `erp_refresh` is path-scoped to `/api/v1/auth/refresh` (ADR-0032), so a plain link would
 *   arrive bearer-less and get a 401, and a token put into the URL would leak into history, logs
 *   and the Referer (T-3.2-53). The instance's interceptor attaches the bearer as a header, and holds
 *   the request while the session is still being recovered, exactly as for every read.
 * - **`responseType: 'blob'`, not `'text'`.** A text decode strips the UTF-8 BOM the api writes first
 *   so Excel opens Arabic names correctly; a Blob keeps the bytes as sent.
 * - **`header` repeats without brackets** (`header=Name&header=Email`, `paramsSerializer.indexes:
 *   null`): plan 05's export takes the translated column labels as repeated `header` values (D-42).
 * - **A refusal's body is a Blob too.** Under `responseType: 'blob'` the api's problem-details JSON
 *   arrives as a Blob, so the instance's `toApiError` finds no `code` and would call every refusal
 *   `ERP-HTTP-<status>` (03.2 RESEARCH Pitfall 10). A Blob cannot be read synchronously, and the
 *   interceptor maps the error before this function sees it, so the raw error response is captured
 *   in `transformResponse` (axios runs it on an error response too, before the interceptors), read
 *   with `await blob.text()` → `JSON.parse`, and only then mapped through the same `toApiError`. The
 *   interceptor has already done the reachability side effect (the unreachable banner) with the right
 *   status; only the code and the issues are re-read here.
 * - The file name comes from `Content-Disposition` (quoted or bare), with every `/` and `\` removed
 *   so a server-sent path cannot name a place, falling back to the format's own name (`export.csv`,
 *   `export.xlsx`, `export.pdf`; T-3.2-52).
 *
 * Never throws, like `callApi`: every failure is an `ApiResult` with `ok: false`.
 */
export type DownloadParams = Readonly<
  Record<string, string | number | boolean | undefined | readonly string[]>
>;

export interface DownloadDeps {
  readonly save: (blob: Blob, filename: string) => void;
}

/** The three file formats the list export downloads (4.1.1 D-07); CSV is the default. */
export type DownloadFormat = 'csv' | 'xlsx' | 'pdf';

/** Per format: the `accept` media type sent, and the file name used when the api sends none. */
export const DOWNLOAD_FORMATS: Readonly<
  Record<DownloadFormat, { readonly accept: string; readonly fallbackName: string }>
> = Object.freeze({
  csv: { accept: 'text/csv', fallbackName: 'export.csv' },
  xlsx: {
    accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fallbackName: 'export.xlsx',
  },
  pdf: { accept: 'application/pdf', fallbackName: 'export.pdf' },
});

/** Kept for the existing callers: the CSV fallback name. */
export const DEFAULT_DOWNLOAD_NAME = DOWNLOAD_FORMATS.csv.fallbackName;

/** The browser's download: an object URL on a temporary `<a download>`, clicked, then revoked. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const DEFAULT_DEPS: DownloadDeps = { save: saveBlob };

const DISPOSITION_NAME = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i;

/** The `Content-Disposition` file name without any path separator; `fallback` when none is left. */
export function dispositionFilename(
  header: unknown,
  fallback: string = DEFAULT_DOWNLOAD_NAME,
): string {
  const match = typeof header === 'string' ? DISPOSITION_NAME.exec(header) : null;
  const name = (match?.[1] ?? match?.[2] ?? '').replace(/[/\\]/g, '').trim();
  return name === '' ? fallback : name;
}

/** The problem-details object inside a Blob body, or the body unchanged when it is not JSON. */
async function readProblem(body: unknown): Promise<unknown> {
  if (!(body instanceof Blob)) return body;
  try {
    const parsed: unknown = JSON.parse(await body.text());
    return parsed;
  } catch {
    return undefined;
  }
}

interface RawResponse {
  readonly status: number;
  readonly data: unknown;
  readonly headers: unknown;
}

function failure(error: ApiError): ApiResult<never> {
  return {
    ok: false,
    status: error.status,
    code: error.code,
    retryAfterS: error.retryAfterS,
    ...(error.issues !== undefined ? { issues: error.issues } : {}),
  };
}

/** Opt-in request headers of a Blob read (04.7-12): each rides the request beside the bearer. */
export interface BlobReadOptions {
  readonly headers?: Readonly<Record<string, string>>;
}

/** A Blob read: the bytes as sent and the `Content-Disposition` header (a download names its file by it). */
interface BlobRead {
  readonly blob: Blob;
  readonly disposition: unknown;
}

/**
 * `GET path` as a Blob through the one instance (the bearer, the session gate, the reachability
 * banner), never throwing; a refusal's Blob body is read for its problem code (the header above).
 * `options.headers` ride the request beside `accept` (absent: the request is as before).
 */
async function readBlob(
  path: ApiPath,
  params: DownloadParams,
  accept: string,
  body?: unknown,
  options: BlobReadOptions = {},
): Promise<ApiResult<BlobRead>> {
  let raw: RawResponse | undefined;
  try {
    const response = await http.request<unknown>({
      url: path,
      // A file the api builds from a JSON body (04.6-15) is a POST.
      method: body === undefined ? 'get' : 'post',
      ...(body === undefined ? {} : { data: body }),
      params,
      responseType: 'blob',
      headers: { ...options.headers, accept },
      paramsSerializer: { indexes: null },
      // Runs on every response, a refusal included, before the interceptors; the body is untouched.
      transformResponse: (data: unknown, headers: unknown, status?: number) => {
        raw = { status: status ?? 0, data, headers };
        return data;
      },
    });
    const blob = response.data instanceof Blob ? response.data : new Blob([String(response.data)]);
    return {
      ok: true,
      status: response.status,
      data: { blob, disposition: response.headers['content-disposition'] },
    };
  } catch (e: unknown) {
    if (!(e instanceof ApiError)) return failure(new ApiError(0, CLIENT_CODE, null));
    if (raw === undefined) return failure(e); // no response: a network failure or a timeout
    const data = await readProblem(raw.data);
    // `toApiError` reads an axios-shaped error; this one carries the parsed body in place of the Blob.
    return failure(toApiError({ isAxiosError: true, response: { ...raw, data } }));
  }
}

/**
 * Saves the file `GET path?params` answers (or, with `body`, `POST path` with that JSON body: the
 * opt-in of 04.6-15 for a file built from a selection); never throws, a refusal comes back as the
 * failure branch with its problem code.
 */
export async function downloadFile(
  path: ApiPath,
  params: DownloadParams,
  deps: DownloadDeps = DEFAULT_DEPS,
  format: DownloadFormat = 'csv',
  body?: unknown,
): Promise<ApiResult<{ readonly filename: string }>> {
  const { accept, fallbackName } = DOWNLOAD_FORMATS[format];
  const read = await readBlob(path, params, accept, body);
  if (!read.ok) return read;
  const filename = dispositionFilename(read.data.disposition, fallbackName);
  try {
    deps.save(read.data.blob, filename);
  } catch {
    return failure(new ApiError(0, CLIENT_CODE, null));
  }
  return { ok: true, status: read.status, data: { filename } };
}

/**
 * The bytes of an api-only file, for showing rather than saving (PATTERNS M7): an `<img src>` cannot
 * carry the bearer, so a thumbnail or a preview reads its bytes here and is shown by object URL
 * (`useFileBlob`, `useObjectUrl`, `ProtectedImage`). The same Blob and refusal handling as
 * `downloadFile`; never throws. `options.headers` is opt-in (04.7-12): each rides the request.
 */
export async function fetchBlob(
  path: ApiPath,
  options: BlobReadOptions = {},
): Promise<ApiResult<Blob>> {
  const read = await readBlob(path, {}, '*/*', undefined, options);
  return read.ok ? { ok: true, status: read.status, data: read.data.blob } : read;
}
