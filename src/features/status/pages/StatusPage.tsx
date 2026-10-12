import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FetchHealthResult } from '@/features/status/api/health.fetch';

interface StatusPageProps {
  readonly result: FetchHealthResult;
}

// Every line is ONE `t()` call, so the SSR HTML holds the literal text in one text node
// (React would otherwise put `<!-- -->` between adjacent text nodes and break a grep).
async function ReportBody({ result }: StatusPageProps) {
  const t = await getTranslations('status');
  if (result.report === null) {
    return (
      <p data-testid="api-status" data-status="error">
        {t('error', { message: result.error ?? t('unknown') })}
      </p>
    );
  }
  const entries = Object.entries(result.report.checks);
  const probes = entries.flatMap(([name, state]) =>
    typeof state === 'string' ? [[name, state] as const] : [],
  );
  // `checks.breakers` is a record of breaker states (ADR-0031 §3), rendered as its own list.
  const breakers = entries.flatMap(([name, state]) =>
    typeof state === 'string'
      ? []
      : Object.entries(state).map(([b, s]) => [`${name}.${b}`, s] as const),
  );
  return (
    <>
      <p data-testid="api-status" data-status={result.report.status}>
        {t('status_line', { status: result.report.status })}
      </p>
      <ul>
        {probes.map(([name, state]) => (
          <li key={name}>{t('check', { name, state })}</li>
        ))}
      </ul>
      {breakers.length > 0 ? (
        <>
          <p>{t('breakers')}</p>
          <ul data-testid="breakers">
            {breakers.map(([name, state]) => (
              <li key={name}>{t('check', { name, state })}</li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

// Server Component (no 'use client'): rendered on the server with the result of the
// request-time fetch done by app/status/page.tsx.
export async function StatusPage({ result }: StatusPageProps) {
  const t = await getTranslations('status');
  return (
    <main className="p-8">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{t('requested', { url: result.url })}</p>
          <p>{t('http', { status: String(result.httpStatus) })}</p>
          <ReportBody result={result} />
        </CardContent>
      </Card>
    </main>
  );
}
