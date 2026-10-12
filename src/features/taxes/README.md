# taxes

## Purpose

Setup > Finance > Taxes of the modernised ERP: the list at `/setup/taxes`, the create form at
`/setup/taxes/new` and the record form at `/setup/taxes/:id`. It is the second list of Wave 2a
(W2A-02); it started as a copy of erp-docs 05-templates/frontend-feature, on the recipe the Expense
Categories pilot proved. Node owns `tbltaxes` since the Wave 2a register flip (D-20), and every
write goes through erp-api `src/v1/taxes`.

**Administrators only** (D-06). The three routes are `ADMIN_GATE` in `src/config/route-gates.ts`,
the mirror of `@erp/contracts`' `ROUTE_GATES` (kept in sync with erp-api's `packages/contracts` by
hand), and both screens sit behind `withAuth(withPermission(...))`: a non-administrator sees the
kit's "no access" state once `/me` has answered, and the screen asks the api for nothing. The page
gate is presentation only: the api refuses every handler to anyone but an administrator with 403
`ERP-AUTH-0005` regardless.

**Names are text.** Node accepts what Perfex accepts (D-19's principle): a trimmed name of 1 to 100
characters with `<` and `>` allowed; only `|`, the separator of Perfex's `name|rate` strings, is
refused by the api and removed by the form as it is typed. A name is rendered as React text only,
never as raw HTML, in the list cell, the delete dialog, the form title and the breadcrumb
(T-4.1-48).

## Legacy screen

`application/views/admin/taxes/manage.php` (the list page and its add and edit modal), with
`application/views/admin/tables/taxes.php` (the table's columns and the in-use flags of each row),
`application/controllers/admin/Taxes.php` (`manage`, `delete`, `tax_name_exists`) and
`application/models/Taxes_model.php` (`add`, `edit`, `delete`). Only the flow, the `_l()` keys and
line numbers were taken from them; no text is quoted from the views, and every legacy text comes from
the legacy language packs.

## Legacy parity

Flow parity (FE-18): someone who used the Perfex screen does the same job in the same order.

| Perfex step (`taxes/manage.php`, `tables/taxes.php`, `Taxes.php`)                                                                                                                                                      | Node step (`TaxesList.tsx`, `TaxesForm.tsx`)                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Setup > Finance > Taxes (`menu_helper.php:490-492`)                                                                                                                                                                    | the same menu path opens `/setup/taxes`; the old URL `/admin/taxes` redirects there (Nginx, plan 04.1-13)                                                                                  |
| the list: ID, Tax Name, Rate (percent), Options; search; the rate ascending (`[2, 'asc']`); paging                                                                                                                     | the same columns in the same order, the server search, the rate ascending by default with no arrow (G6), the pager, and Export (CSV, Excel, PDF, Print) of ID, Tax Name and Rate (percent) |
| New Tax opens a MODAL (Tax Name required, Tax Rate (percent) required) > Submit > "added" alert > the table reloads                                                                                                    | New Tax opens the `/new` PAGE (D-04, a recorded restructure) with the same two fields > Create tax > the save summary > "Tax saved" > back to the list, which asks again                   |
| the name link or the pencil opens the modal prefilled > Submit > "updated" alert                                                                                                                                       | the row, the Tax Name link or Edit opens `/:id` prefilled > Save tax > the save summary ("Tax Name: old > new", "Tax Rate (percent): old > new") > the toast > back to the exact list URL  |
| typing a name with `\|` removes it on change (`manage.php:89-99`)                                                                                                                                                      | the form removes every `\|` and collapses the spaces as it is typed                                                                                                                        |
| the remote `tax_name_exists` check refuses a taken name before Submit (`Taxes.php:75`)                                                                                                                                 | a taken name is refused on save with 409 `ERP-TAXES-0003`, shown inside the save summary in plain words                                                                                    |
| a tax that expenses or subscriptions use opens the modal with its fields and Submit disabled and the `tax_is_used_in_expenses_warning` / `tax_is_used_in_subscriptions_warning` lines (`manage.php:45-48`, `:116-132`) | the form opens read-only with the same warning lines and no submit; "Back to list" stays. A default tax in Settings opens the same way with `default_tax_warning` (D-21)                   |
| Export (CSV / Excel / PDF / Print) of the rows the table has loaded; "All" in the page-size menu first to export everything                                                                                            | Export, then CSV, Excel, PDF or Print, of every row matching the search and sort, with no page-size step (D-03, D-04); no PDF under Arabic, where Print covers it (D-09)                   |
| the trash icon > the browser's confirm > GET delete > "deleted" or the `is_referenced` alert (`Taxes.php:59-66`)                                                                                                       | Delete > a dialog naming the tax; refused up front while anything uses it (one line per use, nothing sent); otherwise "Tax deleted", or the refusal inside the dialog                      |

**Kept on Perfex, not dropped (D-20, D-17).**

- Subscriptions' Stripe-rate insert (`application/models/Subscriptions_model.php:143-165`): when a
  subscription uses a Stripe tax rate with no matching row, Perfex adds one. It keeps working; the
  row shows on this list, because Node reads the table, and it publishes no Node event until
  Subscriptions moves to Node.
- The read helper `/admin/taxes/tax_name_exists`: Perfex's own, which Node does not use.

## Dropped on purpose

Each change, with its reason, for the lead's checkpoint:

- **The AJAX name check** (`tax_name_exists`): the api refuses a taken name on save (409
  `ERP-TAXES-0003`, Perfex's own case-insensitive comparison through the column's collation), and the
  save summary shows it; one round trip on save replaces one per keystroke.
- **The search matches the id and the rate exactly**, not as substrings: `5` finds the tax with id 5
  and every tax at 5.00 %, not 15 or 0.50 (the api's `q`, plan 04.1-11). The name still matches as a
  substring.
- **Every `|` is removed**, where Perfex removed only the first one (and only on change, collapsing
  the spaces only then); the api refuses any `|`, because it would corrupt Perfex's `name|rate`
  strings.
- **Perfex's `default_tax` rewrite** (`Taxes_model.php:86-101`): Perfex rewrites the default-tax
  setting when a default tax changes. Node never writes Perfex's settings (D-10), so it refuses to
  change the name or the rate of a default tax (409 `ERP-TAXES-0004`) and the form opens it
  read-only with the reason (D-21), until the settings move to Node.
- **Perfex's activity-log lines** (`Taxes_model.php:46`, `:112`, `:140`): Node never writes Perfex's
  Activity Log; the domain event and the service log line are the record (D-18).
- **The delete refusal widened** (D-07): Perfex refuses while items, expenses or subscriptions use the
  tax (`Taxes_model.php:126-131`); Node also counts vendor items, purchase, warehouse, fixed equipment
  and sales return lines and accounting rows, and names each use in the dialog.
- **Current-page-only export** (D-04): Perfex exports only the rows its table has loaded; Export here
  always covers every row matching the search and sort.
- **Arabic PDF, parked** (D-09): the PDF's standard font cannot draw Arabic, so the Export menu
  offers no PDF under a right-to-left locale; Print keeps every language.
- The modal: pages instead, with a URL, the route guard and the error summary (D-04).
- The browser `confirm()`: the kit's `ConfirmDialog`, naming the tax (3.2 D-25).
- The heading on edit is the record name, not "Edit Tax" (the 3.2 page-title rule); `tax_edit_title`
  is the document title.
- The alert wording: the kit's toasts and the plain-language refusals replace the legacy alert keys
  (`added_successfully`, `updated_successfully`, `deleted`, `problem_deleting`, `is_referenced`), and
  the verb + noun buttons replace `submit` and `close`.
- Added on purpose: the save summary before every save (3.2 D-25.4).

## Routes

All three live in the shell's route group, so they get the sidebar and the topbar, and each is
`ADMIN_GATE` in `src/config/route-gates.ts`, declared above the `registry` marker block.
`proxy.ts`'s `/setup/:path*` matcher sends an anonymous visitor to `/login` on all three.

- `/setup/taxes` (`app/(shell)/setup/taxes/page.tsx`, `force-dynamic`): `pages/TaxesListPage.tsx`;
  the search, sort and page live in the URL (FE-15); `generateMetadata` > `taxes`.
- `/setup/taxes/new` (`new/page.tsx`): `pages/TaxesPage.tsx` with no id; `generateMetadata` >
  `tax_add_title`.
- `/setup/taxes/:id` (`[id]/page.tsx`): `notFound()` unless the id is a positive integer, then the
  same page with `String(Number(id))`; `generateMetadata` > `tax_edit_title`.
- `app/(shell)/setup/taxes/error.tsx`: the segment's error boundary (keys from `common`; never
  `error.message`).

## Data

`api/taxes.endpoints.ts`, `TAXES_ENDPOINTS`: the six calls erp-api `src/v1/taxes` serves.

| call                                                   | used by                              | note                                                                                                                                        |
| ------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/taxes?q&sort&limit&cursor`                | `ListPageTemplate`                   | BE-19 keyset grammar, the rate ascending by default, `id` and `name` too; a row is the whole record: `{ id, name, rate, usage, isDefault }` |
| `GET /api/v1/taxes/export?format&q&sort&column&header` | `ListPageTemplate` (the Export menu) | CSV, Excel, PDF or the print rows; `id`, `name`, `rate` (`TAXES_EXPORT_COLUMNS`), one translated header each                                |
| `GET /api/v1/taxes/:id`                                | `useTaxes`                           | the record; a row opened from the list seeds it (D-35)                                                                                      |
| `POST /api/v1/taxes`                                   | `useSaveTaxes().create`              | `{ name, rate }`, both strings; 409 `ERP-TAXES-0003` for a taken name; never retried                                                        |
| `PATCH /api/v1/taxes/:id`                              | `useSaveTaxes().update`              | both fields; 409 `ERP-TAXES-0002` (expenses or subscriptions use it), `0003`, `0004` (a default tax, D-21); never retried                   |
| `DELETE /api/v1/taxes/:id`                             | `useDeleteTax`                       | 204; 409 `ERP-TAXES-0001` while in use; 404 `ERP-CORE-0004`; never retried                                                                  |

- **The usage is never a column nor exported.** Its nine groups (items, expenses, subscriptions,
  vendor items, purchase, warehouse, fixed equipment and sales return lines, accounting rows) let
  the delete dialog refuse up front (`refusedCode`), one line per non-zero group, and let the form
  open a tax read-only (`isLocked`: expenses or subscriptions use it, or `isDefault`). The api's live
  409s cover the race. After a 404 or a 409 on delete the list pages ask again (UI-SPEC G8).
- The rate is the two-decimal string the api answers (`5.00`), shown as given; the form sends the
  text typed and the api rounds it half away from zero to two places.
- After an edit opened from the list, the saved record is swapped into the cached list pages (no
  list request, D-36); after a create, or an edit of a permalink, the list pages ask again.
- A 400 `ERP-VALIDATION-0001` carries `issues`, zod-parsed before `setError`; the api's text is never
  rendered (T-3-26). `name` and `rate` are the issue targets.

## Messages

`messages/en.json`, namespace `taxes`, registered in `src/messages/index.ts`.

- **Legacy keys** keep their `english_lang.php` names, and their English text was taken from the
  legacy language packs, copied byte-identical (never retyped): `taxes`, `new_tax`,
  `tax_add_title`, `tax_edit_title`, `id`, `tax_dt_name`, `tax_dt_rate`, `tax_add_edit_name`,
  `tax_add_edit_rate`, `tax_is_used_in_expenses_warning`, `tax_is_used_in_subscriptions_warning`,
  `tax_lowercase` (the noun of every verb + noun label).
- **Ours**, in snake_case: `noun_taxes` (the plural in the list's failure line), `section_details`,
  `empty_heading`, `empty_body`, `no_match_heading`, `no_match_body`, `enter_name`,
  `name_too_long`, `enter_rate`, `rate_invalid`, `rate_too_large`, `saved_toast`,
  `default_tax_warning`, `deleted_toast`, `edit_action_named`, `delete_action_named`,
  `delete_title`, `delete_body`, the nine `in_use_*` lines (ICU plurals on `count`, the number the
  formatted `countN`), `errors.ERP-CORE-0004` and `errors.ERP-TAXES-0001` to `0004`.
- **Legacy keys not used**: `tax` (title case; the lowercase form is the noun), `options` (the
  actions column header is visually hidden), `submit` and `close` (verb + noun buttons),
  `is_referenced` (not plain language, D-32). The generator's `noun_tax` gave way to the legacy
  `tax_lowercase`, and its `list_title`, `new_title`, `record_title`, `name`, `label` and
  `created_at` to the legacy keys.

`messages/ar.json` holds the same key set, **unreviewed**: the legacy keys carry the English pack
text (no Arabic noun is claimed), ours a draft Arabic placeholder, until the customer's reviewer
signs the file off (a data change).

## How to run its tests

```bash
corepack yarn test src/features/taxes
```

DOM tests (`*.test.tsx`) opt into happy-dom on line 1 and render through `src/test/render.tsx`; the
network is a fake adapter on `http.defaults.adapter`. Every UI-SPEC state is a story export and an
`it`: the list's `Loading`, `Empty`, `NoResults`, `Error`, `Loaded`, `DeleteConfirm`, `DeleteInUse`,
`DeleteRefused`, `DeleteRetryable`, `Mobile` and `Rtl`; the form's `Default`, `Edit`,
`NameCleaned`, `SaveSummary`, `Loading`, `Mobile`, `Locked`, `DefaultTax`, `Pending`,
`FieldErrors`, `ServerError`, `SaveRefused`, `SaveRefusedDeleted`, `EditFromList`, `NotFound`,
`SeededNotFound` and `Rtl`. `corepack yarn check` audits every story with axe at 1280 and 375 px
(`check:a11y`).
