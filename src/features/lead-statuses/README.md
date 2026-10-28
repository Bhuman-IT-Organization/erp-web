# Lead Statuses

## Purpose

Migrate the Perfex Lead Statuses management screen to the Next.js ERP frontend.

Administrators can view, add, edit, and delete lead statuses through the Node.js API.

The new frontend uses the shared ERP components, API hooks, route permissions, and English/Arabic translations.

## Legacy screen

`application/views/admin/leads/manage_statuses.php`

The Add/Edit form is in `application/views/admin/leads/status.php`.

Legacy URL: `/admin/leads/statuses`

The legacy controller is `application/controllers/admin/Leads.php`.

## Legacy parity

- Only administrators can manage lead statuses.
- Display the status name, color, and order.
- Allow administrators to create and edit statuses.
- Validate the status name with a maximum length of 50 characters.
- Preserve the stored status color.
- A new status receives the next available order number by default.
- The built-in Customer status (`isdefault = 1`) cannot be deleted.
- The configured default lead status cannot be deleted.
- A status referenced by leads cannot be deleted.
- A status referenced by email integration cannot be deleted.
- Show appropriate messages when deletion is refused.
- Preserve the legacy quick-add functionality on Perfex, controlled by `staff_members_create_inline_lead_status`.

## Dropped on purpose

- The old Perfex management screen is replaced by the Next.js management screen.
- Legacy HTML form submission is replaced by API-based create and update operations.
- The Perfex quick-add functionality remains unchanged.
- Other existing lead management features remain outside this migration.

## Routes

Frontend routes:

- `/setup/lead-statuses` - List lead statuses.
- `/setup/lead-statuses/new` - Add a lead status.
- `/setup/lead-statuses/:id` - Edit a lead status.

Backend API routes:

- `GET /api/v1/lead-statuses`
- `GET /api/v1/lead-statuses/export`
- `GET /api/v1/lead-statuses/:id`
- `POST /api/v1/lead-statuses`
- `PATCH /api/v1/lead-statuses/:id`
- `DELETE /api/v1/lead-statuses/:id`

All management routes require administrator access.

## Data

The existing database table is `tblleads_status`.

Fields:

- `id` - Unique status identifier.
- `name` - Status name, maximum 50 characters.
- `statusorder` - Display order.
- `color` - Stored hexadecimal color.
- `isdefault` - Identifies the built-in Customer status.

The API also exposes information about the configured default status and status usage.

The frontend uses Zod schemas and the shared API hooks to validate and process data.

## Messages

Feature translations are stored in:

- `src/features/lead-statuses/messages/en.json`
- `src/features/lead-statuses/messages/ar.json`

The namespace is `lead-statuses`.

The message packs are registered in `src/messages/index.ts`.

All user-facing feature labels and messages should use translations rather than hardcoded text.

## How to run its tests

From the `erp-web` project directory, run:

```sh
corepack yarn vitest run src/__tests__/feature-shape.test.ts
```

Run the frontend checks:

```sh
corepack yarn check
```

Verify the list, create, edit, delete, validation, permissions, and refusal cases in the browser.

The frontend migration is still being verified. Missing tests, Storybook states, and Nginx routing must be completed before final sign-off.

The frontend migration is implemented and is undergoing final verification.

- Lead Statuses feature tests and TypeScript typecheck have passed locally.
- Storybook includes loading, empty, error, loaded, mobile, and Arabic RTL list states, plus form states for create, edit, loading, pending, validation errors, server errors, mobile, and Arabic RTL.
- Before final sign-off, verify the stories visually, confirm frontend and API routing, and run the required project checks.
