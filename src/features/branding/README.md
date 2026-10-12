# branding

## Purpose

The customer's identity as data (W0-05, multibrand): one build serves every customer, so the
company name, the logo(s), the theme tokens and the deployment's default language come from
`GET /api/v1/branding` at request time and nothing customer-specific is in this repository. It is
the smallest feature slice and the worked example of two rules: brand
enters through ONE server helper (SC-6) and a customer value reaches a stylesheet only through an
allowlist (T-3-11).

## Legacy screen

None: brand data feature, no legacy screen (the company logo slot of `login_admin.php` is
rendered by auth through `BrandLogo`).

## Legacy parity

Not applicable — nothing to be 1:1 with. The values themselves come from the legacy
`tbloptions` rows the api reads (company name, logo paths, `active_language`).

## Dropped on purpose

None.

## Routes

None of its own. `app/layout.tsx` (theme tokens on `:root`), `app/login/page.tsx` (logo and
name for `LoginPage`) and `src/i18n/request.ts` (`defaultLocale`) call `getBranding()`.

## Data

`GET /api/v1/branding` (erp-api `src/v1/branding`, its `brandingResponseSchema` mirrored by
`api/branding.fetch.ts` `brandingSchema`):

| Field           | Type                         | Meaning                                                                                                                                                                                                                                                                                    |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `companyName`   | `string` (non-empty)         | shown as text when no logo is uploaded; the `alt` of the logo otherwise                                                                                                                                                                                                                    |
| `logoUrl`       | `string \| null`             | same-origin path (`/uploads/company/…`), never absolute                                                                                                                                                                                                                                    |
| `logoDarkUrl`   | `string \| null`             | the dark variant the login page prefers (`BrandLogo variant="dark"`)                                                                                                                                                                                                                       |
| `theme`         | `Record<string, string>`     | `:root` token overrides; see `themeCss` below                                                                                                                                                                                                                                              |
| `defaultLocale` | `string` (optional)          | BCP-47 from `tbloptions.active_language`; the locale before anyone signs in                                                                                                                                                                                                                |
| `formats`       | `FormatSettings` (defaulted) | the customer's Perfex date, time, number and base-currency formats (D-33, D-44); `formatSettingsSchema.default(DEFAULT_FORMAT_SETTINGS)` from `@/lib/i18n/format`, so an api without it still parses; `app/layout.tsx` provides it through `FormatSettingsProvider` to every `useFormat()` |

- `fetchBranding(baseUrl, fetchImpl?, timeoutMs?)` — a thin caller of `serverFetchJson` with the
  `SERVER_TIMINGS.branding.fetchMs` budget (3 s). Never throws: any failure yields
  `FALLBACK_BRANDING` (`companyName: 'ERP'`, no logo, empty theme, `defaultLocale: 'en'`) so
  the page still renders.
- `api/branding.server.ts` `getBranding()` — the ONE server helper (SC-6): React `cache` around
  `fetchBranding(loadServerEnv().API_BASE_URL)`, so the layout, the login page and the request
  config share one fetch per request. Server-only through `env.ts`; never re-exported from
  `index.ts` (a client import would be a build error); no unit test — `next build` and its
  callers prove it.
- `api/theme.ts` `themeCss(theme)` — `:root{--name:value;…}` for the `THEME_TOKENS` allowlist.
  Only `primary` (and the `sidebar-primary` alias the guard writes) and `radius` are brandable;
  foregrounds are computed; destructive, success, ring, border and input are fixed (D-06: a brand
  can never make Save look like Delete; `api/__tests__/theme.test.ts` asserts the allowlist is a
  subset of `:root` and shares nothing with `FIXED_MEANING_TOKENS`). Every value must match
  `THEME_VALUE` (`^[a-z0-9 .%()/,#-]{1,64}$`) and none of `THEME_VALUE_REJECT` (`url(`,
  `expression(`, `@import`, `/*`, a backslash); `primary` must then parse (`parseBrandColour`:
  `#rgb`, `#rrggbb` or `oklch(L C H)`, anything else dropped so the neutral default stays), and
  its foreground is `contrastForeground` — white at ≥ 4.5:1 WCAG contrast, black otherwise
  (D-08); any `*-foreground` the api sends is ignored. `null` when nothing survives.
  `app/layout.tsx` renders it as the text child of `<style data-testid="brand-theme">`, never
  `dangerouslySetInnerHTML`.
- `index.ts` — the client-safe surface other features import: `BrandLogo`, `Branding`,
  `brandingSchema`, `fetchBranding`, `FALLBACK_BRANDING`, `THEME_TOKENS`, `themeCss`,
  `isSafeThemeValue`.

Triggers (STATE W0-05): real theme values arrive when the settings module owns `tbloptions`
(today the api serves an empty `theme`, so no `<style>` is rendered); the favicon comes from
branding the same way — the create-next-app default was deleted and no neutral icon replaces it.

## Messages

None (no user-facing text; the company name is data).

## How to run its tests

```bash
corepack yarn test src/features/branding
```

`api/branding.fetch.test.ts` (node, injected `fetchImpl`), `api/__tests__/theme.test.ts` (node,
reads `app/globals.css`), `components/__tests__/BrandLogo.test.tsx` (happy-dom). Stories:
`components/BrandLogo.stories.tsx` (WithLogo, NameOnly, Dark).
