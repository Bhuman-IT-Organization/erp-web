# Lead Sources Module (`tbllead_sources`)

## Purpose

Lead Sources of the modernised ERP: the list at `/setup/lead-sources`, the create form at
`/setup/lead-sources/new` and the record form at `/setup/lead-sources/:id`. It is a setup list of
Wave 2a (W2A-04); it started as a copy of erp-docs 05-templates/frontend-feature, on the recipe
the Expense Categories pilot proved and Cost Centers followed. Node owns `tbllead_sources` since the Wave
2a register flip (plan 04.1-18), and every write goes through erp-api `src/v1/lead-sources`.

**Setup item** (D-25): Perfex puts Lead Sources in the setup menu under Leads. The Node item stays in the setup navigation section (`src/config/navigation.ts`, `lead-sources`, icon `tags` through the Icon registry); its address lives under `/setup/lead-sources`. On all three routes the sidebar opens the Setup menu with Lead Sources marked, and the breadcrumb comes from the menu tree (`activeTrailOf`).

**Administrators only** (D-06, D-26). Perfex's menu item was administrator-only, but its controller
let any signed-in staff member list, add, edit and delete lead sources by address. Node closes that:
the three routes are `ADMIN_GATE` in `src/config/route-gates.ts`, the mirror of `@erp/contracts`'
`ROUTE_GATES` (kept in sync with erp-api's `packages/contracts` by hand), the menu item reads the
same gate through `navGateOf`, and both screens sit behind `withAuth(withPermission(...))`: a
non-administrator sees the kit's "no access" state once `/me` has answered, and the screen asks the
api for nothing. The page gate is presentation only: the api refuses every handler to anyone but an
administrator with 403 `ERP-AUTH-0005` regardless.

**Names are text.** Node accepts what Perfex accepts (D-29): a trimmed name of 1 to 150 characters,
every character allowed, `<` and `>` included, and a name another lead source already holds. A
name is rendered as React text only, never as raw HTML, in the list cell, the delete dialog, the
form title and the breadcrumb (T-4.1-91).

## Legacy screen

`application/views/admin/leads/manage_sources.php` (the list page: its Add New Source button, table columns for name and options), with `application/controllers/admin/Leads.php` (the lead sources actions), and `application/models/Leads_model.php` (`add_source` writing `dateadded` and `update_source`). Only the flow, the `_l()` keys and line numbers were taken
from them; no text is quoted from the views, and every legacy text comes from the legacy language
packs.

## Legacy parity

Flow parity (FE-18, D-29): someone who used the Perfex screen does the same job in the same order,
with the same business outcome.

| Perfex step                                                                                        | Node step (`LeadSourcesList.tsx`, `LeadSourcesForm.tsx`)                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup > Lead Sources, administrators only                                                          | the same setup item, administrators only (D-25); it opens `/setup/lead-sources` and stays marked on the list, `/new` and `/:id`                                                                 |
| the list: ID, Lead Source Name, Date Added, Options; search; paging                                | the same columns in the same order, **name ascending by default**, the server search, the pager; Date Added is the date and time in the customer's format, empty when Perfex stored none (D-31) |
| Add New Source opens the create page (Name required) > Save > the added alert > back to the list   | Add Lead Source opens the `/new` page with the same field > Create lead source > the save summary > "Lead source saved" > back to the list                                                      |
| the name link or edit link opens the edit page prefilled > Save > updated alert > back to the list | the row, the Lead Source Name link or Edit opens `/:id` prefilled > Save lead source > the save summary ("Lead Source Name: old > new") > the toast > back to the exact list URL                |
| create writes the name and `dateadded`; edit saves name and order                                  | the same: the api writes the name and `dateadded` on create, and name/order on edit (D-31)                                                                                                      |
| Perfex's Export buttons over the table                                                             | the kit's Export menu: CSV, Excel, PDF or Print of ID, Lead Source Name and Date Added for every row matching search and sort; no PDF under Arabic, where Print covers it (D-09)                |
| delete link > browser's confirm > GET delete > deleted alert                                       | Delete > a dialog naming the lead source; refused up front while anything uses it (one line per use, nothing sent); otherwise "Lead source deleted", or refusal inside dialog                   |

## Dropped on purpose

Each change, with its reason, for the lead's checkpoint (D-29: only a change to a business outcome
goes back to the leads; the one that is a lead decision is marked).

- **A delete while the lead source is in use is refused and names each use** (D-07, D-28). **Lead
  decision of 2026-09-29**, the one business-outcome change: Perfex deleted the row and left the
  leads and customers pointing at it naming nothing. Node counts each of the two (leads, customers)
  and the dialog names each non-zero one.
- **Administrators only** (D-26, a security fix): Perfex's screen was open to any signed-in staff
  member by address; Node's routes and api are administrator-only.
- **Only the name and order are saved** (D-26, D-31): Perfex saved every posted field; Node saves the name and order,
  and writes `dateadded` on create as Perfex writes them. The business outcome is unchanged.
- **The search matches the name and an exact id** (a simplification): Perfex's table searched every
  cell's text, the date included; Node searches the name as a substring and the id exactly.
- **Date Created does not sort** (a simplification): the column may be empty, and the ID order is
  the creation order.
