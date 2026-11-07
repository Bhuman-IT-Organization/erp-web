# Todo

## Purpose

Todo is the modernised ERP feature for managing personal to-do items.

- List: `/setup/todo`
- Create: `/setup/todo/new`
- Edit: `/setup/todo/:id`

Staff can manage their own todos. Administrators can view and manage todos belonging to all staff members.

## Legacy screen

None: The Todo feature uses the existing tbltodos database table; no standalone legacy PHP view is owned by this feature.

## Legacy parity

| Legacy step                   | Node step                                                 |
| ----------------------------- | --------------------------------------------------------- |
| Open the Todo screen.         | Open `/setup/todo` from modern ERP navigation.            |
| View unfinished todos.        | View the Unfinished to do's section.                      |
| View recently finished todos. | View the Latest finished to do's section.                 |
| Load more todos.              | Use Load more in the corresponding section.               |
| Add a todo.                   | Open `/setup/todo/new`, enter a description, and save.    |
| Edit an existing todo.        | Open `/setup/todo/:id`, update the description, and save. |
| Delete a todo.                | Delete using the modern confirmation dialog.              |

## Screen features

- **Sections:** Unfinished to do's and Latest finished to do's.
- **Load more:** Each section has its own Load more action.
- **Create:** New Todo button opens the create form.
- **Description:** A todo contains a description.
- **Access:** Staff can access their own todos. Administrators can access todos belonging to all staff.
- **Ownership:** The authenticated staff member is assigned when a todo is created. The frontend must not allow users to choose another `staffid`.
- **Status:** Todos can be unfinished or finished.
- **Confirmation:** Delete actions use the shared confirmation dialog.

## Dropped on purpose

None confirmed.

## Routes

- `/setup/todo` — Todo list page.
- `/setup/todo/new` — Create a todo.
- `/setup/todo/:id` — Edit an existing todo.

Todo routes must allow both staff and administrators. Do not use `ADMIN_GATE` for these routes.

## Data

The feature uses the existing legacy database table `tbltodos`. No new table is required.

| Field          | Description                             |
| -------------- | --------------------------------------- |
| `todoid`       | Todo record identifier.                 |
| `description`  | Todo description.                       |
| `staffid`      | Staff member associated with the todo.  |
| `dateadded`    | Date the todo was added.                |
| `finished`     | Indicates whether the todo is finished. |
| `datefinished` | Date the todo was finished; nullable.   |
| `item_order`   | Todo display order; nullable.           |

### Ownership rules

- Normal staff members can access only records where `staffid` matches their authenticated staff ID.
- Administrators can access todos belonging to all staff members.
- When creating a todo, the backend must assign `staffid` from the authenticated user.
- The backend must enforce ownership for detail, update, and delete operations.
- The frontend must not be treated as the security boundary.

## API endpoints

The following endpoints define the frontend API contract.

| Method | Endpoint           | Purpose          |
| ------ | ------------------ | ---------------- |
| GET    | `/api/v1/todo`     | List todos.      |
| POST   | `/api/v1/todo`     | Create a todo.   |
| GET    | `/api/v1/todo/:id` | Retrieve a todo. |
| PATCH  | `/api/v1/todo/:id` | Update a todo.   |
| DELETE | `/api/v1/todo/:id` | Delete a todo.   |

The list API must support separating unfinished and finished todos and loading more records for each section.

## Messages

Translations are stored in:

- `src/features/todo/messages/en.json`
- `src/features/todo/messages/ar.json`

Both files use the `todo` namespace. The English namespace must be registered in `src/messages/index.ts`.

The English translation file defines these keys:

- `todo`
- `new_todo`
- `id`
- `description`
- `section_details`
- `todo_lowercase`
- `noun_todos`
- `enter_description`
- `saved_toast`
- `deleted_toast`
- `completed_toast`
- `edit_action_named`
- `delete_action_named`
- `delete_title`
- `delete_body`
- `date_added`
- `status`
- `finished`
- `unfinished`
- `unfinished_todos`
- `finished_todos`
- `no_unfinished_todos`
- `no_finished_todos`
- `load_more`
- `mark_completed`
- `mark_uncompleted`
- `empty_heading`
- `empty_body`
- `no_match_heading`
- `no_match_body`
- `errors.ERP-CORE-0004`

Keep the Arabic translation key set consistent with the English translation file.

## How to run its tests

Run the feature shape test:

```bash
corepack yarn test src/__tests__/feature-shape.test.ts
```

Run the Todo-specific tests:

```bash
corepack yarn test src/features/todo
```

The feature shape test checks:

- README structure.
- File naming.
- Colocated component stories.
- Test files.
- Translation messages.
- Required story exports.

List component stories should export:

- `Loading`
- `Empty`
- `Error`
- `Loaded`
