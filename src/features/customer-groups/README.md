# customer-groups

## Purpose

Customer Groups provides the list at `/setup/customer-groups`, the create form at
`/setup/customer-groups/new` and the edit form at `/setup/customer-groups/:id`. It owns the
customer-group screen and uses the `src/v1/customer-groups` API; it does not own customer data.

**Still a Main Menu item** (D-25): Perfex puts Customer Groups in the main sidebar at position 31,
after the position-30 band and before Tasks, not under Setup. The Node item stays exactly there
(`src/config/navigation.ts`, `customer-groups`, icon `sitemap` through the Icon registry); only its
address moved under `/setup` (D-05). On all three routes the sidebar opens the Main Menu with Cost
Centers marked, and the breadcrumb comes from the menu tree (`activeTrailOf`).

**Administrators only** (D-06, D-26). Perfex's menu item was administrator-only, but its controller
let any signed-in staff member list, add, edit and delete Customer Groups by address. Node closes that:
the three routes are `ADMIN_GATE` in `src/config/route-gates.ts`, the mirror of `@erp/contracts`'
`ROUTE_GATES` (kept in sync with erp-api's `packages/contracts` by hand), the menu item reads the
same gate through `navGateOf`, and both screens sit behind `withAuth(withPermission(...))`: a
non-administrator sees the kit's "no access" state once `/me` has answered, and the screen asks the
api for nothing. The page gate is presentation only: the api refuses every handler to anyone but an
administrator with 403 `ERP-AUTH-0005` regardless.

**Names are text.** Node accepts what Perfex accepts (D-29): a trimmed name of 1 to 255 characters,
every character allowed, `<` and `>` included, and a name another Customer Group already holds. A
name is rendered as React text only, never as raw HTML, in the list cell, the delete dialog, the
form title and the breadcrumb (T-4.1-91).

## Legacy screen

`application/views/admin/customer_groups/manage.php` (the list page: its New Customer Group button,
the table's Customer Group Name and Options columns, the edit and delete links, with the create and edit
page: Customer Group Name required at :15, Cancel and Save at :18-19),
`application/controllers/admin/Cost_centers.php` (the list :15, create :20-30, edit :34-44, delete
:52), `application/models/Cost_centers_model.php` (`add` :22-28 writing `created_by` :24 and
`datecreated` :25, `update` :30-35, `delete` :37-42) and `application/helpers/menu_helper.php:155-163`
(the administrator-only Main Menu item). Only the flow, the `_l()` keys and line numbers were taken
from them; no text is quoted from the views, and every legacy text comes from the legacy language
packs.

## Legacy parity

Flow parity (FE-18, D-29): someone who used the Perfex screen does the same job in the same order,
with the same business outcome.

| Perfex customer-groups screen (`customer_groups/manage.php`, `form.php`, `Customer_groups.php`)                            | Node step (`CustomerGroupsList.tsx`, `CustomerGroupsForm.tsx`)                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main Menu > Customer Groups, position 31, administrators only (`menu_helper.php:155-163`)                                  | the same Main Menu item at the same position, administrators only (D-25); it opens `/setup/customer-groups` and stays marked on the list, `/new` and `/:id`                                              |
| the list: Customer Group Name and Options; search; paging                                                                  | the same Name-only list, server search, pager and shared Export menu                                                                                                                                     |
| Add Customer Group opens the create PAGE (Customer Group Name required) > Save > the "added" alert > back to the list      | Add Customer Group opens the `/new` page (Perfex already used pages, so D-04 changes nothing) with the same field > Create Customer Group > the save summary > "Customer Group saved" > back to the list |
| the name link or the edit link opens the edit page prefilled > Save > the "updated" alert > back to the list               | the row, the Customer Group Name link or Edit opens `/:id` prefilled > Save Customer Group > the save summary ("Customer Group Name: old > new") > the toast > back to the exact list URL                |
| create writes the name, `created_by` (the signed-in staff member) and `datecreated` (the server time); edit saves the name | the same: the api writes the name, `created_by` and `datecreated` on create, as Perfex does, and only the name on edit (D-31)                                                                            |
| Perfex's Export buttons over the table                                                                                     | the kit's Export menu exports Name for every row matching the search and sort                                                                                                                            |
| the delete link > the browser's confirm > GET delete > the "deleted" alert                                                 | Delete > a dialog naming the Customer Group; refused up front while anything uses it (one line per use, nothing sent); otherwise "Customer Group deleted", or the refusal inside the dialog              |

## Dropped on purpose

Each change, with its reason, for the lead's checkpoint (D-29: only a change to a business outcome
goes back to the leads; the one that is a lead decision is marked).

- **A delete while the Customer Group is in use is refused and names each use** (D-07, D-28). **Lead
  decision of 2026-09-29**, the one business-outcome change: Perfex deleted the row and left the
  purchase requests, orders and quotations, shipping charges, expenses and assets that pointed at
  it naming nothing. Node counts each of the six (the columns found at runtime, so the expense and
  shipping-charge columns count the moment their slice adds them) and the dialog names each
  non-zero one.
- **Administrators only** (D-26, a security fix): Perfex's screen was open to any signed-in staff
  member by address, though only administrators saw the menu item; Node's routes and api are
  administrator-only.
- **Only the name is saved** (D-26, D-31): Perfex saved every posted field; Node saves the name,
  and writes `created_by` and `datecreated` on create as Perfex writes them. The business outcome is
  unchanged.
- **The search matches the name and an exact id** (a simplification): Perfex's table searched every
  cell's text, the date included; Node searches the name as a substring and the id exactly.
