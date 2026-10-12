# staff

## Purpose

The Setup → Staff and Setup → Roles screens of the modernised ERP: the staff list at `/setup/staff`, the
member form at `/setup/staff/new` and `/setup/staff/:id`, the roles list at `/setup/roles` and the role form at
`/setup/roles/new` and `/setup/roles/:id`. They are the screens
that let Node own permissions — `tblstaff`, `tblstaff_permissions`, `tblroles` and
`tblstaff_departments` are Node's since the Wave 1 register flip, and every write goes through
`erp-api src/v1/identity`, the only module allowed to make one (ADR-0034 decision 1).

One feature serves all four screens of W1-06, because one backend module serves them: `v1/identity`.
The message namespace, `api/staff.endpoints.ts` and `schemas/staff.schema.ts` are shared, not
copied. Both forms pick permissions with the kit's `PermissionPicker`: the member form role-first
(plan 03.2-16), the role form straight in the editable accordion, because a role IS the template
(plan 03.2-18).

**Granting is admin-only, and this feature says so before the server does.** Creating or changing a
role, and changing any member's role, permission set or `administrator` flag, require
`tblstaff.admin = 1` — never a permission code, because a code can be handed out by the mechanism it
protects (ADR-0034 decision 2). The flag is read from the session's `/api/v1/auth/me`
(`hooks/use-actor.ts`), never from `usePermissions()`. For an actor without it the member form states
the refusal ONCE at the top of its Access section (UAT 12), the role select is disabled, the picker is
read-only but reviewable (focusable, `aria-readonly`), there is no Administrator checkbox, and the
saved body carries no granting field at all.

**The two ROLES screens go further: they are administrator-only end to end** (migration-lead decision
2026-09-24). A role IS a permission template, so `GET /api/v1/identity/roles` and
`GET .../roles/:id` now assert the administrator flag too and declare no permission code at all —
`staff.roles.view` gates nothing on them. `/setup/roles`, `/setup/roles/new` and `/setup/roles/:id` are therefore gated
`'admin'` in `ROUTE_GATES` (`src/config/route-gates.ts`, the mirror of `@erp/contracts`' single
declaration), and both roles screens sit behind `withAuth(withPermission(…))` on that gate: a
non-administrator sees the kit's "You don't have access to this page" once, after `/me` has answered,
and the screen asks the api for nothing. A read-only roles list would be an empty error page, not a
courtesy.

**The staff list is the kit's `ListPageTemplate`** (plan 03.2-15, UIK-04): the template owns the URL
state, the server search, the sort, the pager, the export and every list state; `StaffList.tsx`
declares the columns, the photo, the brand View, the Active switch and the create gate, and
`GuardedStaffList` puts it behind `withAuth(withPermission(…))` on `ROUTE_GATES['/setup/staff']`. The
roles list is the same template (plan 03.2-18): `RolesList.tsx` declares the Role Name column, the
labelled Edit and Delete and the delete's confirmation, and `GuardedRolesList` guards it.

