# ticket-priorities

## Purpose

Ticket Priorities of the modernised ERP: the list at `/setup/ticket-priorities`, the create form at
`/setup/ticket-priorities/new` and the record form at `/setup/ticket-priorities/:id`. It started as
a copy of erp-docs 05-templates/frontend-feature and follows the recipe Cost Centers, Taxes and
Expense Categories proved. Every write goes through erp-api `src/v1/ticket-priorities`.

A ticket priority is one name. Tickets point at it, and one priority is the default of tickets
opened by email piping, which is why a delete can be refused.

The menu item stays Perfex's: its label is the shell key `shell.acs_ticket_priority_submenu`, and
the list page uses the same key as its title. This feature adds no `ticket_priorities` key of its
own.

**Names are text.** Node accepts what Perfex accepts: a required, trimmed name of at most 50
characters, every character allowed (Arabic included), and a name another priority already holds.
A name is rendered as React text only, never as raw HTML, in the list cell, the delete dialog, the
form title and the breadcrumb.

## Legacy screen

`application/views/admin/tickets/priorities/manage.php` (Perfex's `admin/tickets/priorities` screen, with the `Tickets` controller's `priorities`, `priority` and `delete_priority` actions).

## Legacy parity

Flow parity: someone who used the Perfex screen does the same job in the same order, with the same
business outcome.

| Perfex step                                                                                                        | Node step (`TicketPrioritiesList.tsx`, `TicketPrioritiesForm.tsx`)                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Setup > Support > Priorities (`acs_ticket_priority_submenu`)                                                       | the same menu item and label; it opens `/setup/ticket-priorities`                                                                                                        |
| the list: two columns, ID and Priority Name (`ticket_priority_dt_name`), with edit and delete, and the Export menu | the same two columns, with the name as the link, a labelled Edit and a labelled Delete; the Export menu, served by the API; server search, sort by ID or name, the pager |
| New Priority (`new_ticket_priority`)                                                                               | New Priority opens the `/new` page, titled `ticket_priority_add`, with the same one field > Create ticket priority > "Ticket priority saved" > back to list              |
| edit (`ticket_priority_edit`): the name prefilled > save                                                           | the row, the name link or Edit opens `/:id` prefilled > the save summary ("Priority Name: old > new") > the toast > back to the exact list URL                           |
| name rule: required, up to 50 characters, no unique-name rule                                                      | the same: required, trimmed, at most 50, any character; a duplicate name is saved                                                                                        |
| delete is refused while a ticket uses the priority, or it is the email-piping default                              | Delete > a dialog naming the priority; the api's refusal stays inside the dialog: `ERP-TICKETPRIORITIES-0001` (used by a ticket), `-0002` (the email-piping default)     |
| no priorities (`no_ticket_priorities_found`)                                                                       | the empty state shows that text, the explanation and New Priority                                                                                                        |

## Dropped on purpose

- **The old rules of the first draft are gone**: a 2-character minimum, the Latin-only character
  set and the "name taken" code `ERP-TICKET-PRIORITIES-0001` never existed in Perfex. An Arabic name
  is valid. Perfex has no unique-name rule, so duplicates are saved.
- **The browser `confirm()` / the inline Yes-No**: the kit's `ConfirmDialog`, naming the priority.
- **The heading on edit is the record name**, not "Edit Ticket Priority"; `ticket_priority_edit` is
  the document title.
- **The alert wording**: the kit's toasts and the plain-language refusals replace the legacy alerts,
  and the verb + noun buttons replace `cancel` and `submit`.
- **No bulk action**: Perfex offers none here.
- **Perfex's activity-log lines**: Node never writes Perfex's Activity Log.
- **Added on purpose**: the save summary before every save.

## Routes

All three live in the shell's route group, so they get the sidebar and the topbar, each gated by
`src/config/route-gates.ts`. `proxy.ts`'s `/setup/:path*` matcher sends an anonymous visitor to
`/login`.

- `/setup/ticket-priorities` (`app/(shell)/setup/ticket-priorities/page.tsx`, `force-dynamic`):
  `pages/TicketPrioritiesListPage.tsx`; the search, sort and page live in the URL;
  `generateMetadata` > `shell.acs_ticket_priority_submenu`.
- `/setup/ticket-priorities/new` (`new/page.tsx`): `pages/TicketPrioritiesPage.tsx` with no id;
  `generateMetadata` > `ticket_priority_add`.