- **Unchanged, recorded so nobody expects otherwise:** duplicate names are accepted, as in Perfex.
- **Perfex's activity-log lines**: Node never writes Perfex's Activity Log; the domain event and the
  service log line are the record (D-18).
- **Arabic PDF, parked** (D-09): the PDF's standard font cannot draw Arabic, so the Export menu
  offers no PDF under a right-to-left locale; Print keeps every language.
- The browser `confirm()`: the kit's `ConfirmDialog`, naming the lead source (3.2 D-25).
- The heading on edit is the record name, not "Edit Lead Source" (the 3.2 page-title rule);
  `edit_source` is the document title.
- The alert wording: the kit's toasts and the plain-language refusal replace the legacy alerts, and
  the verb + noun buttons replace `cancel` and `submit`.
- Added on purpose: the save summary before every save (3.2 D-25.4).

## Routes

All three live in the shell's route group, so they get the sidebar and the topbar, and each is
`ADMIN_GATE` in `src/config/route-gates.ts`, declared above the `registry` marker block.
`proxy.ts`'s `/setup/:path*` matcher sends an anonymous visitor to `/login` on all three.

- `/setup/lead-sources` (`app/(shell)/setup/lead-sources/page.tsx`, `force-dynamic`):
  `pages/LeadSourcesListPage.tsx`; the search, sort and page live in the URL (FE-15);
  `generateMetadata` > `lead_sources`.
- `/setup/lead-sources/new` (`new/page.tsx`): `pages/LeadSourcesPage.tsx` with no id;
  `generateMetadata` > `lead_new_source`.
- `/setup/lead-sources/:id` (`[id]/page.tsx`): `notFound()` unless the id is a positive integer,
  then the same page with `String(Number(id))`; `generateMetadata` > `edit_source`.
- `app/(shell)/setup/lead-sources/error.tsx`: the segment's error boundary (keys from `common`;
  never `error.message`).

## Data

`api/lead-sources.endpoints.ts`, `LEAD_SOURCES_ENDPOINTS`: the six calls erp-api
`src/v1/lead-sources` serves.

| call                                                          | used by                              | note                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/lead-sources?q&sort&limit&cursor`                | `ListPageTemplate`                   | BE-19 keyset grammar, **name ascending by default**, `id` and `name` sort; a row is the whole record: `{ id, name, dateCreated, usage }` |
| `GET /api/v1/lead-sources/export?format&q&sort&column&header` | `ListPageTemplate` (the Export menu) | CSV, Excel, PDF or the print rows; `id`, `name`, `dateCreated` (`LEAD_SOURCES_EXPORT_COLUMNS`), one translated header each               |
| `GET /api/v1/lead-sources/:id`                                | `useLeadSources`                     | the record; a row opened from the list seeds it (D-35)                                                                                   |
| `POST /api/v1/lead-sources`                                   | `useSaveLeadSources().create`        | `{ name }`; a name another lead source holds is accepted; never retried                                                                  |
| `PATCH /api/v1/lead-sources/:id`                              | `useSaveLeadSources().update`        | `{ name, orderby }`; 404 `ERP-CORE-0004` when it was deleted meanwhile, shown inside save summary; never retried                         |
| `DELETE /api/v1/lead-sources/:id`                             | `useDeleteLeadSource`                | 204; 409 `ERP-LEADSOURCES-0001` while in use; 404 `ERP-CORE-0004`; never retried                                                         |

- **The usage is never a column nor exported.** Its two groups (leads, customers) let the delete dialog refuse up front
  (`refusedCode`), one line per non-zero group, in that order. The api's live 409 covers the race.
  After a 404 or a 409 on delete the list pages ask again (UI-SPEC G8).
- `dateCreated` is the ISO instant of Perfex's wall clock in the company zone, or `null` when Perfex
  stored no date; the list shows it as the date and time through the format door (`f.dateTime`), empty for `null`; the export's PDF and
  Print carry the same text.
- After an edit opened from the list, the saved record is swapped into the cached list pages (no
  list request, D-36); after a create, or an edit of a permalink, the list pages ask again.
- A 400 `ERP-VALIDATION-0001` carries `issues`, zod-parsed before `setError`; the api's text is
  never rendered (T-3-26). `name` is the one issue target.

## Messages

`messages/en.json`, namespace `lead-sources`, registered in `src/messages/index.ts`.

- **Perfex keys** use the native localization keys: `lead_sources`,
  `lead_new_source`, `edit_source`, `leads_sources_table_name` (or `leads_source_add_edit_name`), and `leads_table_total`.
- **Ours**, in snake_case: `noun_lead_source` (the noun of every verb + noun label),
  `noun_lead_sources` (the plural in the list's failure line), `section_details`,
  `empty_heading`, `empty_body`, `no_match_heading`, `no_match_body`, `enter_name`,
  `name_too_long`, `saved_toast`, `deleted_toast`, `edit_action_named`, `delete_action_named`,
  `delete_title`, `delete_body`, the two `in_use_*` lines (ICU plurals on `count`), `errors.ERP-CORE-0004` and `errors.ERP-LEADSOURCES-0001`.

`messages/ar.json` holds the same key set, **unreviewed**: the legacy keys carry the English pack
text (no Arabic noun is claimed), ours a draft Arabic placeholder, until the customer's reviewer
signs the file off (a data change).

## How to run its tests

```bash
corepack yarn test src/features/lead-sources
```