**The staff list's Role column is NOT a roles read.** `views/admin/tables/staff.php` shows
`tblroles.name` to anyone who may view staff, so the column is part of the 1:1 list — but the roles
list it would have to be joined against is administrator-only. The api therefore carries `roleName`
on every member list row (`identity`'s README pins it), `StaffList` renders it directly, and the
screen makes ONE request. `useRoleOptions` is the member form's select and nothing else; "No role"
(`staff.no_role`) in that cell means only what Perfex's blank cell means: this member holds no role.

## Legacy screen

`application/views/admin/staff/manage.php`

Also rebuilt from `application/views/admin/tables/staff.php` (the list's columns and row actions),
`application/views/admin/staff/member.php` (the member form and its two tab levels),
`application/views/admin/staff/permissions.php` (the capability grid),
`application/views/admin/roles/manage.php` + `application/views/admin/tables/roles.php` (the roles
list) and `application/views/admin/roles/role.php` (the role form and its two-column layout). Six
views, one feature. Only class names and `_l()` keys were read from them; no value from the legacy
tree is copied anywhere, and the English text of every legacy key comes from the legacy language
packs.

## Legacy parity

### The list (`/setup/staff`): flow parity (FE-18, plan 03.2-15)

Someone who used Perfex's staff table does the same job in the same order: find a member, open
them, turn their access on or off, export the list. The layout is ours (the kit's list page).

| Legacy step or action (`manage.php` + `tables/staff.php`)                                                                                                                                              | Our step or action (`StaffList.tsx` on `ListPageTemplate`)                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup → Staff opens the table                                                                                                                                                                          | the sidebar's Staff opens `/setup/staff`: a list skeleton until the session and `/me` answer, then the table (UIK-03, D-39)                                                                                                                                                                 |
| `_l('new_staff')` above the table                                                                                                                                                                      | "New Staff Member", last in the toolbar, shown only with `staff.members.create` (hidden, not disabled)                                                                                                                                                                                      |
| the DataTables search box                                                                                                                                                                              | the search box asks the api as you type (300 ms, Enter at once), over every row, never the page on screen (D-19)                                                                                                                                                                            |
| the DataTables pager and length menu                                                                                                                                                                   | Previous / Next, "Showing 1–25 of N" and Rows per page 25 / 50 / 100 (remembered per user), pinned to the bottom (D-17)                                                                                                                                                                     |
| click a column header to sort                                                                                                                                                                          | Full Name, Email and Active sort (the api's keyset keys); Role and Last login do not (D-41, see the drops)                                                                                                                                                                                  |
| the columns: photo and name, e-mail, role, last login, active                                                                                                                                          | the same five, the photo its own 40 px column that enlarges in place (D-23); the e-mail in `<bdi>`                                                                                                                                                                                          |
| the name links to the member                                                                                                                                                                           | the name is the row's link, and a click anywhere on the row opens the member; the list's URL and scroll are kept for the way back (D-28)                                                                                                                                                    |
| `row-options` → `_l('view')`                                                                                                                                                                           | "View", a labelled button in the brand colour named "View <name>" (finding 4, D-07); a kebab below `md`                                                                                                                                                                                     |
| the Active `onoffswitch` (applies at once)                                                                                                                                                             | the same switch: turning a member ON applies at once ("Staff member activated"); turning one OFF asks first (see the drops)                                                                                                                                                                 |
| the DataTables export buttons (CSV, Excel, PDF, Print) export the rows the table has loaded; to export everything the user first picks "All" in the page-size menu (`main.js:3379`, `app.js:919-1022`) | Export, then CSV, Excel, PDF or Print, exports every member matching the search and sort, headers in the user's language, with no page-size step (D-03, D-04, D-26, D-42); each format's cap is told on its item before the click (D-06); no PDF under Arabic, where Print covers it (D-09) |
| an empty table                                                                                                                                                                                         | "No staff members yet" with the create button, or "No staff members match “…”" with Clear search (D-30)                                                                                                                                                                                     |

### The member form (`/setup/staff/new`, `/setup/staff/:id`): flow parity (FE-18, plan 03.2-16)

Someone who used Perfex's member page does the same job in the same order: open a member (or "New
Staff Member"), change the profile, the role, the permissions and the departments, save once. The
layout is ours (the kit's `SchemaForm`).

| Legacy step or action (`member.php` + `permissions.php`)                                                                              | Our step or action (`StaffMemberForm.tsx` on `SchemaForm`)                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new_staff` opens the empty member page                                                                                               | "New Staff Member" opens `/setup/staff/new`: the same fields, empty, the password required                                                                                                                                                                |
| a name in the staff table opens the member page                                                                                       | a row opens `/setup/staff/:id`: the row's name, badge and profile fields at once, the rest as the record arrives (D-35)                                                                                                                                   |
| the Profile tab: names, e-mail, phone, hourly rate, language, signature, social links                                                 | the Profile section, the same fields; the signature, Facebook, LinkedIn and Skype behind "More details" (finding 7)                                                                                                                                       |
| the Permissions tab: the role select, then the capability grid it pre-ticks (`role_changed`)                                          | the Access section: the Role select, then the role-first picker — choosing a role fills in its template, "Customise these permissions" opens the grouped accordion                                                                                        |
| a member whose role grew after assignment silently lags it (the data review's nine of 28)                                             | an addition: "… is missing N permissions the … role grants [and has M the role does not]" with Re-apply role: one click, no dialog of its own; the save summary confirms it (lead 2026-09-26)                                                             |
| the role select's blank option (`render_select`'s `$include_blank`): a member may hold no role                                        | the same: "Nothing selected" (`dropdown_non_selected_tex`) saves no role; the picker then opens straight into the accordion, with no role to start from                                                                                                   |
| the departments checkboxes, `administrator` and `is_not_staff`                                                                        | the same, in Access; the kit picks the departments control by count (D-24), the two flags are checkboxes applied on save                                                                                                                                  |
| the password box and its note (edit)                                                                                                  | the same box with a named reveal (finding 9) and the same note                                                                                                                                                                                            |
| the outer tabs Notes, Timesheets, Projects, Face registration                                                                         | the "In Perfex" section: the same four entry points as plain links out, each with the external glyph and "opens in Perfex"; staff delete links out beside them                                                                                            |
| `_l('submit')` saves profile, departments and permissions                                                                             | "Save staff member" / "Create staff member": ONE request carrying all three (brief §9.1), after a summary of what changes (D-25.4)                                                                                                                        |
| after the save Perfex reloads the member page                                                                                         | "Staff member saved", and back on the list exactly where the member left it — page, sort, search and scroll (D-28)                                                                                                                                        |
| `member()` for a member Perfex cannot find: `blank_page('Staff Member Not Found')`, a red notice with only the admin menu to leave by | 'That staff member no longer exists' where the form would be, no Retry, and 'Back to list' to the list the member came from (else `/setup/staff`); any other failed read offers it too, beside Retry when retrying can help (lead 2026-09-27, D-28, D-31) |

### The roles list (`/setup/roles`): flow parity (FE-18, plan 03.2-18)

Someone who used Perfex's roles table does the same job in the same order: find a role, open it,
delete one nobody holds, add a new one. The layout is ours (the kit's list page).

| Legacy step or action (`roles/manage.php` + `tables/roles.php`)                                                                                                    | Our step or action (`RolesList.tsx` on `ListPageTemplate`)                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup → Roles opens the table                                                                                                                                      | the sidebar's Roles opens `/setup/roles`: a list skeleton until the session and `/me` answer; an administrator gets the table (UIK-03)                                                                                                                                                                                                                                      |
| `_l('new_role')` above the table                                                                                                                                   | "New Role", last in the toolbar                                                                                                                                                                                                                                                                                                                                             |
| the DataTables search box, pager and length menu                                                                                                                   | the search asks the api as you type; Previous / Next, "Showing 1–N of N", Rows per page, pinned to the bottom (D-17, D-19)                                                                                                                                                                                                                                                  |
| click the name header to sort                                                                                                                                      | Role Name sorts (a keyset key, `ROLE_SORT_FIELDS`); the member count does not (D-41)                                                                                                                                                                                                                                                                                        |
| column 1: the name as a link, the total users on a second line                                                                                                     | the same: the name is the row's link (a click anywhere on the row opens it) and "Total Users: N" is a small second line                                                                                                                                                                                                                                                     |
| `fa-pen-to-square` and `fa-trash-can _delete`, two bare icons                                                                                                      | "Edit" (a filled brand button, "Edit <role>") and "Delete" (red, the trash icon, after a separator, "Delete role <role>"); a kebab below `md` (UAT 6, finding 4)                                                                                                                                                                                                            |
| `_delete` → the browser's "Are you sure?"                                                                                                                          | "Delete role <role>?" — "This cannot be undone." (no claim about who holds it: the list's count may be stale) — "Keep role" / "Delete role" in the fixed red (D-25.1)                                                                                                                                                                                                       |
| a role still held: Perfex refuses after the confirm                                                                                                                | the row knows who holds it (D-35): "N staff members hold this role." with the refusal ("This role is still assigned to staff members. Move them to another role first, then delete it.") from the start and "Delete role" disabled, so nothing is sent; a 409 that races the list (someone was given the role since it loaded) stays INSIDE the dialog the same way (UAT 7) |
| the DataTables export buttons (CSV, Excel, PDF, Print) export the rows the table has loaded; to export everything the user first picks "All" in the page-size menu | Export, then CSV, Excel, PDF or Print, exports every role matching the search and sort, three headers in the user's language, with no page-size step (D-03, D-04, D-26, D-42); no PDF under Arabic, where Print covers it (D-09)                                                                                                                                            |
| an empty table                                                                                                                                                     | "No roles yet" with New Role, or "No roles match “…”" with Clear search (D-30)                                                                                                                                                                                                                                                                                              |

### The role form (`/setup/roles/new`, `/setup/roles/:id`): flow parity (FE-18, plan 03.2-18)

Someone who used Perfex's role page does the same job in the same order: name the role, tick its
permissions, optionally push them onto every member who holds it, save once. The layout is ours (the
kit's `SchemaForm`).

| Legacy step or action (`roles/role.php` + `permissions.php`)                             | Our step or action (`RoleForm.tsx` on `SchemaForm`)                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new_role` opens the empty role page                                                     | "New Role" opens `/setup/roles/new`: Role Name and the picker, empty                                                                                                                                                                                                               |
| a name in the roles table opens the role page                                            | a row opens `/setup/roles/:id`: the name at once, the permissions as the role arrives (D-35)                                                                                                                                                                                       |
| `render_input('name', 'role_add_edit_name')`                                             | Role Name: required (the red asterisk, `aria-required`), half width, the example "e.g. Warehouse Supervisor" (UAT 6)                                                                                                                                                               |
| the capability grid of `permissions.php`                                                 | the Permissions section: the `PermissionPicker` open in its grouped accordion: search, a select-all per module, a running total                                                                                                                                                    |
| the warning alert and `update_staff_permissions` (only when members hold it)             | the same checkbox, unticked, under Role Name on its own row, with the warning as a small footnote under its label (lead 2026-09-27), only when someone holds the role                                                                                                              |
| the `col-md-5` panel listing the role's members, each a link                             | a card 'Staff members using this role' beside the form (under it when the page is narrower than 63rem): Full Name, each name a link to `/setup/staff/:id`, 'Total Users: N', a search by name, 10 per page with the pager; 'No staff member holds this role yet.' when nobody does |
| `_l('submit')`                                                                           | "Save role" / "Create role", after a summary of what changes (D-25.4); then "Role saved" and back on the list exactly where the member left it (D-28)                                                                                                                              |
| `role()` has no missing-role check: a missing id opens the role page with nothing loaded | 'That role no longer exists' where the form would be, no Retry, and 'Back to list' to the list the role came from (else `/setup/roles`); any other failed read offers it too, beside Retry when retrying can help (lead 2026-09-27, D-28, D-31)                                    |

Ours, with no legacy counterpart: the error summary and the form alert with Retry (D-29), the
administrator-only guard's states (ADR-0034 d.2), and the two empty states.

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
- **Staff delete** (`manage.php`'s `#delete_staff` modal, `transfer_data_to`) — stays on Perfex: the
  delete writes about 40 tables other modules own (brief §9.1, §10 Q5). The member page links out
  to `/admin/staff?legacy=1` under `staff.delete_on_legacy`; Node offers deactivate instead.
- **Profile-image upload** (`member.php` `profile_image` file input and
  `remove_staff_profile_image`) — Node has no access to Perfex's uploads and no storage port; each
  member uploads their own on their Perfex profile page (brief §9.1).
- **Profile-image display on the member form**: the LIST shows the photo since plan 03.2-15 (the
  api's 96 px `small_` copy at 40 px, lazy, and its 320 px `thumb_` copy in the preview, never the
  original upload, D-23). The member form (plan 03.2-16) shows the name and the status badge and no
  photo: the UI-SPEC's form has no image field, so the detail's `profileImageUrl` stays unread until
  a later plan asks for it.
- **Role and Last login are not sortable (D-41)**: they are not keyset keys. Role is a join and Last
  login is nullable, so the api refuses a sort on either (`MEMBER_SORT_FIELDS` is `staffId`,
  `firstName`, `email`, `active`). Perfex's DataTables sorts both; ours shows them with no sort
  control.
- **The GET search form → live server search (D-19)**: 03.1's box submitted a GET form with a Search
  button. The search now asks the api as you type (300 ms, Enter at once) and lives in the URL.
- **The icon-only / text View → a labelled brand button (finding 4, D-07)**: "View" is a filled
  button in the customer's brand colour, named "View <name>", so it reads as something to click.
- **Deactivating from the list asks first (D-25.2)**: Perfex's switch applies at once either way.
  Turning a member OFF is an access change, so "Deactivate <name>?" confirms it, and a refusal stays
  in the dialog; turning a member ON still applies at once. A viewer without `staff.members.edit`
  sees the status as an Active / Inactive badge in the fixed colours (D-06), not a switch the api
  would refuse.
- **Welcome e-mail** (`send_welcome_email`) — dropped in Wave 1: it mails a plain-text password and
  Node has no e-mail port (brief §9.1, §10 Q7).
- **Staff custom fields** (`render_custom_fields('staff', …)`) — none are defined (0 fields); a new
  field needs this revisited (brief §9.1).
- **The autofill workaround inputs** (`fakeusernameremembered`, `fakepasswordremembered`) — a
  browser workaround with no behaviour (brief §9.1).
- **Dismissed announcements on add** — `tbldismissed_announcements` is not Node's; a new member sees
  current announcements (brief §9.1, §10 Q10).
- **Perfex's activity-log lines** (`log_activity('Staff Member Updated …')`) — Node does not write
  `tblactivity_log`; the identity audit table and the domain events replace them (brief §9.1, §10
  Q8, ADR-0034 d.3).
- **The member's own stats block** (`member.php` loads `admin/staff/stats`: logged time this week,
  last week, this month, last month) — timesheets data, not this slice's (brief §9).
- **The support-department e-mail warning** (`member.php`'s hard-coded English `alert-danger` when a
  department shares the member's e-mail) — it reads `tbldepartments` to warn about a Perfex
  constraint and has no `_lang.php` key at all.
- **The password helpers** (`showPassword`, `generatePassword` and the `last_password_change`
  "password last changed" line) — the two eye/refresh controls are Perfex javascript with no key,
  and the api does not expose `last_password_change`, so `staff_add_edit_password_last_changed`
  cannot be filled and is deliberately absent from `messages/en.json`.
- **The whole-catalogue feature labels**: a change. Perfex's `get_available_staff_permissions()`
  returns a translated label per feature (`register_staff_capabilities(<feature>, …, _l('<key>'))`).
  The Node catalogue is 507 clean ADR-0033 names over 133 resources, so the picker names each MODULE
  through one ICU key (`permission_module`, 17 modules) and each feature by `resourceLabel`: the api's
  resource identifier in sentence case with KPI and PDF upper-cased (`bonusKpi` reads "Bonus KPI"),
  in the picker and in the save summary's lines, which read `{module} · {resource}` through
  `permission_feature`. Perfex's translated per-feature labels, and any Arabic for them, remain a
  data follow-up (a mapping of the 133 `module.resource` entries through `perfex-mapping.ts`).
  Capability labels are message keys, by their legacy `permission_*` names where Perfex has one.
- **Perfex's two-column "Features | Capabilities" table** (`views/admin/staff/permissions.php`, every
  capability of a feature in one cell): a change. An opened module is its own card holding a table
  with one column per action (View, View (own), Create, Edit, Delete, then the others), one row per
  resource with a select-all, and an empty cell where an action does not apply (the lead's layout,
  2026-09-27).
- **Perfex's "view (own)" auto-disabling** (`permissions.php` disables `view` when `view_own` is
  held and vice versa) — the api validates the submitted set (`ERP-IDENTITY-0003`) and the
  `view`/`viewOwn` pair is an any-of gate server-side (D-09), so the grid does not reproduce the
  interlock. A member may hold both, exactly as the api allows.
- **The language picker's option list** — wired (plan 03.2-16): Default Language offers "System
  Default" and what `GET /api/v1/identity/locales` answers (each row a BCP-47 `locale`, named in its
  own language through `shell.language_name`, and the `legacyLanguage` value `defaultLanguage`
  stores) — deliberately the set erp-web ships message packs for, not the 28 folders
  `$this->app->get_available_languages()` lists. Today that is English and Arabic, so the kit renders
  three radio buttons, not a searchable select (D-24 picks by count). A language Perfex stored that
  this deployment does not offer stays in the list as it is, so saving never changes it silently.
- **The per-user Direction field** (`member.php`'s `direction` select, `document_direction`) —
  deleted, not restyled (finding 8): text direction follows the locale now (FE-19, FE-20), so the
  field reproduced cruft the new stack had already replaced. The api still stores and sends the
  column; the form neither shows nor sends it, so a save leaves `tblstaff.direction` as it was.
- **The Profile / Permissions tabs → sections** (ui-kit-decisions §3): one card with the sections
  Profile, Access and "In Perfex". A tab hides the errors on the pane you are not looking at; a
  section never does (D-01).
- **The flat permission grid → the role-first picker** (ui-kit-decisions §1, finding 5): choosing a
  role is the common case, so the Access section shows what the role grants and "Customise these
  permissions" opens the grouped accordion — search, per-module select-all, a running total, "Reset
  to role". The 507-checkbox wall is gone from the member form. The role form opens the same
  accordion straight away (a role IS the template), so the 3.1 capability grid is gone (plan 03.2-18).
- **The role page's two columns → a form card and a members card** (ui-kit-decisions §3, lead
  2026-09-27): `role.php`'s `col-md-7` form becomes one card with the sections Role and Permissions;
  its `col-md-5` members panel becomes its own card beside the form from 63rem of content width, and
  under it below that.
- **The photo beside each member's name** (the `col-md-5` table's `staff_profile_image`): the lead
  chose names only for this card (2026-09-27); the staff list shows the photos.
- **Export on a role's members** (the table's DataTables Export): the staff list already exports
  every member with the role column (D-26); a second export of one role's subset adds nothing (lead
  2026-09-27).
