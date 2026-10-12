import { z } from 'zod';
import { useCommonApi, type CommonApiResult } from './use-common-api';

/**
 * What the api accepts for one upload purpose (plan 03, `GET /api/v1/uploads/rules/:purpose`): the
 * per-file size, the files per save and the extensions (lower case, no dot). K8's dropzone shows
 * them in its caption and refuses a pick by them before it enters the queue; the api checks again
 * on creation and after sniffing the bytes, so these are a convenience, never the control (T-4.2-47).
 */
export interface UploadRules {
  readonly purpose: string;
  readonly maxBytes: number;
  readonly maxFiles: number;
  readonly extensions: readonly string[];
}

const uploadRulesSchema: z.ZodType<UploadRules> = z.object({
  purpose: z.string(),
  maxBytes: z.number().int().positive(),
  maxFiles: z.number().int().positive(),
  extensions: z.array(z.string()).readonly(),
});

/** The rules of `purpose`; `null` requests nothing. */
export function useUploadRules(purpose: string | null): CommonApiResult<UploadRules> {
  return useCommonApi(
    purpose === null ? null : `/api/v1/uploads/rules/${encodeURIComponent(purpose)}`,
    uploadRulesSchema,
  );
}