- **Unchanged, recorded so nobody expects otherwise:** a rename leaves a fixed asset's stored cost
  centre text naming the old name, exactly as Perfex does (D-29); duplicate names are accepted, as
  in Perfex.
- **Perfex's activity-log lines**: Node never writes Perfex's Activity Log; the domain event and the
  service log line are the record (D-18).
- **Arabic PDF, parked** (D-09): the PDF's standard font cannot draw Arabic, so the Export menu
  offers no PDF under a right-to-left locale; Print keeps every language.
- The browser `confirm()`: the kit's `ConfirmDialog`, naming the Customer Group (3.2 D-25).
- The heading on edit is the record name, not "Edit Customer Group" (the 3.2 page-title rule);
  `customer_group_edit_heading` is the document title.
- The alert wording: the kit's toasts and the plain-language refusal replace the legacy alerts, and
  the verb + noun buttons replace `cancel` and `submit`.
- Added on purpose: the save summary before every save (3.2 D-25.4).

## Routes

All three live in the shell's route group, so they get the sidebar and the topbar, and each is
`ADMIN_GATE` in `src/config/route-gates.ts`, declared above the `registry` marker block.
`proxy.ts`'s `/setup/:path*` matcher sends an anonymous visitor to `/login` on all three.

- `/setup/customer-groups` (`app/(shell)/setup/customer-groups/page.tsx`, `force-dynamic`):
  `pages/CustomerGroupsListPage.tsx`; the search, sort and page live in the URL (FE-15);
  `generateMetadata` > `customer_groups`.
- `/setup/customer-groups/new` (`new/page.tsx`): `pages/CustomerGroupsPage.tsx` with no id;
  `generateMetadata` > `customer_group_add_heading`.
- `/setup/customer-groups/:id` (`[id]/page.tsx`): `notFound()` unless the id is a positive integer,
  then the same page with `String(Number(id))`; `generateMetadata` > `customer_group_edit_heading`.
- `app/(shell)/setup/customer-groups/error.tsx`: the segment's error boundary (keys from `common`;
  never `error.message`).

## Data

`api/customer-groups.endpoints.ts`, `CUSTOMER_GROUPS_ENDPOINTS`: the six calls erp-api
`src/v1/customer-groups` serves.

| call                                                             | used by                              | note                                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/customer-groups?q&sort&limit&cursor`                | `ListPageTemplate`                   | Server list state; rows contain `{ id, name }`                                                              |
| `GET /api/v1/customer-groups/export?format&q&sort&column&header` | `ListPageTemplate` (the Export menu) | CSV, Excel, PDF or Print of the translated Name column                                                      |
| `GET /api/v1/customer-groups/:id`                                | `useCustomerGroups`                  | the record; a row opened from the list seeds it (D-35)                                                      |
| `POST /api/v1/customer-groups`                                   | `useSaveCustomerGroups().create`     | `{ name }`; a name another Customer Group holds is accepted; never retried                                  |
| `PATCH /api/v1/customer-groups/:id`                              | `useSaveCustomerGroups().update`     | `{ name }`; 404 `ERP-CORE-0004` when it was deleted meanwhile, shown inside the save summary; never retried |
| `DELETE /api/v1/customer-groups/:id`                             | `useDeleteCustomerGroup`             | 204; 409 `ERP-CUSTOMERGROUPS-0001` while customers remain; 404 `ERP-CORE-0004`; never retried               |

- **Name is the only visible and exported field.** The API's live 409 is shown in the delete dialog,
  and the list is revalidated after a stale 404 or in-use response.
- After an edit opened from the list, the saved record is swapped into the cached list pages (no
  list request, D-36); after a create, or an edit of a permalink, the list pages ask again.
- A 400 `ERP-VALIDATION-0001` carries `issues`, zod-parsed before `setError`; the api's text is
  never rendered (T-3-26). `name` is the one issue target.

## Messages

`messages/en.json`, namespace `customer-groups`, registered in `src/messages/index.ts`.

- **Perfex keys** are `customer_groups`, `new_customer_group`, `customer_group_add_heading`,
  `customer_group_edit_heading`, `customer_group_lowercase`, `section_details`,
  `empty_heading`, `empty_body`, `no_match_heading`, `no_match_body`, `enter_name`,
  `name_too_long`, `saved_toast`, `deleted_toast`, `edit_action_named`, `delete_action_named`,
  `delete_title`, `delete_body`, the six `in_use_*` lines (ICU plurals on `count`, the number the
  formatted `countN`), `errors.ERP-CORE-0004` and `errors.ERP-CUSTOMERGROUPS-0001`.
- The shared verb+noun buttons and hidden actions header come from `common`; the screen has no ID or
  date column.

`messages/ar.json` holds the same key set, **unreviewed**: the legacy keys carry the English pack
text (no Arabic noun is claimed), ours a draft Arabic placeholder, until the customer's reviewer
signs the file off (a data change).

## How to run its tests

```bash
corepack yarn test src/features/customer-groups
```

DOM tests (`*.test.tsx`) opt into happy-dom on line 1 and render through `src/test/render.tsx`; the
network is a fake adapter on `http.defaults.adapter`. Every UI-SPEC state is a story export and an
`it`: the list's `Loading`, `Empty`, `NoResults`, `Error`, `Loaded`, `DeleteConfirm`,
`DeleteInUse`, `DeleteRefused`, `DeleteRetryable`, `Mobile` and `Rtl`; the form's `Default`,
`Edit`, `SaveSummary`, `Loading`, `Mobile`, `Pending`, `FieldErrors`, `ServerError`,
`SaveRefusedDeleted`, `EditFromList`, `NotFound`, `SeededNotFound` and `Rtl`. `corepack yarn check`
audits every story with axe at 1280 and 375 px (`check:a11y`).
