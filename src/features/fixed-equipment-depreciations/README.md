# fixed-equipment-depreciations

## Purpose

The Depreciations settings screen of Fixed Equipment, moved from Perfex to Node: the list of
depreciation terms (a name and a number of months) that assets and asset models refer to, with
add, edit, delete and export. Built from the kit (`ListPageTemplate`, `SchemaForm`,
`ConfirmDialog`); every visible text is a message key.

## Legacy screen

`modules/fixed_equipment/views/settings/depreciations.php` (Perfex's
`admin/fixed_equipment/settings?tab=depreciations` tab, with the `Fixed_equipment` controller's
`depreciations_table`, `add_depreciations` and `delete_depreciations` actions).

## Legacy parity

| Perfex                                                                                                                                      | Node                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| the list: ID, Name (`fe_name`) and Term (`fe_term`, shown as `<term> fe_months`), newest first                                              | the same three columns and order; the name as the link; the Term as one plural message (`term_months`); server search, sort by ID or name, the pager and the Export menu                                                                                                                         |
| Add (`add`) opens the "Add Depreciations" modal (`fe_add_depreciations`)                                                                    | Add opens `/new`, titled `fe_add_depreciations`                                                                                                                                                                                                                                                  |
| the fields: Depreciation Name (`fe_depreciation_name`) and Number of Months (`fe_number_of_months`, a number input), both required          | the same two fields and labels; the name at most 200 characters (the column's length); the months a whole number greater than 0                                                                                                                                                                  |
| Edit (`fe_edit_depreciations`) opens the modal with the values prefilled                                                                    | Edit opens `/:id` prefilled, titled `fe_edit_depreciations` (the page heading shows the record's name); every save is confirmed by a summary of what changes                                                                                                                                     |
| Delete (`delete_depreciations/<id>`), with no check on the assets or models that use it                                                     | Delete with a confirm dialog; while an asset model or an asset uses it the api refuses with 409 `ERP-FIXEDEQUIPMENTDEPRECIATIONS-0001`, and with 409 `ERP-FIXEDEQUIPMENTDEPRECIATIONS-0002` when its use could not be checked, each shown inside the dialog; a 404 when it was deleted meanwhile |
| the tab shows Add, Edit and Delete to the depreciation settings group and to the assets, licenses, accessories and consumables groups       | Add, Edit and Delete show when the member holds that action's code in any of the tab's five groups (`FIXED_EQUIPMENT_SETTINGS_CODES.depreciation`); a form opened without it (`create` on `/new`, `edit` on `/:id`) is read-only, with no Save                                                   |
| access: the depreciation settings group's view and view own, and the four item groups' (`modules/fixed_equipment/views/manage_setting.php`) | gated by any view or view-own code of the tab's five groups (`ROUTE_GATES`: `[...read.all, ...read.own]` of `FIXED_EQUIPMENT_SETTINGS_CODES.depreciation`); view own shows the rows the member created                                                                                           |

## Dropped on purpose

- **Difference: Perfex's modal.** Add and edit open their own pages, as every migrated screen does.
- **Difference: full view and view own together.** A member holding both a full view and a view own
  of the five groups reads every row; Perfex narrows them to their own rows.
- **Difference: the six other groups.** The other Fixed Equipment groups that reached this tab only
  by typing its URL no longer open it.
- **Difference: the writes.** Add, edit and delete require one of the five groups' action codes;
  Perfex's write actions checked nothing.
- **Difference: the read-only form.** A form opened without the code to save (`create` on `/new`,
  `edit` on `/:id`) shows its fields locked, with no Save; Perfex has no read-only form.
- **Difference: "No data changes".** Perfex saves and answers "no data changes"; here a form with no
  changes has Save disabled.
- **Difference: the number of months.** Perfex accepted 0, negative and decimal months; the form and
  the api require a whole number greater than 0.
- **Difference: deleting a depreciation in use.** Perfex deleted it even while an asset model or an
  asset pointed at it; the api now refuses that delete with 409.
- **Difference: no search or sort on Term.** Perfex's table searches and sorts the Term column; here
  the search covers the name (and the id) and the sort the ID and the name.
- **Difference: the Term in the export.** The export writes the number of months, `12`, where
  Perfex's cell shows `12 months`.
- **Difference: a Term with no value.** Perfex shows " months"; the list shows "None". In the export,
  PDF and Print write the blank label ("None"), and CSV and Excel leave the cell empty.
- **Difference: the Arabic PDF.** The Arabic PDF export is parked: it is not offered yet.
- **Perfex's Arabic text:** the Fixed Equipment module ships no Arabic language file, so
  `messages/ar.json` holds this feature's own translations of the same keys.

## Routes

- `/setup/fixed-equipment-depreciations`: the list, titled `fe_depreciations`
- `/setup/fixed-equipment-depreciations/new`: the add form, titled `fe_add_depreciations`
- `/setup/fixed-equipment-depreciations/:id`: the edit form, titled `fe_edit_depreciations`; an id
  that is not a positive integer is `notFound()`

All three carry the gate `[...read.all, ...read.own]` of `FIXED_EQUIPMENT_SETTINGS_CODES.depreciation`
(`src/config/fixed-equipment-settings.ts`) in `src/config/route-gates.ts`, the same as erp-api's
`@erp/contracts`. The tab has no menu item of its own in Perfex, so none is added; the old tab URL
redirects to the list at Nginx.

## Data

`api/fixed-equipment-depreciations.endpoints.ts`, `FIXED_EQUIPMENT_DEPRECIATIONS_ENDPOINTS`: the six
calls erp-api `src/v1/fixed-equipment-depreciations` serves. Reads go through `useCommonApi` and
writes through `useCommonMutation`, never through a hand-written client.

| call                                                             | used by                                       | note                                                                                                                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/fixed-equipment-depreciations?q&sort&limit&cursor`  | `ListPageTemplate`                            | BE-19 keyset grammar; a row is the whole record: `{ id, name, term }`                                                                                                            |
| `GET /api/v1/fixed-equipment-depreciations/export?q&sort&format` | `ListPageTemplate`'s Export menu              | `id`, `name` and `term`; csv, xlsx, pdf or print; the list's search and sort; a row with no term is "None" in PDF and Print (the blank label) and an empty cell in CSV and Excel |
| `GET /api/v1/fixed-equipment-depreciations/:id`                  | `useFixedEquipmentDepreciations`              | the record; a row opened from the list seeds it                                                                                                                                  |
| `POST /api/v1/fixed-equipment-depreciations`                     | `useSaveFixedEquipmentDepreciations().create` | `{ name, term }`, the months as a number; a duplicate name is accepted; never retried                                                                                            |
| `PATCH /api/v1/fixed-equipment-depreciations/:id`                | `useSaveFixedEquipmentDepreciations().update` | `{ name, term }`; 404 `ERP-CORE-0004` when it was deleted meanwhile; never retried                                                                                               |
| `DELETE /api/v1/fixed-equipment-depreciations/:id`               | `useDeleteFixedEquipmentDepreciation`         | 204; 409 `ERP-FIXEDEQUIPMENTDEPRECIATIONS-0001` (in use) or `ERP-FIXEDEQUIPMENTDEPRECIATIONS-0002` (its use could not be checked); 404 `ERP-CORE-0004`; never retried            |

- The form holds the number of months as text, as an input does; `toFixedEquipmentDepreciationsBody`
  turns it into the number the api takes.
- After a 404 on delete the list pages ask again; a 409 refusal stays inside the dialog and asks
  nothing. After an edit opened from the list, the saved record is swapped into the cached list
  pages (no list request); after a create, or an edit of a permalink, the list pages ask again.
- A 400 `ERP-VALIDATION-0001` carries `issues`, zod-parsed before `setError`; the api's text is
  never rendered. `name` and `term` are the issue targets.

## Messages

`messages/en.json` and `messages/ar.json`, registered in `src/messages/index.ts`. Perfex's own keys
and English text for everything Perfex shows: the core's `id` and `add`, and the module's
`fe_depreciations`, `fe_add_depreciations`, `fe_edit_depreciations`, `fe_name`, `fe_term`,
`fe_depreciation_name` and `fe_number_of_months` (`messages/__tests__/messages.test.ts` pins the
English). The Term cell is this screen's own plural message, `term_months`, with all six Arabic
forms. The other keys (toasts, the empty state, the delete dialog, the form errors) are this
screen's own.

## How to run its tests

```bash
corepack yarn test src/features/fixed-equipment-depreciations
```