- **The members table's page-size menu** ("Show 10 / 25 / 50 entries"): the card pages 10 at a
  time; members are browsed at length on the staff list.
- **Icon-only row actions → labelled buttons** (UAT 6, finding 4): the roles table's bare pencil and
  bin become "Edit" in the brand fill and "Delete" in the fixed red after a separator, each named with
  the role; below `md` they fold into one "Actions for <role>" menu.
- **"Confirm" / "Cancel" → a verb and a noun** (UAT 7): the delete reads "Keep role" / "Delete role",
  and a refusal stays inside the dialog with "Delete role" disabled; the role form saves with "Save
  role" / "Create role" and "Back to list".
- **Every role save is confirmed by a summary of what changes** (D-25.4): ticking "Update all staff
  members permissions that are using this role" comes first, as an access change; the permissions
  read as one sentence with the removals open and the additions behind "Show N added", as on the
  member form; a renamed role reads "Role Name updated". Perfex saves without asking.
- **The role page's secondary "New Role" button and its autofocus on add**: "Back to list" and the
  list's "New Role" are the way to a second role, and the kit's form focuses nothing on its own.
- **The rarely used fields behind one disclosure** (finding 7; lead 2026-09-26): the e-mail
  signature, Facebook, LinkedIn and Skype sit under "More details", closed unless one of them holds
  a value or an error, so the common case fits one viewport and a stored signature is never hidden
  without a hint.
