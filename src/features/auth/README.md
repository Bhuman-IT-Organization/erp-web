# auth

## Purpose

The password login and the sign-out of the modernised ERP: the form posts to the Node api
(`POST /api/v1/auth/login`), keeps the access token in memory (ADR-0005), opens the legacy
CodeIgniter session through the one-time handoff (`POST /erp_sso/handoff`) and sends the staff
member on to `?next=`: a Node page at once, with the handoff in the background, a Perfex page once
the handoff answered (quick 261009-lgn, ADR-0038 amendment 2026-10-09); `/logout` revokes the Node session and then the legacy one. It is the
reference feature slice and the worked example of two rules: a
migrated screen is 1:1 with the legacy view it replaces (FE-07) and every visible string is a
message key (FE-08).

## Legacy screen

`application/views/authentication/login_admin.php`

The Perfex admin login (Tailwind-prefixed `tw-*` classes, Bootstrap form groups). Only class names
and `_l()` keys were read from it; no value from the legacy tree is copied anywhere.

## Legacy parity

Class for class, top to bottom (`tw-` prefix dropped; line numbers re-read after the i18n
conversion). Visual fidelity is a review item — no lint can judge it; this table is the reviewer's
checklist.

| Legacy class / element                                                                                                                         | Component:line                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| page background `tw-bg-neutral-100`                                                                                                            | `pages/LoginPage.tsx:28` `flex-1 bg-neutral-100`         |
| wrapper `tw-max-w-md tw-mx-auto tw-pt-24`                                                                                                      | `pages/LoginPage.tsx:29` `mx-auto max-w-md pt-24 pb-16`  |
| `company-logo text-center` (dark variant)                                                                                                      | `components/LoginLogo.tsx` — natural size, capped (lead) |
| heading `tw-text-neutral-800 tw-text-2xl tw-font-bold tw-mb-1`, `_l('admin_auth_login_heading')`                                               | `pages/LoginPage.tsx:32`                                 |
| subtitle `tw-text-neutral-600`, `_l('welcome_back_sign_in')`                                                                                   | `pages/LoginPage.tsx:35`                                 |
| card `tw-bg-white tw-mx-2 sm:tw-mx-6 tw-py-8 tw-px-6 sm:tw-px-8 tw-shadow-sm tw-rounded-lg tw-border tw-border-solid tw-border-neutral-600/20` | `pages/LoginPage.tsx:37`                                 |
| label (bold, `tw-mb-3`) — `_l('admin_auth_login_email')` / `_l('admin_auth_login_password')`                                                   | `components/LoginForm.tsx:34` `LABEL`                    |
| `form-control` (34 px, inset shadow)                                                                                                           | `components/LoginForm.tsx:35` `INPUT`                    |
| primary `btn-primary btn-block tw-font-semibold tw-py-2`                                                                                       | `components/LoginForm.tsx:37` `PRIMARY`                  |
| secondary `btn-default … tw-border-neutral-300`                                                                                                | `components/LoginForm.tsx:39` `SECONDARY`                |
| `fa-windows` in `#0078d4`                                                                                                                      | `components/LoginForm.tsx:47` `WindowsMark` (`me-2`)     |
| email field first, `autofocus`                                                                                                                 | `components/LoginForm.tsx:219`                           |
| form-group `tw-mt-8`                                                                                                                           | `components/LoginForm.tsx:232`                           |
| label row `tw-inline-flex tw-justify-between tw-items-end tw-w-full tw-mb-3`, `_l('admin_auth_login_fp')` on the right                         | `components/LoginForm.tsx:233–243`                       |
| submit, `_l('admin_auth_login_button')`                                                                                                        | `components/LoginForm.tsx:271`                           |
| OR divider `tw-flex tw-items-center tw-my-4` / `tw-flex-1 tw-border-t tw-border-neutral-200` / `tw-px-3 tw-text-sm tw-text-neutral-500`        | `components/LoginForm.tsx:300–304`                       |
| "Sign in with Active Directory" button (`btn-default`, opens the AD flow)                                                                      | `components/LoginForm.tsx:307` (opens the legacy form)   |

