# knowledge-base

## Purpose

Knowledge Base of the modernised ERP: the list at `/setup/knowledge-base`, the groups screen at `/setup/knowledge-base/groups`, the create form at
`/setup/knowledge-base/new` and the record form at `/setup/knowledge-base/:id`. It started as a copy
of erp-docs 05-templates/frontend-feature, on the recipe the Cost Centers feature proved. Node owns
`tblknowledge_base` and `tblknowledge_base_groups` and every write goes through erp-api `src/v1/knowledge-base`.

**Main Menu item** (D-25): Node item stays in `src/config/navigation.ts`, `knowledge-base`, under
`/setup` (D-05). On all routes the sidebar opens the menu with Knowledge Base marked, and the
breadcrumb comes from the menu tree (`activeTrailOf`).

**Administrators only** (D-06, D-26): The routes are `ADMIN_GATE` in `src/config/route-gates.ts`,
the mirror of `@erp/contracts`' `ROUTE_GATES`, the menu item reads the same gate through `navGateOf`,
and screens sit behind `withAuth(withPermission(...))`: a non-administrator sees the kit's
"no access" state once `/me` has answered, and the screen asks the api for nothing.

**Names are text.** Node accepts a trimmed name of 1 to 255 characters, every character allowed, `<`
and `>` included, and a name another knowledge base or group already holds. A name is rendered as React text
only, never as raw HTML, in the list cell, the delete dialog, the form title and the breadcrumb (T-4.1-91).

## Legacy screen

`application/views/admin/knowledge_base/articles.php` and `manage_groups.php` are the legacy screens.
The modern list keeps the header with Groups link and Kanban toggle, and provides the Groups management view with modal editing.

## Legacy parity

Flow parity (FE-18, D-29): someone who used the Perfex screen does the same job in the same order, with the same business outcome.

| Perfex screen (`knowledge_base/articles.php`, `manage_groups.php`)    | Node step (`KnowledgeBaseList.tsx`, `KnowledgeBaseGroups.tsx`) |
| --------------------------------------------------------------------- | -------------------------------------------------------------- |
| Knowledge Base page header with Groups link and View Kanban           | Same header rendered in `KnowledgeBaseList.tsx`                |
| Groups management page with Articles link and New Group button        | Same screen in `KnowledgeBaseGroups.tsx`                       |
| New Group modal dialog with name, color, description, order, disabled | `KnowledgeBaseGroupModal.tsx` matching fields 1:1              |
| Groups table with name + article count, active toggle, options        | Same table with active switch, edit and delete actions         |

## Dropped on purpose

Each change, with its reason, for the lead's checkpoint:

- **Modal group management:** The modern screen provides an inline dialog for fast add/edit operations.
- **Administrators only:** Node's routes and API are administrator-only.
- **Unchanged:** Duplicate names and color formats are accepted, as in Perfex.

## Routes

All live in the shell's route group, gated `ADMIN_GATE` in `src/config/route-gates.ts`:

- `/setup/knowledge-base` (`app/(shell)/setup/knowledge-base/page.tsx`): articles list with header links
- `/setup/knowledge-base/groups` (`app/(shell)/setup/knowledge-base/groups/page.tsx`): groups list & management
- `/setup/knowledge-base/new` (`app/(shell)/setup/knowledge-base/new/page.tsx`): create knowledge base article
- `/setup/knowledge-base/:id` (`app/(shell)/setup/knowledge-base/[id]/page.tsx`): view/edit knowledge base article

## Data

`api/knowledge-base.endpoints.ts`, `KNOWLEDGE_BASE_ENDPOINTS`: the calls erp-api `src/v1/knowledge-base` serves.

| call                                                            | used by                              | note                                                                                                                                    |
| --------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/knowledge-base?q&sort&limit&cursor`                | `ListPageTemplate`                   | BE-19 keyset grammar, the ID descending by default, `id` and `name` sort; a row is the whole record: `{ id, name, dateCreated, usage }` |
| `GET /api/v1/knowledge-base/export?format&q&sort&column&header` | `ListPageTemplate` (the Export menu) | CSV, Excel, PDF or the print rows; `id`, `name`, `dateCreated` (`KNOWLEDGE_BASE_EXPORT_COLUMNS`), one translated header each            |
| `GET /api/v1/knowledge-base/:id`                                | `useKnowledgeBase`                   | the record; a row opened from the list seeds it (D-35)                                                                                  |
| `POST /api/v1/knowledge-base`                                   | `useSaveKnowledgeBase().create`      | `{ name }`; a name another knowledge base holds is accepted; never retried                                                              |
| `PATCH /api/v1/knowledge-base/:id`                              | `useSaveKnowledgeBase().update`      | `{ name }`; 404 `ERP-CORE-0004` when it was deleted meanwhile, shown inside the save summary; never retried                             |
| `DELETE /api/v1/knowledge-base/:id`                             | `useDeleteKnowledgeBase`             | 204; 409 `ERP-KNOWLEDGEBASE-0001` while in use; 404 `ERP-CORE-0004`; never retried                                                      |
| `GET /api/v1/knowledge-base/groups?q`                           | `KnowledgeBaseGroups`                | list of groups with article counts                                                                                                      |
| `POST /api/v1/knowledge-base/groups`                            | `KnowledgeBaseGroupModal`            | creates a new knowledge base group                                                                                                      |
| `PATCH /api/v1/knowledge-base/groups/:id`                       | `KnowledgeBaseGroupModal`            | updates an existing knowledge base group                                                                                                |
| `DELETE /api/v1/knowledge-base/groups/:id`                      | `KnowledgeBaseGroups`                | deletes a group if not referenced                                                                                                       |

## Messages

`messages/en.json`, namespace `knowledge-base`, registered in `src/messages/index.ts`.

## How to run its tests

```bash
corepack yarn test src/features/knowledge-base
```
