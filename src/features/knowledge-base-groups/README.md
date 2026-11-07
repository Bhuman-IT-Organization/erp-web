# Knowledge Base Groups

## Purpose

Knowledge Base Groups management in the modernised ERP: the list at `/setup/knowledge-base-groups`,
the create form at `/setup/knowledge-base-groups/new`, and the record form at `/setup/knowledge-base-groups/:id`.
Node owns `tblknowledge_base_groups` and every write goes through erp-api `src/v1/knowledge-base-groups`.

**Permissions**: The routes are gated on `PERMISSIONS.knowledgeBase.articles.view` (`knowledgeBase.articles.view`)
in `src/config/route-gates.ts`. Row actions and buttons for New Group, Edit, Delete, and the Active toggle
are conditionally shown using `usePermissions().can` with create, edit, and delete permissions.
The form is locked with `readOnly` when the member lacks the corresponding permission.

**Names are text.** Node accepts a trimmed name of 1 to 255 characters, every character allowed, `<`
and `>` included. A name is rendered as React text only, never as raw HTML, in the list cell, the
delete dialog, the form title, and the breadcrumb.

## Legacy screen

`application/views/admin/knowledge_base/manage_groups.php` is the legacy screen.

## Legacy parity

Flow parity: someone who used the Perfex screen does the same job in the same order, with the same business outcome.

| Perfex screen (`knowledge_base/manage_groups.php`)                | Node implementation                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Groups management page with Articles link and New Group button    | `ListPageTemplate`; "Articles" links to `/admin/knowledge_base`                          |
| Groups table with name, article count, and active status          | Table columns: Name with article count, and Active switch or badge                       |
| Add or edit group name, color, short description, order, disabled | Shared `SchemaForm` at `/new` and `/:id`; slug is shown on edit only                     |
| Refuse deletion while group has articles                          | `ConfirmDialog` includes refusal text and disables confirmation when `totalArticles > 0` |
| Export group list                                                 | API export endpoint supports CSV, Excel, PDF, and print formats                          |

## Dropped on purpose

- **Difference:** The legacy popup modal dialog is replaced with dedicated create and edit page routes (`/setup/knowledge-base-groups/new` and `/setup/knowledge-base-groups/:id`) built on `SchemaForm`.
- **Unchanged:** Duplicate names and color formats are accepted, matching Perfex behavior.

## Routes

Screen routes live in the shell's route group, gated on `knowledgeBase.articles.view`:

- `/setup/knowledge-base-groups` (`app/(shell)/setup/knowledge-base-groups/page.tsx`): groups list
- `/setup/knowledge-base-groups/new` (`app/(shell)/setup/knowledge-base-groups/new/page.tsx`): create knowledge base group
- `/setup/knowledge-base-groups/:id` (`app/(shell)/setup/knowledge-base-groups/[id]/page.tsx`): edit knowledge base group

## Data

`api/knowledge-base-groups.endpoints.ts`, calls served by erp-api `src/v1/knowledge-base-groups`:

| call                                                                   | used by                               | note                                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/knowledge-base-groups?q&sort&limit&cursor`                | `ListPageTemplate`                    | Keyset grammar; rows contain `{ id, name, groupSlug, description, active, color, groupOrder, totalArticles }` |
| `GET /api/v1/knowledge-base-groups/export?format&q&sort&column&header` | `ListPageTemplate` (the Export menu)  | CSV, Excel, PDF, or print; exports ID, name, slug, description, active, and article count                     |
| `GET /api/v1/knowledge-base-groups/:id`                                | `useKnowledgeBaseGroup`               | Fetches group details for editing; seeded from row when available                                             |
| `POST /api/v1/knowledge-base-groups`                                   | `useSaveKnowledgeBaseGroups().create` | Creates a new group; never retried                                                                            |
| `PATCH /api/v1/knowledge-base-groups/:id`                              | `useSaveKnowledgeBaseGroups().update` | Updates an existing group; 404 `ERP-CORE-0004` if deleted concurrently                                        |
| `DELETE /api/v1/knowledge-base-groups/:id`                             | `useDeleteKnowledgeBaseGroup`         | Deletes a group; 409 `ERP-KNOWLEDGEBASEGROUPS-0001` when group still has articles                             |

## Messages

`messages/en.json` and `messages/ar.json`, namespace `knowledge-base-groups`, registered in `src/messages/index.ts`.

## How to run its tests

```bash
corepack yarn test src/features/knowledge-base-groups
```
