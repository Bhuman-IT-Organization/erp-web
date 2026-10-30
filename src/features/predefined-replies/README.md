# Predefined Replies

## Purpose

Manage reusable replies for support tickets.

## Legacy screen

`application/views/admin/tickets/predefined_replies/manage.php`

## Legacy parity

- List replies by name.
- Create, edit and delete replies.
- Export replies.
- Display messages as plain text.
- Warn when saving removes formatting.

## Dropped on purpose

- Message column in the list.
- Rendering message content as HTML.
- Duplicate Main Menu entry.

## Routes

- /setup/predefined-replies
- /setup/predefined-replies/new
- /setup/predefined-replies/:id

## Data

Uses the predefined-replies API for CRUD operations and export.

## Messages

English and Arabic translations are provided.

## How to run its tests

Run: `yarn test src/features/predefined-replies`
