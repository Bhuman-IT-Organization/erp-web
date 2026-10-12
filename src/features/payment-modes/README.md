# payment-modes

## Purpose

Payment Modes of the modernised ERP: the list at `/setup/payment-modes`, the create form at
`/setup/payment-modes/new` and the record form at `/setup/payment-modes/:id`. It is the fourth list
of Wave 2a (W2A-04); it started as a copy of erp-docs 05-templates/frontend-feature, on the
recipe the Expense Categories pilot proved and Taxes and Cost Centers repeated. Node owns
`tblpayment_modes` since the Wave 2a register flip (plan 04.1-22), and every write goes through
erp-api `src/v1/payment-modes`.

**A Setup > Finance item** (D-32): Perfex puts Payment Modes under Setup > Finance, after
Currencies and before Expenses Categories (`application/helpers/menu_helper.php:503-508`). The Node
item stays exactly there (`src/config/navigation.ts`, `payment-modes`); only its address moved under
`/setup` (D-05). On all three routes the sidebar opens the Setup panel with Finance open and Payment
Modes marked, and the breadcrumb comes from the menu tree (`activeTrailOf`).

**Administrators only** (D-06, D-32), as Perfex's screen was (`Paymentmodes.php:11`). The three
routes are `ADMIN_GATE` in `src/config/route-gates.ts`, the mirror of `@erp/contracts`'
`ROUTE_GATES` (kept in sync with erp-api's `packages/contracts` by hand), the menu item reads the
same gate through `navGateOf`, and both screens sit behind `withAuth(withPermission(...))`: a
non-administrator sees the kit's "no access" state once `/me` has answered, and the screen asks the
api for nothing. The page gate is presentation only: the api refuses every handler, the switch
included, to anyone but an administrator with 403 `ERP-AUTH-0005` regardless.

**Names and descriptions are text.** Node accepts what Perfex accepts (D-34): a trimmed name of 1
to 100 characters, every character allowed, `<` and `>` included, a name another mode already
holds, and any description. Both are rendered as React text only, never as raw HTML, in the list,
the delete dialog, the form, its title and the breadcrumb; a description keeps its line breaks
through CSS (T-4.1-124).

## Legacy screen

`application/views/admin/paymentmodes/manage.php` (the list page: New Payment Mode at :10, the
announcement line at :16, the ID, Payment Mode Name, Bank Accounts / Description, Active and
Options columns at :19-23, the default order by the name at :35), with
`application/views/admin/paymentmodes/paymentmode.php` (the add and edit modal: the two headings at
:10 and :12, the name at :20, the description with its tooltip at :21, Active at :25, Show on PDF at
:30, Selected by default at :35, Invoices Only at :41, Expenses Only at :46, Close and Save at :54
and :56, the name required at :67, the two "only" boxes disabling each other at :70-82, Active
ticked for a new mode at :93), `application/views/admin/tables/payment_modes.php` (the Active switch
and its hidden export word at :33-37), `application/controllers/admin/Paymentmodes.php` (the
administrator check at :11, the list at :22, the delete's in-use check at :63),
`application/models/Payment_modes_model.php` (the description stored with `nl2br_save_html` at :108
and :150, the delete's two-column check at :183-184, the activity-log lines at :119, :169, :193,
:271 and :294) and `application/helpers/menu_helper.php:503-508` (the Setup > Finance item). Only
the flow, the `_l()` keys and line numbers were taken from them; no text is quoted from the views,
and every legacy text comes from the legacy language packs.

## Legacy parity

Flow parity (FE-18, D-29): someone who used the Perfex screen does the same job in the same order,
with the same business outcome.

| Perfex step (`paymentmodes/manage.php`, `paymentmode.php`, `Paymentmodes.php`)                                               | Node step (`PaymentModesList.tsx`, `PaymentModesForm.tsx`)                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup > Finance > Payment Modes, between Currencies and Expenses Categories, administrators only (`menu_helper.php:503-508`) | the same Setup > Finance item in the same place, administrators only (D-32); it opens `/setup/payment-modes` and stays marked on the list, `/new` and `/:id`                                                                                                           |
| the announcement line above the table (payment modes are the offline ones; gateways are configured in Settings)              | the same line, Perfex's own words, as an information note above the table                                                                                                                                                                                              |
| the list: ID, Payment Mode Name, Bank Accounts / Description, Active, Options; the name ascending; search; paging            | the same columns in the same order, the name ascending by default with no arrow (G6), the server search, the pager                                                                                                                                                     |
| the Active switch saves at once (`change_payment_mode_status`)                                                               | the same switch saves at once with one click, no confirmation, and says so in a toast; a failure puts it back and says "Not saved" (D-34)                                                                                                                              |
| New Payment Mode opens the modal (the seven fields; Active ticked) > Save > the "added" alert > the list                     | New Payment Mode opens the `/new` page (D-04) with the same seven fields and the same defaults > Create payment mode > the save summary > "Payment mode saved" > back to the list                                                                                      |
| the name link or the edit link opens the modal prefilled > Save > the "updated" alert > the list                             | the row, the name link or Edit opens `/:id` prefilled > Save payment mode > the save summary (one line per changed field) > the toast > back to the exact list URL                                                                                                     |
| the form: Invoices Only and Expenses Only disable each other while one is ticked                                             | the same rule, computed from the form's values (a record saved with both ticked shows both enabled, so either can be cleared)                                                                                                                                          |
| an unticked box saves 0; a duplicate name is accepted; the description is stored with `nl2br_save_html`                      | the same: every box is sent, an unticked one saves 0; a duplicate name is accepted; the api stores the description as Perfex does, so Perfex's PDFs and screens show it unchanged (D-34)                                                                               |
| Perfex's Export buttons over the table                                                                                       | the kit's Export menu: CSV, Excel, PDF or Print of ID, Name, Description and Active for every row matching the search and sort; no PDF under Arabic, where Print covers it (D-09)                                                                                      |
| the delete link > the browser's confirm > refused while invoice payments or expenses use it, else deleted > an alert         | Delete > a dialog naming the mode; refused up front while any of eight transactional groups uses it, or when it is the credit expense mode (nothing sent; the refusal points to the Active switch); otherwise "Payment mode deleted", or the refusal inside the dialog |

## Dropped on purpose

Each change, with its reason, for the lead's checkpoint (D-29: only a change to a business outcome
goes back to the leads; each lead decision is marked).

- **A delete is refused while any of eight transactional columns uses the mode** (D-33). **A lead
  decision on a business outcome**: Perfex checked invoice payments and expenses only
  (`Payment_modes_model.php:183-184`); Node also counts credit note refunds, purchase invoice and
  purchase order payments, debit note refunds, fixed equipment refunds and order return refunds,
  each found at runtime, and the dialog names each non-zero one. The accounting mappings and the
  allowed lists are configuration and do not block it, as in Perfex. Switching the mode off is the
  way to retire one in use.
- **The credit expense mode cannot be deleted** (D-37). **A lead decision**: the client's expense
  code reads `expense_credit_payment_mode` to mark a credit expense; Node refuses deleting the mode
  it names, and switching it off stays allowed.
- **The show-to-client toggle** (D-35): no Perfex screen calls `change_payment_mode_show_to_client_status`,
  and it writes a column no migration creates and the local schema lacks, so it never worked; Node
  has no such control and its address is refused at Nginx.
- **No activity-log line** (D-36, a release note): Perfex wrote one on every add, edit, delete and
  switch; Node never writes Perfex's Activity Log, and the domain event and the service log line are
  the record.
- **The description shows as text with its line breaks** (proposed by the orchestrator 2026-10-03,
  approved by Zaqi (lead) 2026-10-03): Perfex rendered the description's HTML; Node shows it as
  plain text with its line breaks, a simplification for safety. The stored value is unchanged.
- **The name is trimmed** (D-29, proposed by the orchestrator 2026-10-03, approved by Zaqi (lead)
  2026-10-03): Perfex saved the posted name untrimmed; a recorded simplification.
- **Invoices Only and Expenses Only may both be saved** (D-29, proposed by the orchestrator
  2026-10-03, approved by Zaqi (lead) 2026-10-03): Perfex's server accepts both, so the api does
  too, while the form disables the other box as Perfex's form does.
- **Line breaks kept on reopening** (a Perfex defect not carried over): Perfex's edit modal turned
  each line break of the description into a space when it reopened a mode; Node keeps the line
  breaks, and the stored value round-trips unchanged.
- **The search matches the name, the description and an exact id** (a simplification): Perfex's
  table searched every cell's text.
- **The description does not sort** (a long text column).
- **Online payment gateways are not listed** (D-32), as in Perfex's list: the table holds the
  offline modes, and the announcement line says where gateways live.
- **Arabic PDF, parked** (D-09): the PDF's standard font cannot draw Arabic, so the Export menu
  offers no PDF under a right-to-left locale; Print keeps every language.
- The modal became the `/new` and `/:id` pages (D-04), the success alert a toast and a return to
  the list, Perfex's Export buttons the kit's four-format menu, and the delete link with the
  browser's confirm the kit's `ConfirmDialog`, naming the mode (3.2 D-25).
- The heading on edit is the record name, not "Edit Payment Mode" (the 3.2 page-title rule);
  `payment_mode_edit_heading` is the document title.
- Added on purpose: the save summary before every save (3.2 D-25.4).

## Routes

All three live in the shell's route group, so they get the sidebar and the topbar, and each is
`ADMIN_GATE` in `src/config/route-gates.ts`, declared above the `registry` marker block.
`proxy.ts`'s `/setup/:path*` matcher sends an anonymous visitor to `/login` on all three.

- `/setup/payment-modes` (`app/(shell)/setup/payment-modes/page.tsx`, `force-dynamic`):
  `pages/PaymentModesListPage.tsx`; the search, sort and page live in the URL (FE-15);
  `generateMetadata` > `payment_modes`.
- `/setup/payment-modes/new` (`new/page.tsx`): `pages/PaymentModesPage.tsx` with no id;
  `generateMetadata` > `payment_mode_add_heading`.
- `/setup/payment-modes/:id` (`[id]/page.tsx`): `notFound()` unless the id is a positive integer,
  then the same page with `String(Number(id))`; `generateMetadata` > `payment_mode_edit_heading`.
- `app/(shell)/setup/payment-modes/error.tsx`: the segment's error boundary (keys from `common`;
  never `error.message`).

