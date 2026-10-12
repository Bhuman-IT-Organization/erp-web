import 'server-only';
import { z } from 'zod';

// The only file that reads process.env on the server (ADR-0014).
// Values come from ../erp-infra/env/<env>/web.env; this repository never holds a .env file.
// `server-only` turns any import from a client component into a build error.

export const serverEnvSchema = z.object({
  // Origin the server-side fetches go through: the Nginx reverse proxy, never the api container
  // directly, so the strangler routing is exercised on every render.
  API_BASE_URL: z.url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid server environment: ${issues}`);
  }
  return parsed.data;
}
