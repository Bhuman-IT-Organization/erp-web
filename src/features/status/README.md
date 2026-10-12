# status

## Purpose

The diagnostic page at `/status`: on every request the server asks the api for its health report
through the Nginx origin (`GET /api/v1/health`, ADR-0031 §3 breaker states included) and renders
what came back — the URL asked, the HTTP status, the report or the error. It is the smallest route
in the tree and the reference caller of the
server-side fetch helper.

## Legacy screen

None: diagnostic page, no legacy equivalent.

## Legacy parity

Not applicable — nothing to be 1:1 with.

## Dropped on purpose

None.

## Routes

- `/status` (`app/status/page.tsx`, `force-dynamic`): reads `API_BASE_URL` through
  `src/lib/config/env.ts`, calls `fetchHealth`, renders `pages/StatusPage.tsx`. No metadata of its
  own.

## Data

`api/health.fetch.ts` — `fetchHealth(baseUrl, fetchImpl?, timeoutMs?)`, a thin caller of
`serverFetchJson` (`src/lib/api/server-fetch.ts`) with the `SERVER_TIMINGS.health.fetchMs` budget
(`src/lib/config/server-timings.ts`, review WR-04: above the api's own probe budget so a degraded
report arrives before the cut-off). Never throws: a timeout or a network failure becomes
`error` with `httpStatus: 0`, an unparseable body `error: 'invalid health payload'`, and a
degraded report on a 503 is still a report (`healthReportSchema`: `status` `ok | degraded`,
`checks.<name>` `ok | error`, `checks.breakers.<name>` `closed | open | half-open`).

`data-testid="api-status"` / `data-status` on the status line are read by
`erp-infra/scripts/verify-wave0.mjs` and must not change.

## Messages

`messages/en.json` (namespace `status`), registered in `src/messages/index.ts`. Every key is ours —
there is no legacy screen to take names from. No `ar.json` on purpose: this feature proves the
English fallback (`src/messages/__tests__/index.test.ts`).

| Key           | Used in                                     | Legacy key / ours |
| ------------- | ------------------------------------------- | ----------------- |
| `title`       | `StatusPage.tsx` card title                 | ours              |
| `requested`   | `StatusPage.tsx` the URL asked (`{url}`)    | ours              |
| `http`        | `StatusPage.tsx` HTTP status (`{status}`)   | ours              |
| `error`       | `StatusPage.tsx` no report (`{message}`)    | ours              |
| `status_line` | `StatusPage.tsx` report status (`{status}`) | ours              |
| `check`       | `StatusPage.tsx` each probe and breaker     | ours              |
| `breakers`    | `StatusPage.tsx` breaker list heading       | ours              |
| `unknown`     | `StatusPage.tsx` error without a message    | ours              |

## How to run its tests

```bash
corepack yarn test src/features/status
```

`api/health.fetch.test.ts` runs in the node environment with an injected `fetchImpl`; the helper
it calls has its own tests in `src/lib/api/__tests__/server-fetch.test.ts`.
