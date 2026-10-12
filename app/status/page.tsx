import { loadServerEnv } from '@/lib/config/env';
import { fetchHealth } from '@/features/status/api/health.fetch';
import { StatusPage } from '@/features/status/pages/StatusPage';

// Request-time render: the health answer must never be cached at build time.
export const dynamic = 'force-dynamic';

// The API is called through the Nginx origin (API_BASE_URL), not the api container,
// so the strangler routing in erp-infra is exercised on every render (erp-docs 03-architecture/05-strangler-fig-migration.md).
export default async function Page() {
  const env = loadServerEnv();
  const result = await fetchHealth(env.API_BASE_URL);
  return <StatusPage result={result} />;
}