- `/setup/ticket-priorities/:id` (`[id]/page.tsx`): reads `await props.params` (Next.js 16),
  `notFound()` unless the id is a positive integer, then the same page with `String(Number(id))`;
  `generateMetadata` > `ticket_priority_edit`.
- `app/(shell)/setup/ticket-priorities/error.tsx`: the segment's error boundary (keys from
  `common`; never `error.message`).

## Data

`api/ticket-priorities.endpoints.ts`, `TICKET_PRIORITIES_ENDPOINTS`: the five calls erp-api
`src/v1/ticket-priorities` serves. Reads go through `useCommonApi` and writes through
`useCommonMutation`, never through a hand-written client.

| call                                                | used by                            | note                                                                                                                                                    |
| --------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/ticket-priorities?q&sort&limit&cursor` | `ListPageTemplate`                 | BE-19 keyset grammar; a row is the whole record: `{ id, name }`                                                                                         |
| `GET /api/v1/ticket-priorities/:id`                 | `useTicketPriorities`              | the record; a row opened from the list seeds it                                                                                                         |
| `POST /api/v1/ticket-priorities`                    | `useSaveTicketPriorities().create` | `{ name }`; a duplicate name is accepted; never retried                                                                                                 |
| `PATCH /api/v1/ticket-priorities/:id`               | `useSaveTicketPriorities().update` | `{ name }`; 404 `ERP-CORE-0004` when it was deleted meanwhile, shown inside the save summary; never retried                                             |
| `DELETE /api/v1/ticket-priorities/:id`              | `useDeleteTicketPriority`          | 204; 409 `ERP-TICKETPRIORITIES-0001` (used by a ticket); 409 `ERP-TICKETPRIORITIES-0002` (the email-piping default); 404 `ERP-CORE-0004`; never retried |

- The row carries no usage, so the delete dialog never refuses up front: the api's 409 is shown
  inside the dialog. After a 404 the list pages ask again; after a 409 they do not (nothing in the
  row changed).
- After an edit opened from the list, the saved record is swapped into the cached list pages (no
  list request); after a create, or an edit of a permalink, the list pages ask again.
- A 400 `ERP-VALIDATION-0001` carries `issues`, zod-parsed before `setError`; the api's text is
  never rendered. `name` is the one issue target.

## Messages

`messages/en.json` and `messages/ar.json`, namespace `ticket-priorities`, registered for `en` and
`ar` in `src/messages/index.ts`.

- **Perfex keys**, kept under their `english_lang.php` names: `new_ticket_priority`,
  `ticket_priority_add`, `ticket_priority_edit`, `ticket_priority_dt_name`,
  `no_ticket_priorities_found`, `ticket_priority_lowercase` (also the noun of every verb + noun
  label).
- **Ours**, in snake_case: `noun_ticket_priorities` (the plural in the list's failure line),
  `section_details`, `empty_body`, `no_match_heading`, `no_match_body`, `enter_name`,
  `name_too_long`, `saved_toast`, `deleted_toast`, `edit_action_named`, `delete_action_named`,
  `delete_title`, `delete_body`, `errors.ERP-CORE-0004`, `errors.ERP-TICKETPRIORITIES-0001` and
  `errors.ERP-TICKETPRIORITIES-0002`.
- **Not added**: `ticket_priorities`. The list title is `shell.acs_ticket_priority_submenu`, so the
  page slice is `common`, `shell` and `ticket-priorities`.

`messages/ar.json` holds the same key set, **unreviewed**: a draft until the customer's reviewer
signs the file off (a data change); the Perfex keys are to be replaced by the legacy Arabic pack
text.

## How to run its tests

```bash
corepack yarn test src/features/ticket-priorities
```

DOM tests (`*.test.tsx`) opt into happy-dom on line 1 and render through `src/test/render.tsx`; the
network is a fake adapter on `http.defaults.adapter`. Every state is a story export and an `it`:
the list's `Loading`, `Empty`, `NoResults`, `Error`, `Loaded`, `DeleteConfirm`, `DeleteUsedByTicket`,
`DeleteEmailPipingDefault`, `DeleteRetryable`, `Mobile` and `Rtl`; the form's `Default`, `Edit`,
`SaveSummary`, `Loading`, `Mobile`, `Pending`, `ArabicName`, `NameTooLong`, `FieldErrors`,
`ServerError`, `SaveRefusedDeleted`, `EditFromList`, `NotFound` and `Rtl`. `corepack yarn check`
audits every story with axe at 1280 and 375 px.
