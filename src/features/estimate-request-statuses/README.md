# Estimate Request Statuses

## Purpose

Provides the administrator Setup screen for estimate request statuses at
`/setup/estimate_request-statuses`, using the existing `tblestimate_request_status` records and
the erp-api module at `src/v1/estimate-request-statuses`.

## Legacy screen

`application/views/admin/estimate_request/manage_statuses.php`

## Legacy parity

The list displays status ID, name, and the total number of estimate requests using each status. It
supports search, sorting, pagination, and export. Create and Edit open full-page forms with name,
color, and order fields.

Delete is intentionally not offered in this screen. The API's existing DELETE endpoint remains
available to its authorized callers.

## Dropped on purpose

- The legacy modal create/edit flow is replaced by the Setup create and edit routes.
- The list's Delete action and confirmation dialog are omitted.

## Routes

All screen routes are administrator-only:

- `/setup/estimate_request-statuses`: list and export.
- `/setup/estimate_request-statuses/new`: create a status.
- `/setup/estimate_request-statuses/:id`: edit a status.

Anonymous visitors are sent to `/login`; non-administrators are refused before the list or record
API is requested.

## Data

The API returns `{ id, name, color, statusorder, flag, total_request }`. The `id` is a string in
the response; `total_request` counts records whose `tblestimate_requests.status` matches the
status ID. The form trims and requires a name of at most 50 characters. Color accepts up to 10
characters; blank color is preserved as blank in the form. Order accepts a whole number or blank.

The web feature uses `GET /api/v1/estimate-request-statuses` for the list, `/export` for exports,
and `/:id` for record reads. It uses `POST` to create and `PATCH /:id` to edit. A successful save
returns to the originating list and updates its cached rows.

## Messages

`messages/en.json` and `messages/ar.json` provide the `estimate-request-statuses` namespace,
including the list, form, validation, and API error messages.

## How to run its tests

From `erp-web`:

```bash
corepack yarn test src/features/estimate-request-statuses
```
