# ticket

## Purpose

Ticket Statuses provides the administrator-only list, create form, and edit form at
`/setup/ticket-statuses`. The web feature uses the existing `tbltickets_status` records through
`erp-api/src/v1/ticket-statuses`; it does not add pagination or a separate export API.

## Legacy screen

None: Ticket Statuses is served by the migration API and the existing Node-owned status table.

## Legacy parity

The list shows status ID and name, supports search and sorting, and offers create, edit, and delete
actions. Built-in statuses remain visible and editable but do not offer Delete. Create and edit
submissions are confirmed before the API request; a successful save returns to the originating list.
Search and sorting are local because the backend list contract is an unpaginated `{ data }` response.

## Dropped on purpose

- Pagination query parameters and cursor handling: the API strictly accepts an empty list query.
- Export: the API has no Ticket Statuses export endpoint.
- Delete for built-in statuses: the backend also refuses that operation.

## Routes

- `GET /api/v1/ticket-statuses`
- `GET /api/v1/ticket-statuses/:id`
- `POST /api/v1/ticket-statuses`
- `PATCH /api/v1/ticket-statuses/:id`
- `DELETE /api/v1/ticket-statuses/:id`

The three `/setup/ticket-statuses` pages are gated by `ADMIN_GATE`; the API independently requires
an administrator for every actor-facing operation.

## Data

The list returns `{ data: TicketStatus[] }`, with no `meta`, `limit`, or `cursor`. The UI validates
the backend wire fields and maps `ticketstatusid` to its existing row `id`; nullable color and order
values are adapted to the form's empty color and zero order defaults. Names are limited to 50
characters. Backend deletion checks protect built-in, ticket-referenced, and configured default
reply statuses.

## Messages

English and Arabic strings are in `messages/en.json` and `messages/ar.json`. Backend refusal codes
`ERP-TICKETSTATUSES-0001` and `ERP-TICKETSTATUSES-0002` have feature-specific messages in both
locales.

## How to run its tests

From `erp-web`, run `corepack yarn vitest run src/features/ticket`.
