# currencies

## Purpose

Currencies of the modernised ERP: the list at `/setup/currencies`, the create form at
`/setup/currencies/new` and the record form at `/setup/currencies/:id`. It is the fifth list of
Wave 2a (W2A-05); it started as a copy of erp-docs 05-templates/frontend-feature, on the recipe the
Expense Categories pilot proved and Taxes, Cost Centers and Payment Modes repeated. Node owns
`tblcurrencies` since the Wave 2a register flip (plan 04.1-27), and every write goes through
erp-api `src/v1/currencies`.

**A Setup > Finance item** (D-38): Perfex puts Currencies under Setup > Finance at position 10,
after Taxes and before Payment Modes (`application/helpers/menu_helper.php:496-499`). The Node item
stays exactly there (`src/config/navigation.ts`, `currencies`); only its address moved under
`/setup` (D-05). On all three routes the sidebar opens the Setup panel with Finance open and
Currencies marked, and the breadcrumb comes from the menu tree (`activeTrailOf`).

**Administrators only** (D-06, D-38), as Perfex's screen was (`Currencies.php:11`). The three routes
are `ADMIN_GATE` in `src/config/route-gates.ts`, the mirror of `@erp/contracts`' `ROUTE_GATES`
(kept in sync with erp-api's `packages/contracts` by hand), the menu item reads the same gate through
`navGateOf`, and both screens sit behind `withAuth(withPermission(...))`: a non-administrator sees
the kit's "no access" state once `/me` has answered, and the screen asks the api for nothing. The
page gate is presentation only: the api refuses every handler, make-base included, to anyone but an
administrator with 403 `ERP-AUTH-0005` regardless.

**Codes and symbols are text.** A code or a symbol Perfex stored before the cutover may hold any
character; both are rendered as React text only, never as raw HTML, in the list, both dialogs, the
form, its title and the breadcrumb (T-4.1-159).

**One code schema** (Currencies planning answers 7 and 8 b): the form's code rule comes from
`src/config/currency-code.ts`, a byte copy of erp-api `packages/contracts/src/currency-code.ts`
(trimmed, the ASCII letters upper-cased as PHP's `strtoupper` does, 1 to `CURRENCY_CODE_MAX`
characters). This feature never restates the limit; the two files are kept byte-identical by hand.

## Legacy screen

`application/views/admin/currencies/manage.php` (the list page: New Currency at :10, the Currency
Code, Symbol and Options columns at :16-18; the add and edit modal: the two headings at :33-34, the
code-validity help at :42, the code with its ISO code placeholder at :43, the symbol at :44, the
decimal separator and its two options at :49-53, the thousand separator and its five options at
:60-67, the placement and its two options at :74-83, Close and Save at :90-91, the table at :101,
the required rules and the code's three-character cap at :104-110, a new currency's defaults at
:122-126), with `application/views/admin/tables/currencies.php` (the code cell and the base label
at :36-39, the make-base star on a non-base row at :49-56, the delete link at :58),
`application/controllers/admin/Currencies.php` (the administrator check at :11, the list at :22,
the added and updated alerts at :35 and :45, make-base's refusal and success at :63 and :65, the
delete's three answers at :78-84), `application/models/Currencies_model.php` (the code upper-cased
at :64 and :85, the activity-log lines at :68, :89 and :129, the delete rule at :104-129, the
make-base rule at :142-161) and `application/helpers/menu_helper.php:496-499` (the Setup > Finance
item); the list's default order is `assets/js/main.js:3326-3327` (the first column descending).
Only the flow, the `_l()` keys and line numbers were taken from them; no text is quoted from the
views, and every legacy text comes from the legacy language packs.

## Legacy parity

Flow parity (FE-18, D-29): someone who used the Perfex screen does the same job in the same order,
with the same business outcome.

| Perfex step (`currencies/manage.php`, `tables/currencies.php`, `Currencies.php`)                                                                                                                   | Node step (`CurrenciesList.tsx`, `CurrenciesForm.tsx`)                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup > Finance > Currencies, between Taxes and Payment Modes, administrators only (`menu_helper.php:496`)                                                                                         | the same Setup > Finance item in the same place, administrators only (D-38); it opens `/setup/currencies` and stays marked on the list, `/new` and `/:id`                                                                                                                                            |
| the list: Currency Code (with the base label under the base currency's code) and Symbol, Options; the code descending; search; paging                                                              | the same two columns in the same order with the same base label under the base row's code, the code descending by default with no arrow (G6), the server search, the pager                                                                                                                           |
| New Currency opens the modal: the code-validity help, the code (ISO code placeholder), the symbol, the two separators and the placement; the placement Before and the separators from the settings | New Currency opens the `/new` page (D-04) with the same note, the same five fields and the same defaults (placement Before Amount, both separators the deployment's number format) > Create currency > the save summary > "Currency saved" > back to the list                                        |
| the code link or the edit link opens the modal prefilled > Save > the "updated" alert > the list                                                                                                   | the row, the code link or Edit opens `/:id` prefilled > Save currency > the save summary (one line per changed field) > the toast > back to the exact list URL                                                                                                                                       |
| the code upper-cased by the model as saved                                                                                                                                                         | the same: the code upper-cased as Perfex's `strtoupper` does, and also trimmed (a recorded simplification, D-29)                                                                                                                                                                                     |
| the separators and the placement as two selects with Perfex's options                                                                                                                              | the same options, as the kit's radio buttons (six or fewer options, the kit's lead decision of 2026-09-26); the api refuses anything outside them (a recorded simplification, D-29)                                                                                                                  |
| a code another currency holds is accepted                                                                                                                                                          | the same                                                                                                                                                                                                                                                                                             |
| the star on a non-base row makes it the base in one click, refused while the base has transactions                                                                                                 | Make base currency on a non-base row asks for confirmation first (a recorded UX addition, D-29) and keeps Perfex's rule (D-39): refused up front when the row says the current base has transactions, nothing sent; on success Perfex's own "This is now your base currency." and the list refreshes |
| Perfex's Export buttons over the table                                                                                                                                                             | the kit's Export menu: CSV, Excel, PDF or Print of the code, the symbol and the base flag for every row matching the search and sort; no PDF under Arabic, where Print covers it (D-09)                                                                                                              |
| the delete link > the browser's confirm > refused while the base or while Perfex's seven core columns use it, else deleted > an alert                                                              | Delete > a dialog naming the currency; refused up front, nothing sent, while any delete group uses it (one line per use), while it is the base, or while another module registered a use; otherwise "Currency deleted", or the refusal inside the dialog                                             |

## Dropped on purpose

Each change, with its reason, for the lead's checkpoint (D-29: only a change to a business outcome
goes back to the leads; each lead decision is marked).

- **No activity-log line** (D-43, a release note): Perfex wrote one on every add, edit and delete
  (`Currencies_model.php:68, 89, 129`); Node never writes Perfex's Activity Log, and the domain
  event and the service log line are the record.
- **A delete is refused while any id reference of the register uses the currency** (D-40 and
  Currencies planning answer 1). **A lead decision on a business outcome**: Perfex checked its seven
  core columns; Node counts 24 groups over documents, masters, purchase's converted-from and
  converted-to ids and fixed-equipment locations, each found at runtime, and the dialog names each
  non-zero one. The exchange rates and their logs do not block a delete, as in Perfex.
- **A currency another module registered a use for cannot be deleted** (D-41). **A lead decision**:
  Node refuses while any registered use counts above 0 and names it in general words. No module of
  this copy registers one.
- **The code cannot change while anything uses the currency** (D-42 widened, Currencies planning
  answers 2 and 8). **A permanent lead decision**: a rename would make past documents, exchange
  rates, their logs and payslips show another code, and Perfex renamed it freely. The register's
  lines and another module's registered use lock it alike; the form opens the code
  read-only with a note naming each use, and the symbol, the separators and the placement stay
  editable. A lock that appears after the form opened is the api's 409, shown in the save summary.
- **The code is limited to 3 characters by one schema the api and this form share** (answer 7);
  Perfex's form capped it at 3 and its model did not.
- **The code is trimmed** (D-29): Perfex saved the posted code untrimmed; a recorded simplification.
- **The separators and the placement are refused outside Perfex's options** by the api (D-29), where
  Perfex's model saved any posted value; the form only offers those options.
- **Make base currency asks for confirmation** (a recorded UX addition, D-29): Perfex's star changed
  the base in one click.
- **`get_currency_symbol` stays on Perfex** (D-38) for Perfex's own screens; Node's rows carry the
  symbol.
- **The search matches the code, the symbol and an exact id**, as Perfex's table searched the code
  and the symbol.
- **Arabic PDF, parked** (D-09): the PDF's standard font cannot draw Arabic, so the Export menu
  offers no PDF under a right-to-left locale; Print keeps every language.
- The modal became the `/new` and `/:id` pages (D-04), the success alerts a toast and a return to
  the list, Perfex's Export buttons the kit's four-format menu, the star a labelled row action, and
  the delete link with the browser's confirm the kit's `ConfirmDialog`, naming the currency (3.2
  D-25).
- The heading on edit is the record's code, not "Edit Currency" (the 3.2 page-title rule);
  `currency_edit_heading` is the document title.
- Added on purpose: the save summary before every save (3.2 D-25.4).

## Routes

All three live in the shell's route group, so they get the sidebar and the topbar, and each is
`ADMIN_GATE` in `src/config/route-gates.ts`, declared above the `registry` marker block.
`proxy.ts`'s `/setup/:path*` matcher sends an anonymous visitor to `/login` on all three.

- `/setup/currencies` (`app/(shell)/setup/currencies/page.tsx`, `force-dynamic`):
  `pages/CurrenciesListPage.tsx`; the search, sort and page live in the URL (FE-15);
  `generateMetadata` > `currencies`.
- `/setup/currencies/new` (`new/page.tsx`): `pages/CurrenciesPage.tsx` with no id;
  `generateMetadata` > `currency_add_heading`.
- `/setup/currencies/:id` (`[id]/page.tsx`): `notFound()` unless the id is a positive integer, then
  the same page with `String(Number(id))`; `generateMetadata` > `currency_edit_heading`.
- `app/(shell)/setup/currencies/error.tsx`: the segment's error boundary (keys from `common`; never
  `error.message`).

## Data

`api/currencies.endpoints.ts`, `CURRENCIES_ENDPOINTS`: the seven calls erp-api `src/v1/currencies`
serves.

| call                                                        | used by                              | note                                                                                                                                            |
| ----------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/currencies?q&sort&limit&cursor`                | `ListPageTemplate`                   | BE-19 keyset grammar, the code descending by default (`-name`), `name` and `symbol` sort; a row is the whole record                             |
| `GET /api/v1/currencies/export?format&q&sort&column&header` | `ListPageTemplate` (the Export menu) | CSV, Excel, PDF or the print rows; `name`, `symbol`, `isBase` (`CURRENCIES_EXPORT_COLUMNS`), one translated header each                         |
| `GET /api/v1/currencies/:id`                                | `useCurrencies`                      | the record; a row opened from the list seeds it (D-35)                                                                                          |
| `POST /api/v1/currencies`                                   | `useSaveCurrencies().create`         | the five fields; a code another currency holds is accepted; never retried                                                                       |
| `PATCH /api/v1/currencies/:id`                              | `useSaveCurrencies().update`         | the five fields; 409 `ERP-CURRENCIES-0005` when the code changes while in use, 404 `ERP-CORE-0004`, both inside the save summary; never retried |
| `PATCH /api/v1/currencies/:id/base`                         | `useMakeBaseCurrency`                | `{}`, answering `{ id, isBase: true }`; 409 `ERP-CURRENCIES-0004`, 404; every cached currencies read asks again on success; never retried       |
| `DELETE /api/v1/currencies/:id`                             | `useDeleteCurrency`                  | 204; 409 `ERP-CURRENCIES-0001` (in use), `-0002` (the base), `-0003` (another module's use); 404 `ERP-CORE-0004`; never retried                 |

- A row and a record are `{ id, name, symbol, decimalSeparator, thousandSeparator, placement,
isBase, usage, lockUsage, registeredUsage, canMakeBase }`: `name` is the code; a separator or the
  placement is `null` for a NULL column, which the form shows as no choice made and requires.
- **The counts are never a column nor exported.** `usage` (the 24 delete groups), `lockUsage`
  (exchange rates, their logs, payslips showing the code), `registeredUsage` (empty in this copy)
  and `canMakeBase` let the dialogs refuse up front (`refusalOf`: in use, then the base, then
  another module's use, the api's order; `makeBaseRefusalOf`) and the form lock the code
  (`isCodeLocked`: any group above 0). The api's live 409s cover the race. After a 404 or a 409 the
  list pages ask again (UI-SPEC G8).
- **The thousand separator's None is `''`**, which the kit's radio group reads as "no choice"; the
  form's radio carries a private value for it and the form keeps `''` (`toChoice`, `fromChoice`).
- After an edit opened from the list, the saved record is swapped into the cached list pages (no
  list request, D-36); after a create, or an edit of a permalink, the list pages ask again.
- A 400 `ERP-VALIDATION-0001` carries `issues`, zod-parsed before `setError`; the api's text is
  never rendered (T-3-26). `name` and `symbol` are the issue targets: the separators and the
  placement only offer Perfex's options.

## Messages

`messages/en.json`, namespace `currencies`, registered in `src/messages/index.ts`. The feature is a
one-word name, so the generated tests and stories read the pack as `en.currencies`, rewritten from
the template's `en['currencies']`.

- **Legacy keys** keep their `english_lang.php` names, and their English text was taken from the
  legacy language packs, copied byte-identical (never retyped): `currencies`,
  `new_currency`, `currency_list_name`, `currency_list_symbol`, `base_currency_string`,
  `make_base_currency`, `currency_add_heading`, `currency_edit_heading`,
  `currency_valid_code_help`, `currency_add_edit_description`, `iso_code`,
  `currency_add_edit_rate`, `settings_sales_decimal_separator`,
  `settings_sales_thousand_separator`, `settings_sales_currency_placement`,
  `settings_sales_currency_placement_before`, `settings_sales_currency_placement_after`,
  `currency_lowercase` (the noun of every verb + noun label) and `base_currency_set` (make-base's
  success).
- **Ours**, in snake_case: `noun_currencies` (the plural in the list's failure line),
  `section_details`, `empty_heading`, `empty_body`, `no_match_heading`, `no_match_body`,
  `enter_name`, `name_too_long`, `enter_symbol`, `symbol_too_long`, `choose_option`, the five
  `separator_*` option labels, `saved_toast`, `deleted_toast`, `edit_action_named`,
  `make_base_action_named`, `delete_action_named`, `delete_title`, `delete_body`, `make_base_title`,
  `make_base_body`, `make_base_keep`, `code_locked_warning`, the three `code_used_by_*` lines, the 24
  `in_use_*` group lines and `in_use_other` (ICU plurals on `count`, the
  number the formatted `countN`), `errors.ERP-CORE-0004` and `errors.ERP-CURRENCIES-0001` to
  `errors.ERP-CURRENCIES-0005`.
- **Legacy keys not used**: `options` (the actions column header is visually hidden), `close` and
  `submit` (verb + noun buttons), `currency` (title case; the lowercase noun is the label noun),
  `is_referenced`, `cant_delete_base_currency`, `has_transactions_currency_base_change` (the
  plain-words refusals replace them), `added_successfully`, `updated_successfully`, `deleted` and
  `problem_deleting` (the toasts and the refusals replace Perfex's alerts),
  `acs_sales_currencies_submenu` (the shell's menu label). The generator's `list_title`,
  `new_title`, `record_title`, `noun_currency`, `id`, `name`, `label` and `created_at` gave way to
  the legacy keys.

`messages/ar.json` holds the same key set, **unreviewed**: the legacy keys carry the English pack
text (no Arabic noun is claimed), ours a draft Arabic placeholder, until the customer's reviewer
signs the file off (a data change).

## How to run its tests

```bash
corepack yarn test src/features/currencies
```

DOM tests (`*.test.tsx`) opt into happy-dom on line 1 and render through `src/test/render.tsx`; the
network is a fake adapter on `http.defaults.adapter`. Every UI-SPEC state is a story export and an
`it`: the list's `Loading`, `Empty`, `NoResults`, `Error`, `Loaded`, `BaseRow`, `DeleteConfirm`,
`DeleteInUse`, `DeleteBase`, `DeleteRegisteredUse`, `DeleteRefused`, `DeleteRetryable`,
`MakeBaseConfirm`, `MakeBaseRefused`, `Mobile` and `Rtl`; the form's `Default`, `Edit`, `Loading`,
`Mobile`, `CodeLocked`, `CodeLockedByRegisteredUse`, `SaveSummary`, `Pending`, `FieldErrors`,
`ServerError`, `SaveRefusedDeleted`, `EditFromList`, `NotFound`, `SeededNotFound` and `Rtl`.
`corepack yarn check` audits every story with axe at 1280 and 375 px (`check:a11y`).