- **"Save" → a verb and a noun**: "Save staff member" / "Create staff member", "Back to list", and no
  bare Save, Cancel or Confirm anywhere (UI-SPEC § Copywriting).
- **Every save is confirmed by a summary of what changes** (D-25.4): "Save changes to <name>?" lists
  the access changes first — the administrator flag, a role or permission change that takes access
  away, the password — then the rest; free text reads "<Field> updated" and the password "Password
  changed" (no value is ever shown), and the permissions as one sentence ("Adds 5 permissions and
  removes 1.") with the removed ones listed openly (past 10, "Show N more" opens the rest in place) and the added
  ones behind "Show N added", one line per code in the order the audit log records them (lead
  2026-09-26). Re-apply role has no confirmation of its own: nothing is written until Save, and
  the summary is where the removals are seen. Perfex saves without asking.
- **Browser Back on a dirty form leaves without asking** (D-40, see `src/README.md` § The UI kit):
  reload, tab close, every in-app link and "Back to list" ask "Discard changes?"; the App Router has
  no blocking navigation API, so Back is the known exception.

## Routes

- `/setup/staff` (`app/(shell)/setup/staff/page.tsx`, `force-dynamic`): reads nothing (the list's `q`, `sort`,
  `cursor` and `limit` are URL state read in the browser, FE-15), renders `pages/StaffListPage.tsx`
  (`GuardedStaffList`); `generateMetadata` → `staff.staff_members`.
