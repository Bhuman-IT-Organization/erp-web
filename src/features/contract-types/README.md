# contract-types

## Purpose

The Contract Types management screen: a list, a create screen and an edit screen over the resource `/api/v1/contract-types`, replacing Perfex's `admin/contracts/types` screen. The list is `ListPageTemplate` (URL state, settled search, sorting by ID and Name, pagination, and multi-format export: CSV, Excel, PDF, Print); the form is `SchemaForm` with sticky actions and unsaved-changes guarding. Both screens are protected by `ADMIN_GATE`. Staff can add a type straight from the contract form (`/admin/contracts/type`); that quick add stays on Perfex and is not blocked.

## Legacy screen

`application/views/admin/contracts/manage_types.php` with `application/views/admin/contracts/contract_type.php` (the list and modal dialog).

## Legacy parity

Class for class, top to bottom, rebuilt from its view files:

| Legacy class / element    | Component:line              |
| ------------------------- | --------------------------- |
| `manage_types.php` table  | `ContractTypesList.tsx:135` |
| `contract_type.php` modal | `ContractTypesForm.tsx:275` |

The kit already brings one restructured step; keep it when the section is filled from the view:

| Perfex step                                                                                                                                                                         | Node step                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Export (CSV / Excel / PDF / Print) exports the rows the table has loaded; to export everything the user first picks "All" in the page-size menu (`main.js:3379`, `app.js:919-1022`) | Export, then CSV, Excel, PDF or Print, exports every row matching the search, filters and sort (or only the ticked rows), with no page-size step |

## Dropped on purpose

- **Current-page-only export**: Perfex exports only the rows its table has loaded; Export here always covers every row matching the search, filters and sort, with no page-size step.
- **Arabic PDF, parked**: the PDF's standard font cannot draw Arabic, so the Export menu offers no PDF under a right-to-left locale; Print keeps every language.
- **The totals footer row**: no export writes a table footer.

## Routes

All three live in the shell's route group, so they get the sidebar and the topbar, and each is gated `ADMIN_GATE` in `src/config/route-gates.ts`:

- `/setup/contract-types` (`app/(shell)/setup/contract-types/page.tsx`): renders `pages/ContractTypesListPage.tsx`.
- `/setup/contract-types/new` (`app/(shell)/setup/contract-types/new/page.tsx`): renders `pages/ContractTypesPage.tsx` with no id: "New Contract Type".
- `/setup/contract-types/:id` (`app/(shell)/setup/contract-types/[id]/page.tsx`): renders `pages/ContractTypesPage.tsx` with id.
- `app/(shell)/setup/contract-types/error.tsx`: segment error boundary.

## Data

`api/contract-types.endpoints.ts`: `CONTRACT_TYPES_ENDPOINTS`, the table of calls (method and path) the api module serves and the hooks send; `CONTRACT_TYPES_PATH`, `CONTRACT_TYPES_EXPORT_PATH` and `contractTypesPath(id)` derive from it. `CONTRACT_TYPES_EXPORT_COLUMNS` (`id`, `name`, `dateCreated`). `CONTRACT_TYPES_ERRORS`: `ERP-CORE-0004` (not found) and `ERP-CONTRACTTYPES-0001` (in-use delete refusal).

- The list page uses `ListPageTemplate` over `CONTRACT_TYPES_PATH`.
- `hooks/use-contract-types.ts` → `useContractTypes(id)`: record read via SWR.
- `hooks/use-contract-types.ts` → `useDeleteContractType()`: deletes a contract type, invalidating list cache on success.
- `hooks/use-save-contract-types.ts` → `{ create, update }`: `POST` and `PATCH`.

## Messages

`messages/en.json` and `messages/ar.json` (namespace `contract-types`), registered in `src/messages/index.ts`. All user-facing strings are localized.

## How to run its tests

```bash
corepack yarn test src/features/contract-types
```
