# Predefined Replies

## Purpose

The Predefined Replies feature lets administrators create, view, edit, delete, and export reusable ticket responses.

The frontend uses `ListPageTemplate` for the list and `SchemaForm` for creating and editing replies.

## Navigation and access

The screen is available under Setup → Support → Predefined Replies.

All three routes use `ADMIN_GATE` in `src/config/route-gates.ts`, matching the backend route-gate contract.

## Routes

- `/setup/predefined-replies` — List predefined replies.
- `/setup/predefined-replies/new` — Create a predefined reply.
- `/setup/predefined-replies/:id` — Edit an existing reply.

## List

The list displays the Name column only.

Available actions:

- Create a new predefined reply.
- Open or edit an existing reply.
- Delete a reply after confirmation.
- Export predefined replies using the list export functionality.

The export endpoint is `/api/v1/predefined-replies/export`. The configured export column is `name`.

The list supports the search, sorting, pagination, empty states, and error handling provided by `ListPageTemplate`.

## Form

The form contains:

- Name — required, maximum 191 characters.
- Message — optional.

The message is displayed and edited as plain text, not rendered as HTML.

When the API returns `hasOtherFormatting: true`, the form warns that saving removes existing formatting.

The form also explains that leaving an empty line starts a new paragraph.

Create and update operations use the shared save hooks and form validation.

## API

- `GET /api/v1/predefined-replies` — List.
- `GET /api/v1/predefined-replies/:id` — Detail.
- `POST /api/v1/predefined-replies` — Create.
- `PATCH /api/v1/predefined-replies/:id` — Update.
- `DELETE /api/v1/predefined-replies/:id` — Delete.
- `GET /api/v1/predefined-replies/export` — Export.

API endpoint definitions are in `api/predefined-replies.endpoints.ts`.

## Localization

Feature messages are defined in:

- `messages/en.json`
- `messages/ar.json`

The feature uses the `predefined-replies` translation namespace and shared `common` messages.

## Tests and Storybook

Tests cover the feature's API, schema, list, form, and routes.

Form stories include create, edit, formatting warning, loading and error states, right-to-left layout, and mobile viewport.

Run feature tests:

```bash
yarn test src/features/predefined-replies
```

Run TypeScript validation:

```bash
yarn tsc --noEmit
```