- `/setup/staff/new` (`app/(shell)/setup/staff/new/page.tsx`, `force-dynamic`): renders
  `pages/StaffMemberPage.tsx` in `create` mode; `generateMetadata` → `staff.new_staff`.
- `/setup/staff/:id` (`app/(shell)/setup/staff/[id]/page.tsx`, `force-dynamic`): awaits `params`, refuses
  anything but a positive integer with `notFound()`, renders `pages/StaffMemberPage.tsx` in `edit`
  mode; `generateMetadata` → `staff.staff_member`.
- `app/(shell)/setup/staff/error.tsx`: the route-segment error boundary, inside the feature's route folder
  so it moves with the screens. It renders `common` keys and never `error.message`.

- `/setup/roles` (`app/(shell)/setup/roles/page.tsx`, `force-dynamic`): renders `pages/RolesListPage.tsx`;
  `generateMetadata` → `staff.staff_roles`.
- `/setup/roles/new` (`app/(shell)/setup/roles/new/page.tsx`, `force-dynamic`): renders `pages/RolePage.tsx` in
  `create` mode; `generateMetadata` → `staff.new_role`.
- `/setup/roles/:id` (`app/(shell)/setup/roles/[id]/page.tsx`, `force-dynamic`): awaits `params`, refuses anything
  but a positive integer with `notFound()`, renders `pages/RolePage.tsx` in `edit` mode.
- `app/(shell)/setup/roles/error.tsx`: the `/setup/roles/**` route-segment error boundary, beside the screens.

