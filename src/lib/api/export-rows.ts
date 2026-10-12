import { z } from 'zod';
import { ApiError } from './api-error';
import { CLIENT_CODE, NETWORK_CODE, type ApiPath, type ApiResult } from './call-api';
import type { DownloadParams } from './download-file';
import { http } from './http';

/** The print rows as the api answers them (plan 02's wire): every cell already a display string. */
export const exportRowsSchema = z.object({
  exportedAt: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

/** The checked print rows `PrintView` renders. */
export type ExportRows = z.infer<typeof exportRowsSchema>;

/**
 * The Print read (4.1.1 D-28): `GET <list>/export?format=print` answers the display rows as JSON,
 * `{ exportedAt, headers, rows }` with every cell a string, already capped at the list's
 * `printLimit`. Not an `<a href>` and never `fetch`: the access token lives in memory only, so the
 * request goes through the ONE axios instance, whose interceptor attaches the bearer as a header
 * (never in the URL, T-4.1.1-20) and maps a refusal to an `ApiError` with its `issues`. The query
 * repeats `header`, `blank` and `key` without brackets, as `downloadFile` sends them. The body is
 * untrusted, so it is zod-checked (T-4.1.1-23); a mismatch is `CLIENT_CODE`.
 *
 * Never throws, like `callApi`: every failure is an `ApiResult` with `ok: false`.
 */
export async function readExportRows(
  path: ApiPath,
  params: DownloadParams,
): Promise<ApiResult<ExportRows>> {
  let status: number;
  let body: unknown;
  try {
    const response = await http.get<unknown>(path, {
      params,
      paramsSerializer: { indexes: null },
      headers: { accept: 'application/json' },
    });
    status = response.status;
    body = response.data;
  } catch (e: unknown) {
    const err = e instanceof ApiError ? e : new ApiError(0, NETWORK_CODE, null);
    return {
      ok: false,
      status: err.status,
      code: err.code,
      retryAfterS: err.retryAfterS,
      ...(err.issues !== undefined ? { issues: err.issues } : {}),
    };
  }
  const parsed = exportRowsSchema.safeParse(body);
  return parsed.success
    ? { ok: true, status, data: parsed.data }
    : { ok: false, status, code: CLIENT_CODE, retryAfterS: null };
}
