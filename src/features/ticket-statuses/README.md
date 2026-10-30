# Ticket Statuses

## Purpose

Moves the administrator-only Ticket Statuses screen to `/setup/ticket-statuses`. The feature uses
the existing `tbltickets_status` records and ticket counts from `erp-api/src/v1/ticket-statuses`.
It supports create, edit, delete, and export.

## Legacy screen

`application/views/admin/tickets/tickets_statuses/manage.php`
(`views/admin/tickets/tickets_statuses/manage.php` in the legacy application).

## Legacy parity

| Perfex screen behavior                            | Node implementation                                                                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| List status ID, name, and `Total N` ticket count  | `ListPageTemplate`; API rows include `ticket_count`, shown below each name                                                   |
| Edit a status from its row                        | Row action opens `/setup/ticket-statuses/:id`                                                                                |
| Add or edit name, color, and order in a modal     | Shared `SchemaForm` at `/new` and `/:id`; color accepts any text up to 7 characters and order may be blank or a whole number |
| Hide Delete for built-in statuses                 | Delete row action is omitted when `isdefault` is set                                                                         |
| Refuse deletion of a referenced or default status | `ConfirmDialog` keeps the API refusal visible using Perfex's `is_referenced` and `cant_delete_default` messages              |
| Export the status list                            | API export endpoint includes ID, name, and ticket count                                                                      |

The API returns cursor-paged results as `{ data, meta }`, with `nextCursor`, `prevCursor`, `total`,
`rangeStart`, `exportLimit`, and `printLimit` in `meta`. Search and sorting run on the API: the screen
sends `limit`, `cursor`, `q`, and `sort` and renders the returned page. A successful save returns to
the originating list; edits replace the cached row and creates revalidate the list.

## Dropped on purpose

- The legacy modal interaction is replaced with the feature's create and edit routes.
- Built-in statuses cannot be deleted; the row action is hidden and the API remains authoritative.

## Routes

- `GET /api/v1/ticket-statuses`
- `GET /api/v1/ticket-statuses/export`
- `GET /api/v1/ticket-statuses/:id`
- `POST /api/v1/ticket-statuses`
- `PATCH /api/v1/ticket-statuses/:id`
- `DELETE /api/v1/ticket-statuses/:id`

The screen routes `/setup/ticket-statuses`, `/setup/ticket-statuses/new`, and
`/setup/ticket-statuses/:id` are administrator-only. The API independently enforces administrator
access.

## Data

Every status response includes `ticket_count`, the number of tickets currently using it. The list
schema requires a nonnegative integer count; the UI renders it as `Total N`. The API stringifies
`ticketstatusid`, which the feature maps to the row's `id`. Nullable color and order values remain
blank in the form, and an empty order is submitted as `null`. Names are limited to 50 characters.

## Messages

English and Arabic messages are registered in `src/messages/index.ts` under the `ticket-statuses`
namespace. Delete refusal codes are shown with the localized Perfex messages in both locales.

## How to run its tests

From `erp-web`, run `corepack yarn vitest run src/features/ticket-statuses`.
