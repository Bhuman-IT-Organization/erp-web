# announcements

## Purpose

Announcements provides the list at `/setup/announcements`, the create form at
`/setup/announcements/new` and the edit form at `/setup/announcements/:id`. It owns the
announcement screen and uses the `src/v1/announcements` API, which writes Perfex's own
`tblannouncements` table.

The modern screen is available at `/setup/announcements`, with the announcement breadcrumb provided
by the application shell.

## Legacy screen

`application/views/admin/announcements/manage.php`

**Administrators only** (in Perfex only the menu item, the form and delete are admin-only; `index()` has no admin check, so this is a Difference, listed under Legacy parity). The three routes use
the `'admin'` gate in `@erp/contracts`' `ROUTE_GATES`; the
menu item reads the same gate through `navGateOf`, and both screens sit behind
`withAuth(withPermission(...))`: a non-administrator sees the kit's "no access" state once `/me`
has answered, and the screen asks the api for nothing. The page gate is presentation only: the api
refuses every handler to anyone but an administrator with 403 `ERP-AUTH-0005` regardless.

**Names are text.** A name is rendered as React text only, never as raw HTML, in the list cell,
the delete dialog, the form title and the breadcrumb (T-4.1-91). The message is a plain multiline
text field: Perfex's TinyMCE is dropped until a wave owns rich text.

## Legacy parity

Flow parity (FE-18, D-29): someone who used the Perfex announcements screen
(`admin/announcements.php`) does the same job in the same order, with the same business outcome —
the Name and Date Added list with search and paging, a create form of Name, Message and the three
Show switches, an edit of the same fields, a delete with confirmation, and an export.

### Differences

- **Difference.** Non-admin staff who type `/admin/announcements` no longer get the list; the dashboard tab still works for them. _Why:_ the Node screen is the management screen, so all three routes are `ADMIN_GATE`; reading stays on Perfex's dashboard.
- **Difference.** The Node list has no View or Dismiss; both stay on Perfex. _Why:_ they are per-user dashboard behaviour, and `tbldismissed_announcements` stays owned by perfex-core (ADR-0029).
- **Difference.** The export has an ID column. _Why:_ the shared export carries the record id so a row can be matched to its record; Perfex's list shows Name and Date only.
- **Difference.** Search covers the name and the id, not the date. _Why:_ the api searches those two columns; a typed number finds the record.
- **Difference.** A save returns to the list, not to the view page. _Why:_ the view page stays on Perfex, so the Node screen has nothing to return to but the list.
- **Difference.** The activity log line is replaced by the event and log line. _Why:_ the module publishes a domain event and writes one log line instead of Perfex's activity-log row.
- **Difference.** Perfex's delete also removes matching dismissal rows; Node's delete does not. _Why:_ `tbldismissed_announcements` remains owned by perfex-core.
- **Difference.** The message is trimmed before it is stored. _Why:_ the API body schema trims message text to its character limit.

## Dropped on purpose

- **Who added it is not shown or edited** (the api saves the staff member's full name in `userid`, as Perfex does; the screen only offers the Show my name switch).
- **Dismissals are Perfex's**: `tbldismissed_announcements` stays owned by perfex-core (ADR-0029).
- The editor is plain text, never markup.

## Routes

All three live in the shell's route group, so they get the sidebar and the topbar, and each uses the `'admin'` gate declared in `@erp/contracts`' `ROUTE_GATES`.

- `/setup/announcements` (`app/(shell)/setup/announcements/page.tsx`, `force-dynamic`):
  `pages/AnnouncementsListPage.tsx`; the search, sort and page live in the URL (FE-15);
  `generateMetadata` > `announcements`.
- `/setup/announcements/new` (`new/page.tsx`): `pages/AnnouncementsPage.tsx` with no id;
  `generateMetadata` > `announcement_add_heading`.
- `/setup/announcements/:id` (`[id]/page.tsx`): `notFound()` unless the id is a positive integer,
  then the same page with `String(Number(id))`; `generateMetadata` > `announcement_edit_heading`.
- `app/(shell)/setup/announcements/error.tsx`: the segment's error boundary (keys from `common`;
  never `error.message`).

## Data

`api/announcements.endpoints.ts`, `ANNOUNCEMENTS_ENDPOINTS`: the six calls erp-api
`src/v1/announcements` serves.

| call                                                           | used by                              | note                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/announcements?q&sort&limit&cursor`                | `ListPageTemplate`                   | Server list state; rows contain `{ id, name, message, dateAdded, showToUsers, showToStaff, showName }` |
| `GET /api/v1/announcements/export?format&q&sort&column&header` | `ListPageTemplate` (the Export menu) | CSV, Excel, PDF or Print of the translated Id, Name and Date Added columns                             |
| `GET /api/v1/announcements/:id`                                | `useAnnouncements`                   | the record; a row opened from the list seeds it (D-35)                                                 |
| `POST /api/v1/announcements`                                   | `useSaveAnnouncements().create`      | the five saved fields; never retried                                                                   |
| `PATCH /api/v1/announcements/:id`                              | `useSaveAnnouncements().update`      | the same five fields, including required message; 404 `ERP-CORE-0004` when deleted; never retried      |
| `DELETE /api/v1/announcements/:id`                             | `useDeleteAnnouncement`              | 204; 404 `ERP-CORE-0004`; never retried; dismissal rows remain                                         |

- The switches are booleans on the wire; the API maps them to Perfex's 0/1 integers in storage.
- After an edit opened from the list, the saved record is swapped into the cached list pages (no
  list request, D-36); after a create, or an edit of a permalink, the list pages ask again.
- A 400 `ERP-VALIDATION-0001` carries `issues`, zod-parsed before `setError`; the api's text is
  never rendered (T-3-26). `name` and `message` are the issue targets.

## Messages

`messages/en.json`, namespace `announcements`, registered in `src/messages/index.ts`.
Perfex keys: `announcements`, `new_announcement`, `announcement_name`, `announcement_message`,
`date_added` and the three Show switch labels; the rest are specific to this screen.

`messages/ar.json` holds the same key set, **unreviewed**: a draft Arabic placeholder, until the
customer's reviewer signs the file off (a data change).

## How to run its tests

```bash
corepack yarn test src/features/announcements
```
