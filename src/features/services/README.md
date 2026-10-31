# Services

## Purpose

Services is the modernised ERP support feature for managing ticket services. The list is available at `/setup/services`, the create form at `/setup/services/new`, and the edit form at `/setup/services/:id`. It replaces the legacy Perfex services management screen while keeping the legacy quick-add route available.

## Legacy screen

`application/views/admin/tickets/services/manage.php` (the list) and `application/views/admin/tickets/services/service.php` (the add/edit modal), served by `controllers/admin/Tickets.php` (`services`, `service`, `delete_service`).

The quick add on the ticket form (`/admin/tickets/service`) stays on Perfex.

## Legacy parity

Flow parity: users can perform the same core service-management tasks in the modern ERP.

| Perfex step                            | Node step                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| Open the Services screen from Support. | Open `/setup/services` from the modern ERP navigation.                                        |
| View the services list.                | View the services list in the modern ERP.                                                     |
| Add a service and enter its name.      | Open `/setup/services/new`, enter the service name, and save it.                              |
| Edit an existing service.              | Open `/setup/services/:id`, update the service name, and save it.                             |
| Delete a service.                      | Delete the service using the modern confirmation dialog, provided no ticket uses the service. |
| Use the legacy quick-add route.        | Keep `/admin/tickets/service` available.                                                      |

## Screen features

- **Columns:** ID and Service Name.
- **Default order:** Service Name ascending.
- **Access:** Administrators only.
- **Delete restriction:** A service cannot be deleted while a ticket uses it. The error code is `ERP-SERVICES-0001`.
- **Export:** CSV, Excel, PDF, and Print.
- **Confirmation:** Delete actions use the shared confirmation dialog.
- **Name limit:** Service names are limited to 50 characters.
- **Quick add:** The legacy `/admin/tickets/service` route remains available.

## Dropped on purpose

None.

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

The feature uses the following API endpoints:

| Method | Endpoint                  | Purpose             |
| ------ | ------------------------- | ------------------- |
| GET    | `/api/v1/services`        | List services.      |
| POST   | `/api/v1/services`        | Create a service.   |
| GET    | `/api/v1/services/:id`    | Retrieve a service. |
| PATCH  | `/api/v1/services/:id`    | Update a service.   |
| DELETE | `/api/v1/services/:id`    | Delete a service.   |
| GET    | `/api/v1/services/export` | Export services.    |

## Messages

The feature translations are stored in `src/features/services/messages/en.json` and `src/features/services/messages/ar.json`, under the `services` namespace. The English namespace must be registered in `src/messages/index.ts`.

The English translation file defines these keys:

- `services`
- `new_service`
- `id`
- `services_dt_name`
- `section_details`
- `service_lowercase`
- `noun_services`
- `enter_name`
- `name_too_long`
- `saved_toast`
- `deleted_toast`
- `edit_action_named`
- `delete_action_named`
- `delete_title`
- `delete_body`
- `empty_heading`
- `empty_body`
- `no_match_heading`
- `no_match_body`
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