## Data

`api/payment-modes.endpoints.ts`, `PAYMENT_MODES_ENDPOINTS`: the seven calls erp-api
`src/v1/payment-modes` serves.

| call                                                           | used by                              | note                                                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/payment-modes?q&sort&limit&cursor`                | `ListPageTemplate`                   | BE-19 keyset grammar, the name ascending by default, `id`, `name` and `active` sort; a row is the whole record                                                              |
| `GET /api/v1/payment-modes/export?format&q&sort&column&header` | `ListPageTemplate` (the Export menu) | CSV, Excel, PDF or the print rows; `id`, `name`, `description`, `active` (`PAYMENT_MODES_EXPORT_COLUMNS`), one translated header each; Active is the kit's yes and no words |
| `GET /api/v1/payment-modes/:id`                                | `usePaymentModes`                    | the record; a row opened from the list seeds it (D-35)                                                                                                                      |
| `POST /api/v1/payment-modes`                                   | `useSavePaymentModes().create`       | the seven fields; a name another mode holds is accepted; never retried                                                                                                      |
| `PATCH /api/v1/payment-modes/:id`                              | `useSavePaymentModes().update`       | the seven fields; 404 `ERP-CORE-0004` when it was deleted meanwhile, shown inside the save summary; never retried                                                           |
| `PATCH /api/v1/payment-modes/:id/active`                       | `usePaymentModeActive`               | `{ active }`, answering `{ id, active }`; the row is swapped in place; never retried                                                                                        |
| `DELETE /api/v1/payment-modes/:id`                             | `useDeletePaymentMode`               | 204; 409 `ERP-PAYMENTMODES-0002` for the credit expense mode, `ERP-PAYMENTMODES-0001` while in use; 404 `ERP-CORE-0004`; never retried                                      |

- A row and a record are `{ id, name, description, active, showOnPdf, selectedByDefault,
invoicesOnly, expensesOnly, usage, isCreditExpenseMode }`: the description is the api's read form
  (`''` for NULL), shown as text.
- **The usage and the credit-expense flag are never a column nor exported.** The eight groups
  (invoice payments, expenses, credit note refunds, purchase invoice payments, purchase order
  payments, debit note refunds, fixed equipment refunds, order return refunds) and the flag let the
  delete dialog refuse up front (`refusalOf`: the credit expense mode first, as the api checks it),
  one line per non-zero group, in that order. The api's live 409 covers the race. After a 404 or a
  409 on delete the list pages ask again (UI-SPEC G8).
- After an edit opened from the list, the saved record is swapped into the cached list pages (no
  list request, D-36); after a create, or an edit of a permalink, the list pages ask again.
- A 400 `ERP-VALIDATION-0001` carries `issues`, zod-parsed before `setError`; the api's text is
  never rendered (T-3-26). `name` is the one issue target: the description takes any text and a box
  any boolean.

## Messages

`messages/en.json`, namespace `payment-modes`, registered in `src/messages/index.ts`.

- **Legacy keys** keep their `english_lang.php` names, and their English text was taken from the
  legacy language packs, copied byte-identical (never retyped): `payment_modes`,
  `new_payment_mode`, `payment_modes_add_edit_announcement`, `id`, `payment_modes_dt_name`,
  `payment_modes_dt_description`, `payment_modes_dt_active`, `payment_mode_add_heading`,
  `payment_mode_edit_heading`, `payment_mode_add_edit_name`, `payment_mode_add_edit_description`,
  `payment_mode_add_edit_description_tooltip`, `payment_mode_add_edit_active`,
  `show_on_invoice_on_pdf` (its `{0}` filled with the description's label, as Perfex does),
  `settings_paymentmethod_default_selected_on_invoice`, `payment_mode_invoices_only`,
  `payment_mode_expenses_only`, `payment_mode_lowercase` (the noun of every verb + noun label),
  `settings_yes` and `settings_no` (a box's values in the save summary).
- **Ours**, in snake_case: `noun_payment_modes` (the plural in the list's failure line),
  `section_details`, `empty_heading`, `empty_body`, `no_match_heading`, `no_match_body`,
  `enter_name`, `name_too_long`, `saved_toast`, `deleted_toast`, `activated_toast`,
  `deactivated_toast`, `toggle_active`, `active_not_saved`, `edit_action_named`,
  `delete_action_named`, `delete_title`, `delete_body`, the eight `in_use_*` lines (ICU plurals on
  `count`, the number the formatted `countN`), `errors.ERP-CORE-0004`, `errors.ERP-PAYMENTMODES-0001`
  and `errors.ERP-PAYMENTMODES-0002`.
- **Legacy keys not used**: `options` (the actions column header is visually hidden), `close` and
  `submit` (verb + noun buttons), `payment_mode` (title case; the lowercase noun is the label noun),
  `is_referenced` (the plain-words refusal replaces it), `is_active_export` and
  `is_not_active_export` (the kit's own yes and no export words), `acs_sales_payment_modes_submenu`
  (the shell's menu label). The generator's `list_title`, `new_title`, `record_title`,
  `noun_payment_mode`, `name`, `label` and `created_at` gave way to the legacy keys.

`messages/ar.json` holds the same key set, **unreviewed**: the legacy keys carry the English pack
text (no Arabic noun is claimed), ours a draft Arabic placeholder, until the customer's reviewer
signs the file off (a data change).

## How to run its tests

```bash
corepack yarn test src/features/payment-modes
```

DOM tests (`*.test.tsx`) opt into happy-dom on line 1 and render through `src/test/render.tsx`; the
network is a fake adapter on `http.defaults.adapter`. Every UI-SPEC state is a story export and an
`it`: the list's `Loading`, `Empty`, `NoResults`, `Error`, `Loaded`, `DeleteConfirm`,
`DeleteInUse`, `DeleteCreditMode`, `DeleteRefused`, `DeleteRetryable`, `SwitchFailed`, `Mobile` and
`Rtl`; the form's `Default`, `Edit`, `SaveSummary`, `Loading`, `Mobile`, `Pending`, `FieldErrors`,
`ServerError`, `SaveRefusedDeleted`, `EditFromList`, `NotFound`, `SeededNotFound`, `ExclusiveBoxes`
and `Rtl`. `corepack yarn check` audits every story with axe at 1280 and 375 px (`check:a11y`).
