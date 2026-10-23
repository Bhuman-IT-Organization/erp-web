# Predefined Replies

## Purpose

Provide a Next.js screen at `/setup/predefined-replies` to manage predefined replies previously managed through the Perfex Setup > Support > Predefined Replies screen.

The screen will support listing, creating, viewing, updating and deleting predefined replies using the project's shared UI components and the approved backend API.

Access is administrators only. The three routes must use `ADMIN_GATE` in `erp-web/src/config/route-gates.ts`. The corresponding backend gates must also be confirmed during implementation.

## Legacy screen

Perfex screen: Setup > Support > Predefined Replies.

Legacy URL: `/admin/tickets/predefined_replies`.

The legacy screen should be inspected before implementation to confirm its layout, fields, editor toolbar and behaviour. The legacy repository is read-only and must not be modified.

## Legacy parity

The migrated screen must preserve the following behaviour:

- Display the numeric reply ID, reply name and rich-text HTML message.
- Require a name with a maximum length of 191 characters.
- Support creating, editing and deleting replies.
- Allow deletion without checking for references.
- Restrict access and saving to administrators.
- Preserve supported rich-text formatting, subject to the approved HTML sanitisation rules.
- Keep the ticket-level “Save as predefined reply” action on Perfex.
- Sanitise HTML before saving and before displaying it, using the approach approved by the lead.

## Dropped on purpose

- **Moving “Save as predefined reply” into Node:** this ticket-level action remains on Perfex.
- **Editing legacy Perfex source:** the legacy repository remains read-only.
- **Creating a new shared rich-text editor without approval:** check Storybook for an existing component and ask the lead if none is suitable.

Any other dropped behaviour must be documented after inspecting the legacy screen.

## Routes

Planned routes:

- `/setup/predefined-replies` — list predefined replies.
- `/setup/predefined-replies/new` — create a reply.
- `/setup/predefined-replies/:id` — view or edit a reply.

The expected Next.js route files are:

- `app/(shell)/setup/predefined-replies/page.tsx`
- `app/(shell)/setup/predefined-replies/new/page.tsx`
- `app/(shell)/setup/predefined-replies/[id]/page.tsx`
- `app/(shell)/setup/predefined-replies/error.tsx`

These paths are plans, not implemented files. Confirm their alignment with the existing frontend conventions before implementation.

## Data

The feature manages `tbltickets_predefined_replies` through the backend API.

### List columns

- **ID** — numeric reply ID.
- **Name** — reply name, maximum 191 characters.
- **Message** — rich-text HTML content. Unsafe HTML must not be executed or rendered.

### Form fields

- **Name** — required text field, maximum 191 characters.
- **Message** — rich-text HTML editor, using an existing shared component if suitable.

### Planned API calls

- `GET /api/v1/predefined-replies` — list replies.
- `GET /api/v1/predefined-replies/:id` — retrieve a reply.
- `POST /api/v1/predefined-replies` — create a reply.
- `PATCH /api/v1/predefined-replies/:id` — update a reply.
- `DELETE /api/v1/predefined-replies/:id` — delete a reply.

These endpoints are planned and must be confirmed with the backend README and implementation.

HTML sanitisation must be confirmed with the lead. Do not assume a helper or library before that decision is made.

## Messages

All user-facing text must use the project's message system.

- Provide English and Arabic translations.
- Register the feature's message namespace in `src/messages/index.ts` according to the existing conventions.
- Check Arabic right-to-left layout.
- Confirm the final message keys and translations during implementation.

The exact message keys are not yet confirmed.

## How to run its tests

Planned feature test command:

```bash
corepack yarn test src/features/predefined-replies
```

The feature implementation, tests and stories must be added after the documentation review is approved.