Ours, with no legacy counterpart: the `role="alert"` error line (`LoginForm.tsx:258`), the
"Try again" button for retryable codes (`:278`) and the "Retry" button after a failed handoff
(`:291`); the legacy page reloads with a flash message instead. After a sign-in into a Node page a
failed background handoff is a toast instead (`hooks/use-background-handoff.ts`: `handoff_failed`
with Retry), and a Perfex link clicked while the handoff is pending reads as busy until it opens
(`aria-busy`, `app/globals.css`). The login card's skeleton
(`LoginResume.tsx`, `LoginCardSkeleton`) shows while `/login` asks the api whether a flagged
session is live, and the signing-out state (`LogoutButton.tsx` with `auto`: "Signing out…" over a
button-shaped skeleton) shows while Perfex's Logout link ends both sessions (ADR-0038).

Already signed in: `Authentication::admin()` sends a signed-in staff member to `admin_url()`;
`/login` does the same on the api's word (`LoginResume`, ADR-0038), never on the cookie alone.

Perfex's Logout link: Perfex signs out at once; so does ours, of both systems, through
`/logout?from=legacy` (ADR-0038).

## Dropped on purpose

- **Remember me** (`_l('admin_auth_login_remember_me')`, the checkbox) — the 30-day rotating
  refresh cookie already does this (STATE, ADR-0005); the key is deliberately absent from
  `messages/en.json`.
- **reCAPTCHA** (the `show_recaptcha()` block, `g-recaptcha`) — the api's lockout
  (429 `ERP-AUTH-0006`, `Retry-After`) and the Nginx rate limit on `/api/v1/auth/login` replace
  it; pending client confirmation (03-RESEARCH Open Question 7).
- **"AD login is currently disabled" note** (`$ldap_enabled` conditional) — the AD button opens
  the legacy form (`/admin/authentication?legacy=1`), which shows its own note; wave 0 migrates the
  password login only (ADR-0030).

## Routes

- `/login` (`app/login/page.tsx`, `force-dynamic`): reads `?next=`, sanitises it with
  `src/lib/auth/safe-next.ts` (same-origin paths only), reads the `erp_session_present` hint
  (ADR-0038: present renders `LoginResume`, which asks the api first; absent renders the form at
  once), fetches the brand, renders `pages/LoginPage.tsx`; `generateMetadata` → `auth.page_title`.
- `/logout` (`app/logout/page.tsx`): renders `pages/LogoutPage.tsx`; `?from=legacy` (Perfex's
  Logout link, sent here by Nginx) signs out on arrival with no click (ADR-0038), plain `/logout`
  waits for the Sign out click; `generateMetadata` → `auth.logout_title`.

## The legacy handoff (ADR-0038, amended 2026-10-09)

Perfex is slow, so a sign-in never waits for it unless the destination is a Perfex page:

- **A Node `next`** (`isNodePage` in `src/lib/auth/legacy-session.ts`: the `proxy.ts` gates plus
  `/login`, `/logout`, `/status`) is entered at once through the client-side router, so the
  handoff's request is not cancelled, and the handoff runs in the background
  (`hooks/use-background-handoff.ts`). A failure blocks nothing: a toast with `handoff_failed` and
  Retry. Both `LoginForm` and `LoginResume` do this.
- **A Perfex `next`** (anything else, the safe side) waits for the handoff before the full
  navigation, as before: the Perfex page needs its session on arrival.
- **One flight per tab**: `openLegacySession` in `src/lib/auth/legacy-session.ts` is the shared
  promise; a second caller joins it. A completed handoff is stamped in session storage
  (`erp-legacy-opened`), so a full page load does not hand off again; sign-in and sign-out forget it.
