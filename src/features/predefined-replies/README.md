# Predefined Replies

## Purpose

Manage reusable replies for support tickets from the administrator-only Setup screen.

## Legacy screen

`application/views/admin/tickets/predefined_replies/manage.php`

## Legacy parity

- List replies by name.
- Create, edit and delete replies.
- Export replies.
- Display messages as plain text.
- Warn when saving removes formatting.

The list contains only the **Predefined Reply Name** column; Perfex does not show a Message column in this list.

## Dropped on purpose

- The form uses a plain text box rather than Perfex's rich-text editor. The API stores the reply as plain text, so the editor's formatting controls would imply formatting support that is not preserved. Existing formatting is detected and users are warned that it will be removed on save.
- The ticket-side **Save as predefined reply** action remains in Perfex; this screen covers management only.
- There is no duplicate menu entry. The screen appears once under Setup → Support → Predefined Replies.

## Access

The list, create and edit routes are administrators only.

## Routes

- `/setup/predefined-replies`
- `/setup/predefined-replies/new`
- `/setup/predefined-replies/:id`

## Perfex language keys

- `predefined_replies_dt_name` — list column heading: **Predefined Reply Name**.
- `predefined_reply_add_edit_name` — form name label: **Predefined Reply Name**.

## Data

Uses the predefined-replies API for CRUD operations and export. List rows contain `{ id, name }`; the record endpoint supplies the message used by the form.

## Messages

English and Arabic translations are provided.

## How to run its tests

Run: `corepack yarn test src/features/predefined-replies`
