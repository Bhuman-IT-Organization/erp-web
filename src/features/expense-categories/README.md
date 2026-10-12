# expense-categories

## Purpose

Setup → Finance → Expenses Categories of the modernised ERP: the list at `/setup/expense-categories`,
the create form at `/setup/expense-categories/new` and the record form at
`/setup/expense-categories/:id`. It is the pilot of Wave 2a (W2A-01): the first feature started as
a copy of erp-docs 05-templates/frontend-feature, reshaped to Perfex's flow for one reference list,
so the next five lists copy a proven recipe. Node owns `tblexpenses_categories` since the Wave 2a
register flip, and every write goes through erp-api `src/v1/expense-categories`.

**Administrators only** (D-06). The three routes are `ADMIN_GATE` in `src/config/route-gates.ts`,
the mirror of `@erp/contracts`' `ROUTE_GATES` (kept in sync with erp-api's `packages/contracts` by
hand), and both screens sit behind `withAuth(withPermission(…))`: a non-administrator sees the kit's
"no access" state once `/me` has answered, and the screen asks the api for nothing. The page gate is
presentation only: the api refuses every handler to anyone but an administrator with 403
`ERP-AUTH-0005` regardless.

**Names and descriptions are text.** Node accepts exactly what Perfex accepts (D-19): a trimmed name
of 1 to 191 characters with no character refused, `<` and `>` included, and a description with no
cap. Both are rendered as React text only, never `dangerouslySetInnerHTML`, in the list cell, the
delete dialog, the form title and the breadcrumb; the description keeps its line breaks with CSS
(`whitespace-pre-line`). That is Node's XSS defence, as `e()` and HTMLPurifier are Perfex's
(T-4.1-07, T-4.1-25).

## Legacy screen

`application/views/admin/expenses/manage_categories.php` (the list page), with
`application/views/admin/expenses/expense_category.php` (the add and edit modal) and
`application/views/admin/tables/expenses_categories.php` (the table's columns). Only the flow and
the `_l()` keys were taken from them (a keys-only read made for the UI-SPEC); no text is quoted from
the views, and every legacy text comes from the legacy language packs.

## Legacy parity

Flow parity (FE-18): someone who used the Perfex screen does the same job in the same order.

| Perfex step (`manage_categories.php`, `expense_category.php`, `tables/expenses_categories.php`)                                                                                     | Node step (`ExpenseCategoriesList.tsx`, `ExpenseCategoriesForm.tsx`)                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup → Finance → Expenses Categories (`menu_helper.php`)                                                                                                                           | the same menu path opens `/setup/expense-categories`; the old URL `/admin/expenses/categories` redirects there (Nginx)                                                                                                              |
| the list: ID, Name, Description, Options; search; name ascending; paging                                                                                                            | the same columns in the same order, the server search over name and description, name ascending by default, the pager, and Export (CSV, Excel, PDF, Print) of ID, Name and Description                                              |
| New Category → the modal (Category Name required, Category Description) → Save → "added" alert → the table reloads                                                                  | New Category → `/new` with the same two fields → Create expense category → the save summary → "Expense category saved" → back to the list, which asks again                                                                         |
| the ID or Name link, or the pencil → the modal prefilled → Save → "updated" alert                                                                                                   | the row, the Name link or Edit → `/:id` prefilled → Save expense category → the save summary (the name change, "Category Description updated") → the toast → back to the exact list URL                                             |
| Export (CSV / Excel / PDF / Print) exports the rows the table has loaded; to export everything the user first picks "All" in the page-size menu (`main.js:3379`, `app.js:919-1022`) | Export, then CSV, Excel, PDF or Print, exports every row matching the search, filters and sort, with no page-size step (D-03, D-04); no PDF under Arabic, where Print covers it (D-09)                                              |
| the trash icon → the browser's confirm → GET delete → "deleted" or "is referenced" alert                                                                                            | Delete → a dialog naming the category; refused up front while expenses, accounting mappings or petty cash advances use it (one sentence each, nothing sent); otherwise "Expense category deleted", or the refusal inside the dialog |

**Kept on Perfex as recorded co-writers until their modules move (D-14, D-17).** Two Perfex flows add
expense categories and keep working unchanged:

- the expense form's inline "+" beside Category (`application/views/admin/expenses/expense.php`,
  posting to `/admin/expenses/category`), used by non-administrators too when Perfex's
  `staff_members_create_inline_expense_categories` option is on; it stays on Perfex until Expenses
  moves to Node;
