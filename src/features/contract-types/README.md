# contract-types

## Purpose

The Contract Types management screen: a list, a create screen and an edit screen over the resource `/api/v1/contract-types`, replacing Perfex's `admin/contracts/types` screen. The list uses `ListPageTemplate` (URL state, settled search, sorting by Name descending by default, pagination, and multi-format export: CSV, Excel, PDF, Print); the form is `SchemaForm` with sticky actions and unsaved-changes guarding. Both screens are protected by `ADMIN_GATE`. Staff can add a type straight from the contract form (`/admin/contracts/type`); that quick add stays on Perfex and is not blocked.

## Legacy screen

`application/views/admin/contracts/manage_types.php` with `application/views/admin/contracts/contract_type.php` (the list and modal dialog).

## Flow parity

| Perfex step | Node step |
| --- | --- |
| `manage_types.php` displays Name and the number of contracts using each type | `ContractTypesList.tsx` displays the Name column with the number of contracts badge inline |
| Quick add on the contract form (`/admin/contracts/type`) | Stays on Perfex; Perfex still reads and writes `tblcontracts_types` |
| Delete refused when contracts use the contract type (`tblcontracts.contract_type`) | Refused with 409 `ERP-CONTRACTTYPES-0001` when referenced by `tblcontracts` or `tblgoals` |
| Export (CSV / Excel / PDF / Print) exports loaded rows | Export covers every matching row with columns `name` and `contracts` |

## Dropped on purpose

- **Current-page-only export**: Perfex exports only the rows its table has loaded; Export here covers every row matching the search, filters and sort, with no page-size step.
- **Arabic PDF, parked**: the PDF's standard font cannot draw Arabic, so the Export menu offers no PDF under a right-to-left locale; Print keeps every language.

## Routes

All three live in the shell's route group, so they get the sidebar and the topbar, and each is gated `ADMIN_GATE` in `src/config/route-gates.ts`:

- `/setup/contract-types` (`app/(shell)/setup/contract-types/page.tsx`): renders `pages/ContractTypesListPage.tsx`.
- `/setup/contract-types/new` (`app/(shell)/setup/contract-types/new/page.tsx`): renders `pages/ContractTypesPage.tsx` with no id: "New Contract Type".
- `/setup/contract-types/:id` (`app/(shell)/setup/contract-types/[id]/page.tsx`): renders `pages/ContractTypesPage.tsx` with id.
- `app/(shell)/setup/contract-types/error.tsx`: segment error boundary.

## Data

`api/contract-types.endpoints.ts`: `CONTRACT_TYPES_ENDPOINTS`, the table of calls (method and path) the api module serves and the hooks send; `CONTRACT_TYPES_PATH`, `CONTRACT_TYPES_EXPORT_PATH` and `contractTypesPath(id)` derive from it. `CONTRACT_TYPES_EXPORT_COLUMNS` (`name`, `contracts`). `CONTRACT_TYPES_ERRORS`: `ERP-CORE-0004` (not found) and `ERP-CONTRACTTYPES-0001` (in-use delete refusal).

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