- **Perfex links in Node**: `components/LegacyLinkGuard.tsx`, mounted once by
  `app/(shell)/layout.tsx`, binds `src/lib/hooks/use-legacy-link-guard.ts` to the handoff. One window
  click listener holds any plain same-tab link to a Perfex page (the kit's `LegacyLink`, a
  `legacy: true` nav row, a feature's own `<a>`) while the session is not known open, awaits or
  reruns the shared flight, then navigates. A click on an open session is left to the browser.

Unchanged: the 2FA path, the resume asking the api (never the cookie alone), the loop and sign-out
guards, the logout of both systems, `safeNext`, and the bearer in memory only (the stamp holds no
token and authorises nothing).

## Data

`api/auth.endpoints.ts` — one `callApi` per endpoint, never retried, never throws:

- `POST /api/v1/auth/login` → `loginResponseSchema` (`user.locale` optional: BCP-47 or `null`)
- `GET /api/v1/auth/csrf` → `csrfResponseSchema`
- `POST /api/v1/auth/refresh` (header `x-csrf-token`) → `loginResponseSchema`
- `POST /api/v1/auth/logout` (bearer + `x-csrf-token`) → 204

Cookies: `erp_refresh` and `erp_csrf` are the api's (`HttpOnly`, never read here); `erp_locale`
is written by the form from `user.locale` after a successful login
(`src/i18n/locale-cookie.ts`) and read only by `src/i18n/request.ts`. The handoff
(`api/legacy-handoff.ts`) is the one raw `fetch`: `POST /erp_sso/handoff` with the bearer, 204 =
the legacy session is open. `messageKeyFor(code, retryAfterS)` maps a problem-details code to a
message key under `auth.errors` plus its ICU values (`seconds` is `'none'` without `Retry-After`).

## Messages

`messages/en.json` (namespace `auth`), registered in `src/messages/index.ts`. Legacy keys keep the
legacy key name and the English text is byte-identical to `english_lang.php`; ours have no legacy
counterpart. Validation copy travels as keys through zod (`schemas/login.schema.ts`
`LOGIN_MESSAGE_KEYS`) and is resolved in the form.

| Key                                                                  | Used in                                          | Legacy key / ours                     |
| -------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------- |
| `admin_auth_login_heading`                                           | `LoginPage.tsx` heading                          | legacy                                |
| `welcome_back_sign_in`                                               | `LoginPage.tsx` subtitle                         | legacy                                |
| `admin_auth_login_email`                                             | `LoginForm.tsx` email label                      | legacy                                |
| `admin_auth_login_password`                                          | `LoginForm.tsx` password label                   | legacy                                |
| `admin_auth_login_fp`                                                | `LoginForm.tsx` forgot-password link             | legacy                                |
| `admin_auth_login_button`                                            | `LoginForm.tsx` submit                           | legacy                                |
| `page_title`                                                         | `app/login/page.tsx` metadata                    | ours                                  |
| `logging_in`                                                         | `LoginForm.tsx` submit while busy                | ours                                  |
| `sign_in_with_active_directory`                                      | `LoginForm.tsx` AD button                        | ours (hard-coded English in the view) |
| `handoff_failed`, `sign_in_again`, `open_legacy_sign_in_form`        | `LoginForm.tsx` handoff / 2FA paths              | ours                                  |
| `enter_valid_email`, `enter_password`                                | `login.schema.ts` → `LoginForm.tsx` field errors | ours                                  |
| `logout_title`, `logout_body`                                        | `LogoutPage.tsx`, `app/logout/page.tsx` metadata | ours                                  |
| `logout_button`, `signing_out`                                       | `LogoutButton.tsx`                               | ours                                  |
| `errors.ERP-AUTH-0001` … `errors.ERP-TIMEOUT-0001`, `errors.unknown` | `LoginForm.tsx` via `messageKeyFor`              | ours (problem-details codes)          |
| `common.or`, `common.try_again`, `common.retry`                      | `LoginForm.tsx` (from `src/messages/common`)     | ours (`OR` is hard-coded in the view) |

The background handoff (`hooks/use-background-handoff.ts`) adds no key: its toast reads
`auth.handoff_failed` with `common.retry`. The `/login` resume (`LoginResume.tsx`) adds no key: its skeleton's label is `common.loading`,
and a failed resume shows `auth.handoff_failed` with `common.retry`; the automatic sign-out's
state reads `auth.signing_out`.

`messages/ar.json`: the same keys, **unreviewed** — awaiting the customer's translation, which
replaces the file (a data change, no code). It exists so the mechanism is proven end to end
(the RTL smoke test in `components/__tests__/LoginForm.test.tsx` and `src/i18n/__tests__/request.test.ts`).

## How to run its tests

```bash
corepack yarn test src/features/auth
```

DOM tests (`*.test.tsx`) opt into happy-dom with `// @vitest-environment happy-dom` on line 1 and
render through `src/test/render.tsx` (`renderWithProviders`, `physicalClassesIn`).