- the timesheets requisition's "add expense category"
  (`modules/timesheets/controllers/Timesheets.php`, `add_expense_category`), until Timesheets moves
  to Node.

A category added through either shows on this list, because Node reads the table; it publishes no
Node event, which the lead accepted until those modules migrate (D-14). The form accepts what
Perfex's modal accepts (D-19): any character in a name of 1 to 191, a description with no cap,
shown as text.

## Dropped on purpose

- **Current-page-only export** (D-04): Perfex exports only the rows its table has loaded, so its
  users pick "All" in the page-size menu first (`main.js:3379`, `app.js:919-1022`). Export here
  always covers every row matching the search, filters and sort, with no page-size step.
- **Arabic PDF, parked** (D-09): the PDF's standard font cannot draw Arabic, so the Export menu
  offers no PDF under a right-to-left locale; Print keeps every language and the print dialog can
  save it as a PDF. A PDF whose rows hold such text is refused with that advice (D-24).
- **The totals footer row** (D-16): Perfex's export buttons repeat a table footer; no migrated list
  has one, so no export writes one.
- **Kept for later: the `show_table_export_button` setting** (D-02): whoever may view the list sees
  Export, as today; the setting moves with the settings module.
- The modal: pages instead, with a URL, the route guard and the error summary (D-04).
- The browser `confirm()`: the kit's `ConfirmDialog`, naming the category (3.2 D-25).
- A `?legacy=1` escape to Perfex's Setup screen: none; every read of the old list redirects (D-16).
- `tblactivity_log` lines: Node never writes Perfex's Activity Log; the domain event and the
  service log line are the record (D-08, D-18).
- Description sort: not a keyset key (D-41); ID and Name sort.
- HTML in descriptions: rendered as text with the line breaks kept, never as markup (T-4.1-25).
- The heading on edit is the record name, not "Edit Expense Category" (the 3.2 page-title rule);
  `edit_expense_category` is the document title.
- The delete refusal widened: also refused while accounting mappings or petty cash advances use the
  category, not only expenses (D-07, D-15).
- The alert wording: the kit's toasts and the plain-language refusal replace the legacy alert keys
  (`added_successfully`, `updated_successfully`, `deleted`, `problem_deleting`, `is_referenced`).
- Added on purpose: the save summary before every save (3.2 D-25.4).

## Routes

All three live in the shell's route group, so they get the sidebar and the topbar, and each is
`ADMIN_GATE` in `src/config/route-gates.ts`, declared above the `registry` marker block.

- `/setup/expense-categories` (`app/(shell)/setup/expense-categories/page.tsx`, `force-dynamic`):
  `pages/ExpenseCategoriesListPage.tsx`; the search, sort and page live in the URL (FE-15);
  `generateMetadata` → `expense_categories`.
- `/setup/expense-categories/new` (`new/page.tsx`): `pages/ExpenseCategoriesPage.tsx` with no id;
  `generateMetadata` → `new_expense_category`.
- `/setup/expense-categories/:id` (`[id]/page.tsx`): `notFound()` unless the id is a positive
  integer (the staff precedent), then the same page with the id; `generateMetadata` →
  `edit_expense_category`.
- `app/(shell)/setup/expense-categories/error.tsx`: the segment's error boundary (keys from
  `common`; never `error.message`).

## Data

`api/expense-categories.endpoints.ts`, `EXPENSE_CATEGORIES_ENDPOINTS`: the six calls erp-api
`src/v1/expense-categories` serves.

