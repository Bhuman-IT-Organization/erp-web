# Services

## Purpose

Services is the modernised ERP support feature for managing ticket services. The list is available at `/setup/services`, the create form at `/setup/services/new`, and the edit form at `/setup/services/:id`. It replaces the legacy Perfex services management screen while keeping the legacy quick-add route available.

## Legacy screen

`application/views/admin/tickets/services/manage.php` (the list) and `application/views/admin/tickets/services/service.php` (the add/edit modal), served by `controllers/admin/Tickets.php` (`services`, `service`, `delete_service`).
The quick add on the ticket form (`/admin/tickets/service`) stays on Perfex.

## Legacy parity

Flow parity: users can perform the same core service-management tasks in the modern ERP.

| Perfex step                            | Node step                                                         |
| -------------------------------------- | ----------------------------------------------------------------- |
| Open the Services screen from Support. | Open `/setup/services` from the modern ERP navigation.            |
| View the services list.                | View the services list in the modern ERP.                         |
| Add a service and enter its name.      | Open `/setup/services/new`, enter the service name, and save it.  |
| Edit an existing service.              | Open `/setup/services/:id`, update the service name, and save it. |
| Delete a service.                      | Delete the service using the modern confirmation dialog.          |
| Use the legacy quick-add route.        | Keep `/admin/tickets/service` available.                          |

## Dropped on purpose

- The legacy delete route `/admin/tickets/delete_service` is refused by Nginx.
- The legacy quick-add route `/admin/tickets/service` remains available.
- The modern Services screen uses the ERP feature structure and shared UI components instead of reproducing the legacy screen implementation.
- Service names are limited to the database column's maximum length of 50 characters.
- The modern screen uses the shared confirmation dialog for delete actions.

## Routes

- `/setup/services` — services list page.
- `/setup/services/new` — create a service.
- `/setup/services/:id` — edit an existing service.

The route gates for `/setup/services`, `/setup/services/new`, and `/setup/services/:id` use `ADMIN_GATE`. The navigation item uses the same gate through `navGateOf('/setup/services')`. The navigation item ID is `tickets-services`, with the href `/setup/services`.

## Data

The legacy database table is `tblservices`.

| Field       | Description                                           |
| ----------- | ----------------------------------------------------- |
| `serviceid` | Service record identifier.                            |
| `name`      | Service name, with a maximum length of 50 characters. |

The feature API communicates with the backend services endpoints. List, create, update, and delete operations should follow the existing ERP API contracts and error-handling conventions.

## Messages

The feature translations are stored in `src/features/services/messages/en.json` and `src/features/services/messages/ar.json`, under the `services` namespace. The English namespace must be registered in `src/messages/index.ts`.

Expected translation keys include:

- `services`
- `add_service`
- `edit_service`
- `service_name`
- `errors.ERP-CORE-0004`
- `errors.ERP-SERVICES-0001`

Keep the Arabic translation key set consistent with the English translation file.

## How to run its tests

Run the feature shape test:

```bash
corepack yarn test src/__tests__/feature-shape.test.ts
```

Run the services-specific tests:

```bash
corepack yarn test src/features/services
```

The feature shape test checks the README structure, file naming, colocated component stories, test files, translation messages, and required story exports. List component stories should export `Loading`, `Empty`, `Error`, and `Loaded`.
