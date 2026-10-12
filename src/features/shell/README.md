# shell

## Purpose

The application chrome every migrated Node page sits inside: the sidebar, the topbar, the
breadcrumb trail and the page grid. It renders no business content of its own.

This feature owns the chrome's **words** — the `shell` message namespace — and this README. The
components themselves live under `src/components/` (`molecules/NavItemLink`,
`molecules/Breadcrumbs`, `organisms/Sidebar`, `organisms/Topbar`, `organisms/AccountMenu`,
`templates/PageShell`) because
they are presentation shared by every page rather than one feature's screen.

The shell **wraps** pages; it is not a landing page. A signed-in staff member still lands on the
Perfex dashboard (D-10). `app/(shell)/layout.tsx` wraps the migrated routes only, so `/login`,
`/logout` and `/status` stay outside it.

## Legacy screen

`application/views/admin/includes/aside.php`, with `header.php` (the topbar) and
`setup_menu.php` (the Setup panel).

## Legacy parity

Panel by panel against the three legacy views.

| Legacy panel                                                                       | Ours                                           | Parity                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aside.php` main menu                                                              | `Sidebar` main panel                           | 1:1 — 165 items in declared order with their icons and submenus                                                                                                                                                       |
| `setup_menu.php`                                                                   | `Sidebar` Setup panel                          | 1:1 — 34 items, kept as a **second panel**, not flattened into a submenu                                                                                                                                              |
| `aside.php` user block                                                             | `Sidebar` footer block                         | 1:1                                                                                                                                                                                                                   |
| `header.php` brand + toggle                                                        | `Topbar` toggle; brand in the `Sidebar` header | 1:1 — logo from `GET /api/v1/branding`, never a file in `src/` (W0-05); the toggle hides the sidebar offcanvas on desktop and opens the drawer below `md` (D-10)                                                      |
| `header.php` language switch                                                       | `AccountMenu` Language sub-menu                | 1:1 — writes `erp_locale` (System Default clears it), labels `shell.language` / `shell.system_default_string`, each locale named in its own language                                                                  |
| `header.php` profile menu                                                          | `AccountMenu` My profile                       | My Profile kept as an external link to its Perfex page; Edit Profile and My Timesheets dropped (below)                                                                                                                |
| `header.php` logout                                                                | `AccountMenu` Sign out                         | 1:1 — `/logout`, the existing `LogoutButton` sequence, last in the menu (D-09)                                                                                                                                        |
| `header.php` search, quick-create, timers, to-do, notifications, settings shortcut | —                                              | dropped, see below                                                                                                                                                                                                    |
| heading weight                                                                     | `600` semibold                                 | **normalised**: the legacy uses `tw-font-bold` (700) for panel and page headings. 700 and 600 are indistinguishable at 18–20px in Inter and a third weight is a permanent tax, so the two-weight contract renders 600 |

199 menu items in total (165 + 34). Item order is **position, then alphabetical by item id** at
every level (D-20). That tie rule is stated, not claimed as a mechanical 1:1 — Perfex's own order
is only partially determined by `position`, and equal positions fall back to registration order,
which no static file can reproduce.

A `legacy: true` item — one whose page is still Perfex's — is presentationally **identical** to a
Node item apart from a trailing external-link glyph and a visually-hidden `shell.opens_in_perfex`.
No colour change and no opacity change, deliberately: a member must never read "legacy" as
"broken" or "disabled".

## Dropped on purpose

- **Edit Profile and My Timesheets in the profile menu** — D-09 (finding 3) folds the topbar into one account menu holding My profile, Language and Sign out. Edit Profile pointed at the same Perfex page as My profile; My Timesheets stays reachable from the sidebar's Timesheets & Leave entries. Revisit: if members ask for it back in the account menu.
- **Global search and the voice-command button** — needs a cross-module search API Node does not
  have. Revisit: the first Node module that owns searchable records.
- **Quick-create menu** — same reason; it creates records across modules. Revisit: when two or more
  create screens are Node's.
- **Running timers** — belong to the timesheets module, still Perfex's. Revisit: the timesheets
  migration.
- **To-do** — a Perfex module with no Node counterpart. Revisit: when to-do migrates.
- **Notifications** — needs a cross-module event feed. Revisit: the outbox/relay work (BE-13).
- **Settings shortcut (topbar)** — a shortcut into Perfex's settings screens. Revisit: when settings
  migrates. **The `shell.settings` key stays** — three Setup nav items use it; only the topbar
  shortcut is dropped.
- **Dark sidebar variant (D-15)** — the legacy ships a dark skin, but colours are branding token
  values on `:root` and a second skin is a second contract. Revisit: a customer asks for it as
  branding data.
- **Persisted collapse preference** — the sidebar collapses, but the choice is not stored;
  persisting it needs a per-member preference store Node does not have. Revisit: the first real
  user-preference requirement.

The six dropped topbar features have legacy keys (`top_search_placeholder`, `quick_create`,
`nav_todo_items`, `nav_notifications`, `whats_on_your_mind`, `search_by_tags`). They are
**deliberately absent** from `messages/en.json`, and a gate asserts their absence.

### Perfex glyphs with no faithful lucide equivalent

Mapped to the nearest neighbour rather than approximated with a custom asset (ADR-0002, one icon
system): `american-sign-language-interpreting` → `Handshake`, `arrows-to-dot` → `Crosshair`,
`dashboard` → `Gauge`, `file-powerpoint` → `FileChartColumn`, `first-order` → `Factory`,
`magic` → `Wand`, `medkit` → `BriefcaseMedical`, `rss-square` → `Rss`, `street-view` → `MapPinned`,
`vcard` → `IdCard`, `adjust` → `Contrast`, `certificate` → `Award`, `clone` → `Copy`,
`sitemap` → `Network`, `check-square-o` → `SquareCheck`, plus the fixed-equipment asset-inventory
glyph, registered as `boxes-stacked` because its Font Awesome name contains the customer's company
name as a substring (W0-05; `check:brand` fails on it).

## Routes

The shell renders no route of its own. `app/(shell)/layout.tsx` is a Server Component that wraps
every page in the `(shell)` route group; pages are added by the feature that owns them (plans 07
and 08 add the staff and roles screens, at `/setup/staff*` and `/setup/roles*` since plan 04.2-27).
The layout **never sets `dir=`**: direction comes from the
locale, one level up.

## Data

None of its own. It reads:

- `src/config/navigation.ts` — `NAVIGATION` and `SETUP_NAVIGATION` (plan 04)
- `src/config/routes.ts` — `breadcrumbsFor(pathname)`
- `usePermissions()` — `GET /api/v1/auth/me`, to filter menu items
- `@/features/branding` — `BrandLogo`, the only `<img>` in the chrome

It writes one cookie, `erp_locale`, through the account menu's Language sub-menu (and clears it for System Default); the sidebar primitive writes `sidebar_state`, which `app/(shell)/layout.tsx` reads.

## Messages

One namespace, `shell`, **193 keys** after this task; the Sidebar and Topbar chrome keys arrive
with the components that render them, because the shape spec requires every key to have a reader:

| Provenance             | Count | Rule                                                                                                                                                                                  |
| ---------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| legacy `_lang.php` key | 186   | key name and English text taken **byte-identical** from the legacy English language pack — never retyped                                                                              |
| legacy literal         | 3     | `cheque_management`, `face_attendance`, `sales_returns` — Perfex registers these menu items with a hardcoded `'name'`, so the key is ours and the text is the literal, byte-identical |
| ours                   | 4     | `opens_in_perfex` and `breadcrumb_nav` — accessibility text the legacy has no equivalent for; `new` and `record`, the two crumb keys `src/config/routes.ts` names                     |

`skip_to_content` and `forbidden` live in the `common` namespace, not here: the skip link and the
refusal message are not the shell's alone.

**`ar.json` is UNREVIEWED.** It carries the same 193 keys as `en.json`. Of those, **74 carry
Arabic** (4 taken from Perfex's own Arabic pack, 70 drafted here) and **119 still carry the English
text** as a visible placeholder. English text in the Arabic file is deliberate: a wrong translation
that looks finished is worse than an obvious gap, and the registry merges English under every
locale anyway, so a missing key would render English regardless. The file is a worklist for the
customer's reviewer, not a translation: every key stays marked unreviewed until they sign it off,
and nothing here ships to a customer as Arabic before that.

## How to run its tests

```bash
corepack yarn test src/components/molecules src/components/organisms src/components/templates src/messages
corepack yarn lint && corepack yarn typecheck
corepack yarn storybook:build      # every component has an `ar` story
```