| call                                                                | used by                              | note                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/expense-categories?q&sort&limit&cursor`                | `ListPageTemplate`                   | BE-19 keyset grammar, `name` by default, `id` too; a row carries `expenseCount`, `mappingCount` and `pettyCashCount`                         |
| `GET /api/v1/expense-categories/export?format&q&sort&column&header` | `ListPageTemplate` (the Export menu) | CSV, Excel, PDF or the print rows; `id`, `name`, `description` (`EXPENSE_CATEGORIES_EXPORT_COLUMNS`) as `column`, one translated header each |
| `GET /api/v1/expense-categories/:id`                                | `useExpenseCategories`               | the record; a row opened from the list seeds it (D-35)                                                                                       |
| `POST /api/v1/expense-categories`                                   | `useSaveExpenseCategories().create`  | `{ name, description }`; never retried                                                                                                       |
| `PATCH /api/v1/expense-categories/:id`                              | `useSaveExpenseCategories().update`  | both fields, as Perfex's modal sends them; never retried                                                                                     |
| `DELETE /api/v1/expense-categories/:id`                             | `useDeleteExpenseCategory`           | 204; 409 `ERP-EXPENSECATEGORIES-0001` while in use; 404 `ERP-CORE-0004`; never retried                                                       |

- **The three usage counts are never shown as columns nor exported.** They exist so the delete
  dialog can refuse up front (`refusedCode`), one sentence per non-zero count; the api's live 409
  covers the race. After a 404 or a 409 the list pages ask again (UI-SPEC G8), so a reopened dialog
  names the counts and a deleted row is gone.
- After an edit opened from the list, the saved record is swapped into the cached list pages with the
  row's counts kept (no list request, D-36); after a create, or an edit of a permalink (which knows
  no counts), the list pages ask again.
- A 400 `ERP-VALIDATION-0001` carries `issues`, zod-parsed before `setError`; the api's text is never
  rendered (T-3-26). Only the name is an issue target: the api refuses no description the form
  sends.

## Messages

`messages/en.json`, namespace `expense-categories`, registered in `src/messages/index.ts`.

- **Legacy keys** keep their `english_lang.php` names, and their English text was taken from the
  legacy language packs, copied byte-identical (never retyped): `expense_categories`,
  `new_expense_category`, `edit_expense_category`, `id`, `name`, `dt_expense_description`,
  `expense_add_edit_name`, `expense_add_edit_description`, `expense_category_lowercase` (the noun of
  every verb + noun label).
- **Ours**, in snake_case: `noun_expense_categories` (the plural in the list's failure line),
  `section_details`, `empty_heading`, `empty_body`, `no_match_heading`, `no_match_body`,
  `enter_name`, `name_too_long`, `saved_toast`, `deleted_toast`, `edit_action_named`,
  `delete_action_named`, `delete_title`, `delete_body`, `in_use_expenses`,
  `in_use_accounting_mappings`, `in_use_petty_cash_advances` (ICU plurals on `count`, the number the
  formatted `countN`), `errors.ERP-CORE-0004`, `errors.ERP-EXPENSECATEGORIES-0001`.
- No `name_invalid_characters` and no `description_too_long` (D-19). The generator's doubled plural
  `noun_expense_categoriess` and its unused keys (`list_title`, `new_title`, `record_title`,
  `label`, `created_at`) are gone.

`messages/ar.json` holds the same key set, **unreviewed**: the legacy keys carry the English pack
text (no Arabic noun is claimed), ours a draft Arabic placeholder, until the customer's reviewer
signs the file off (a data change).

## How to run its tests

```bash
corepack yarn test src/features/expense-categories
```

DOM tests (`*.test.tsx`) opt into happy-dom on line 1 and render through `src/test/render.tsx`; the
network is a fake adapter on `http.defaults.adapter`. Every UI-SPEC state is a story export and an
`it`: the list's `Loading`, `Empty`, `NoResults`, `Error`, `Loaded`, `LongDescription`,
`DeleteConfirm`, `DeleteInUse`, `DeleteRefused`, `DeleteRetryable`, `Mobile` and `Rtl`; the form's
`Create`, `Edit`, `SaveSummary`, `Pending`, `FieldErrors`, `ServerError`, `NotFound`,
`SeededNotFound`, `Loading`, `Mobile` and `Rtl`. `corepack yarn check` audits every story with axe
at 1280 and 375 px (`check:a11y`).