All seven route files sit in the `(shell)` route group, so `PageShell` wraps them: the sidebar, the
topbar, the breadcrumb trail and the one `<main>` are the shell's, and both record screens publish the
record's name to the dynamic breadcrumb crumb with `useBreadcrumbLabel` (WR-10). Perfex's own paths
redirect here in plan 03.1-09.

**The gate on each of these routes is declared once**, in `@erp/contracts`' `ROUTE_GATES` and its
mirror `src/config/route-gates.ts`; `config/navigation.ts` and `config/routes.ts` read it rather than
restating it, and `src/config/__tests__/route-gates.test.ts` asserts they agree. It is a UI
declaration and a test oracle, never a control — the api gates every request whatever the browser
rendered.

## Data

`api/staff.endpoints.ts` — the paths of `erp-api src/v1/identity`, the resource hooks and
`STAFF_ERROR_CODES`, the identity codes with their own message. Reads go through `useCommonApi`/`useList` (the SWR retry policy, ADR-0031 §5);
writes through `useCommonMutation`, which never retries.

| call                                                              | hook                                                            | note                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/identity/members?q&sort&limit&cursor`                | `ListPageTemplate` (`useList`)                                  | BE-19 keyset grammar; the row carries `roleName`, the photo URLs and `lastLogin`                                                                                                                                                     |
| `GET /api/v1/identity/members/export?format&q&sort&column&header` | `ListPageTemplate` (`downloadFile`, `readExportRows` for Print) | CSV, Excel, PDF or the print rows of everything matching; seven `column` and `header` values in `MEMBER_EXPORT_COLUMNS` order; PDF and Print add the title, yes and no, the blanks `No role` and `Never` (D-26) and the date formats |
| `GET /api/v1/identity/members/:id`                                | `useStaffMember`                                                | the DETAIL schema (the list row has no departments/permissions)                                                                                                                                                                      |
| `POST /api/v1/identity/members`                                   | `useSaveStaffMember().create`                                   | 201 + the detail; ONE request; then the list pages ask again (`revalidateLists`)                                                                                                                                                     |
| `PATCH /api/v1/identity/members/:id`                              | `useSaveStaffMember().update`                                   | 200 + the detail, which fills the detail cache and replaces its row: no list request                                                                                                                                                 |
| `PATCH /api/v1/identity/members/:id/status`                       | `useStaffMemberStatus`                                          | 204; answers the saved row, swapped into the cached pages: no list request (D-36)                                                                                                                                                    |
| `GET /api/v1/identity/permissions/catalogue`                      | `usePermissionCatalogue`                                        | the picker's modules (`toPermissionModules`), 507 clean names, no cursor                                                                                                                                                             |
| `GET /api/v1/identity/departments`                                | `useDepartments`                                                | the picker                                                                                                                                                                                                                           |
| `GET /api/v1/identity/roles`                                      | `useRoleOptions`                                                | the member form's role select, administrator only — NOT the staff list's Role column                                                                                                                                                 |
| `GET /api/v1/identity/roles/:id`                                  | `useRoleTemplate` / `fetchRoleTemplate`                         | the saved role's template (behind-the-role); a changed role's, from the select handler                                                                                                                                               |
| `GET /api/v1/identity/locales`                                    | `useLocales`                                                    | the language select's options; "System Default" is the web's own                                                                                                                                                                     |
| `GET /api/v1/auth/me`                                             | `useActor`                                                      | the actor's `admin` flag; the same SWR key as `usePermissions`                                                                                                                                                                       |
| `GET /api/v1/identity/roles?q&sort&limit&cursor`                  | `ListPageTemplate` (`useList`)                                  | the roles list, administrator only; each row carries `memberCount`                                                                                                                                                                   |
| `GET /api/v1/identity/roles/export?format&q&sort&column&header`   | `ListPageTemplate` (`downloadFile`, `readExportRows` for Print) | three `column` and `header` values in `ROLE_EXPORT_COLUMNS` order                                                                                                                                                                    |
| `GET /api/v1/identity/roles/:id`                                  | `useRole`                                                       | the DETAIL schema: the template plus the members                                                                                                                                                                                     |
| `POST /api/v1/identity/roles`                                     | `useSaveRole().create`                                          | 201 + the detail; then the list pages ask again (`revalidateLists`)                                                                                                                                                                  |
| `PATCH /api/v1/identity/roles/:id`                                | `useSaveRole().update`                                          | 200 + the detail, which fills the detail cache and replaces its row: no list request                                                                                                                                                 |
| `DELETE /api/v1/identity/roles/:id`                               | `useDeleteRole`                                                 | 204 (the list pages ask again), or 409 `ERP-IDENTITY-0006` — shown inside the dialog                                                                                                                                                 |

`useErrorText(STAFF_ERROR_CODES)` renders a problem-details code as plain language: an
`ERP-IDENTITY-*` code through `staff.errors.<code>`, the shared transport, auth and validation codes
through `common.errors`; the api's own `message` text is never rendered (FE-12, FE-13, D-32). A 400 `ERP-VALIDATION-0001` carries
`issues`, which are zod-parsed before any `setError` — a malformed body yields the form-level line
only.

A member save naming a department that no longer exists (an id NEW for the member, which identity
checks through the departments facade, D-55) is refused with 422 `ERP-IDENTITY-0009`: the save
summary shows `staff.errors.ERP-IDENTITY-0009` and keeps the form, so the member can remove it and
save again (plan 04.1-34). A stored link to a deleted department still saves (Departments planning
answer 4).

A detail read that fails on either form — a permalink, or a row opened from the list whose detail
answers a 4xx — is `InlineError` in the form's place with "Back to list" (`common.back_to_list`, to
`readListReturn`'s list URL), plus Retry only when retrying can help. A row opened from the list whose
detail fails retryably keeps its fields, locked, and shows the error with Retry where the detail is
needed (Access; Permissions). Nothing on a row opened from the list can be edited or saved until its
detail arrives, because the row carries no permissions or departments (lead 2026-09-27). When the whole
page is that failure, the breadcrumb's last crumb reads "Record" (`shell.record`) instead of waiting for
a name (`useBreadcrumbLabel(null)`); a row opened from the list keeps its name while the page keeps its
fields.

Two behaviours worth knowing:

- **A save that changes the actor's OWN role or password signs them out everywhere**, refresh cookie
  included (the api ends every session of the subject on an access change; quick task 260924-mp4,
  CR-01/CR-02 a). The save answers 200 and the next request would be a 401, so the form navigates to
  `/login?next=%2Fstaff` itself instead of rendering a shell that can read nothing.
- **A non-administrator never sends a granting field.** `toCreateStaffMemberBody` /
  `toUpdateStaffMemberBody` omit `roleId`, `permissions` and `admin` entirely unless the actor holds
  the administrator flag, and the api's write bodies are strict — an unknown key is a 400, so a
  mistyped granting field could never be silently ignored either.
- **`applyToMembers` is opt-in and one-shot.** It rewrites every holder's permission rows, so the
  checkbox starts unticked, only appears when the role has members (1:1 with the legacy) and returns
  to unticked after a successful save — it is an instruction, never a stored setting.

## Messages

`messages/en.json` (namespace `staff`), registered in `src/messages/index.ts`. Legacy keys keep their
`_lang.php` name and their English text byte-identical from the legacy language packs; ours have no
legacy counterpart. Validation copy travels as keys through zod (`schemas/staff.schema.ts`
`STAFF_MESSAGE_KEYS`) and is resolved in the form.

| Key                                                                                                                                                                                                         | Used in                                                                                     | Legacy key / ours                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `staff_members`, `staff_member`, `new_staff`, `view`, `role`                                                                                                                                                | the list, the member form, the role form's first section, metadata                          | legacy                                                                                                                                             |
| `staff_dt_name`, `staff_dt_email`, `staff_dt_active`, `staff_edit_profile_image`, `the_number_sign`, `inactive`                                                                                             | the list's headers, the export labels, the badge, the members card's column                 | legacy                                                                                                                                             |
| `staff_dt_last_login`                                                                                                                                                                                       | the Last Login header and export label                                                      | legacy `staff_dt_last_Login` lower-cased: the key grammar is lower-case only (the text is unchanged)                                               |
| `noun_staff_members`, `deactivate_title`, `deactivate_body`, `keep_active`, `deactivate_member`, `deactivating_member`, `member_activated_toast`, `member_deactivated_toast`                                | the list's error noun, the deactivate dialog, the toasts                                    | ours (UI-SPEC copy)                                                                                                                                |
| `staff_profile_string`, `staff_add_edit_permissions`, `staff_add_edit_notes`, `task_timesheets`, `projects`                                                                                                 | the Profile heading, the Permissions label, the Perfex links                                | legacy                                                                                                                                             |
| `staff_add_edit_firstname` … `staff_add_edit_password_note` (the profile fields)                                                                                                                            | the member form                                                                             | legacy                                                                                                                                             |
| `localization_default_language`, `system_default_string`, `settings_email_signature`, `staff_email_signature_help`, `settings_yes`, `settings_no`, `dropdown_non_selected_tex`                              | the member form; yes/no in the save summary                                                 | legacy                                                                                                                                             |
| `noun_staff_member`, `section_access`, `section_in_perfex`, `more_details`, `toast_staff_saved`, `permission_line`                                                                                          | the member form's sections, labels and toast                                                | ours (UI-SPEC copy)                                                                                                                                |
| `role_grants_summary`, `customise_permissions`, `search_permissions`, `module_granted_count`, `select_all_in_module`, `reset_to_role`, `permissions_granted_count`                                          | the role-first picker                                                                       | ours (UI-SPEC copy)                                                                                                                                |
| `behind_role`, `reapply_role`, `reapply_role_title`, `keep_current_permissions`, `permission_module`                                                                                                        | behind the role, its confirmation, the module names                                         | ours                                                                                                                                               |
| `password_changed`, `create_summary_role` (the permission lines through `common.permission_changes_summary`, `permissions_removed_heading`, `show_added_permissions`, `hide_added_permissions`, `and_more`) | the save summary (D-25.4)                                                                   | ours (UI-SPEC copy)                                                                                                                                |
| `permission_view`, `permission_view_own`, `permission_create`, `permission_edit`, `permission_delete`                                                                                                       | the picker's capability labels                                                              | legacy                                                                                                                                             |
| `permission_edit_own`, `permission_delete_own`, `permission_assign`, `permission_approve`                                                                                                                   | the picker                                                                                  | ours — ADR-0033 introduced these actions                                                                                                           |
| `permission_feature`, `permission_unknown_capability`                                                                                                                                                       | the picker and the summaries                                                                | ours                                                                                                                                               |
| `feature`                                                                                                                                                                                                   | the picker's resource column header                                                         | legacy (`english_lang.php` L3888, the header of Perfex's own table)                                                                                |
| `tab_face_registration`                                                                                                                                                                                     | the member form                                                                             | ours — hard-coded English in the view                                                                                                              |
| `toggle_active`, `status_not_saved`                                                                                                                                                                         | the Active switch and its announcement                                                      | ours                                                                                                                                               |
| `no_staff_heading`, `no_staff_body`, `no_staff_match_heading`, `no_staff_match_body`                                                                                                                        | the two empty states                                                                        | ours                                                                                                                                               |
| `no_role`                                                                                                                                                                                                   | the list's empty Role                                                                       | ours                                                                                                                                               |
| `never`                                                                                                                                                                                                     | the list's empty Last Login                                                                 | legacy literal: `tables/staff.php` L60 hard-codes `$_data = 'Never';` and there is no `_lang.php` key, so the key is ours and the text is Perfex's |
| `granting_admin_only`, `permissions_administrator_note`                                                                                                                                                     | the member form's Access section                                                            | ours (ADR-0034 d.2 has no legacy key)                                                                                                              |
| `delete_on_legacy`, `tab_notes_on_legacy`, `tab_timesheets_on_legacy`, `tab_projects_on_legacy`, `tab_face_on_legacy`                                                                                       | the links out to Perfex                                                                     | ours                                                                                                                                               |
| `enter_firstname`, `enter_lastname`, `enter_valid_email`, `enter_password`, `enter_valid_hourly_rate`                                                                                                       | `staff.schema.ts` → field errors                                                            | ours                                                                                                                                               |
| `errors.ERP-IDENTITY-0001` … `errors.ERP-IDENTITY-0009`                                                                                                                                                     | `useErrorText(STAFF_ERROR_CODES)`                                                           | ours (problem-details codes); `errors.ERP-IDENTITY-0002` carries the legacy `email_exists` text                                                    |
| `common.try_again`, `common.something_went_wrong`, `common.view_named`                                                                                                                                      | the route boundaries, View's accessible name                                                | ours (`src/messages/common`)                                                                                                                       |
| `common.save_noun`, `common.create_noun`, `common.saving_noun`, `common.creating_noun`, `common.save_summary_title`, `common.create_summary_title`                                                          | the member form's submit and its save summary                                               | ours (`src/messages/common`)                                                                                                                       |
| `new_role`, `roles_dt_name`, `roles_total_users`, `role_add_edit_name`, `staff_which_are_using_role`                                                                                                        | the roles list, the role form, the members card and the CSV header                          | legacy                                                                                                                                             |
| `change_role_permission_warning`, `role_update_staff_permissions`                                                                                                                                           | the role form's checkbox and its helper                                                     | legacy                                                                                                                                             |
| `staff_roles`                                                                                                                                                                                               | the `/setup/roles` page title and metadata                                                  | legacy (the `roles` key, whose English text is "Staff Roles")                                                                                      |
| `no_roles_heading`, `no_roles_body`, `role_has_no_members`                                                                                                                                                  | the roles empty states and the members card's empty state                                   | ours (DataTables supplies the legacy's empty text at runtime)                                                                                      |
| `noun_role`, `noun_roles`, `delete_role_title`, `delete_role_body`, `toast_role_deleted`, `toast_role_saved`, `role_name_placeholder`, `no_roles_match_heading`, `no_roles_match_body`, `total_users`       | the verb + noun labels, the delete, the toasts, the placeholder, no results, the CSV header | ours (UI-SPEC copy; `no_roles_match_body` and `total_users` are new in plan 03.2-18)                                                               |
| `edit_role_action`, `delete_role_action`                                                                                                                                                                    | the two row actions' accessible names                                                       | ours — the legacy renders a bare icon with no accessible name                                                                                      |
| `enter_role_name`                                                                                                                                                                                           | `staff.schema.ts` → the name error                                                          | ours                                                                                                                                               |
| `common.keep_noun`, `common.delete_noun`, `common.deleting_noun`, `common.edit`, `common.delete`                                                                                                            | the delete dialog and the two row actions                                                   | ours (`src/messages/common`, UI-SPEC verb + noun)                                                                                                  |

Deliberately absent, so the "every `en` key is referenced" clause stays honest:
`staff_send_welcome_email`, `staff_add_edit_password_last_changed`, `delete_staff`, `delete_staff_info` — each belongs to
something this feature does not build (see the drops).

`messages/ar.json`: the same key set, **UNREVIEWED**. Perfex's own Arabic pack covers only the
`purchase` module (475 keys, none of them ours), so the Arabic here is a placeholder awaiting the
customer's translation, which replaces the file — a data change, no code. It exists so the mechanism
is proven end to end (the `ar` tests assert `physicalClassesIn(container)` is empty).

## How to run its tests

```bash
corepack yarn test src/features/staff
```

DOM tests (`*.test.tsx`) opt into happy-dom with `// @vitest-environment happy-dom` on line 1 and
render through `src/test/render.tsx` (`renderWithProviders`, `physicalClassesIn`). Anything that
renders a component reading the session must `setSession({ accessToken, csrfToken })` first and
`clearSession()` after (quick task 260924-ofo): without a session `useActor` asks for
nothing and the actor reads as "not an administrator".
