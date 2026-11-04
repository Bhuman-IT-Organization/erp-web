# Estimate Request Statuses

## Purpose

Provides the administrator Setup screen for estimate request statuses at
`/setup/estimate-request-statuses` for the legacy `tblestimate_request_status` records.

## Legacy screen

`application/views/admin/estimate_request/manage_statuses.php`

## Legacy parity

The list displays status ID, name, and the total number of estimate requests using each status. It
supports search, sorting, pagination, and export. Its default sort is status name ascending, with ID
ascending as a tie-breaker. Create and Edit open full-page forms with name, color, and order fields.
Delete is offered only for statuses without a flag and requires confirmation.

## Dropped on purpose

- **Difference:** The legacy create/edit modal became a full page. **Reason:** The Setup screen uses
  dedicated routes so forms can be opened and revisited directly.
- **Difference:** Saving requires a summary confirmation. **Reason:** Users can review the proposed
  changes before submitting them.
- **Difference:** Names are trimmed and limited to 50 characters. **Reason:** This enforces the
  status-name validation contract.
- **Difference:** A blank order is saved as `null`. **Reason:** An empty field represents no
  explicit order rather than the numeric value zero.
- **Difference:** Delete is hidden for flagged statuses and asks for confirmation otherwise.
  **Reason:** Flagged statuses are built-in and cannot be deleted.

## Routes

All screen routes are administrator-only:

- `/setup/estimate-request-statuses`: list and export.
- `/setup/estimate-request-statuses/new`: create a status.
- `/setup/estimate-request-statuses/:id`: edit a status.

Anonymous visitors are sent to `/login`; non-administrators are refused before list or record data
is requested.

## Data

The web screen expects status rows with `id`, `name`, `color`, `statusorder`, `flag`, and
`total_request`; the request count is for estimate requests that use that status. The form accepts
colors up to 10 characters. A blank color is sent blank by the form and the API saves it as
`#757575`. Order accepts a whole number or a blank value, which is saved as `null`.

The backend API module and its endpoints, including deletion, are not yet available. The web
feature's API client integration must not be taken as confirmation that those backend routes exist.

## Messages

`messages/en.json` and `messages/ar.json` provide the `estimate-request-statuses` namespace,
including the list, form, validation, and API error messages.

## How to run its tests

From `erp-web`:

```bash
corepack yarn test src/features/estimate-request-statuses
```
