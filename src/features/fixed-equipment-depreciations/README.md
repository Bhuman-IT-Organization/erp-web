# fixed-equipment-depreciations

## Purpose

Replaces Perfex's Fixed Equipment → Settings → Depreciations tab with a screen at
`/setup/fixed-equipment-depreciations`, built from the kit (`ListPageTemplate`, `SchemaForm`,
`ConfirmDialog`). This is the plan for review; it is updated with what is built.

## Legacy screen

`modules/fixed_equipment/views/settings/depreciations.php` (Perfex's
`admin/fixed_equipment/settings?tab=depreciations` tab, with the `Fixed_equipment` controller's
`depreciations_table`, `add_depreciations` and `delete_depreciations` actions).

## Legacy parity

| Perfex                                                                                      | Node (planned)                                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| the list: ID, Name and Term (`<term> months`), newest first                                 | the same columns and order; server search, sort, the pager and the Export menu |
| Add (`add_depreciations` with no id): Depreciation Name and Number of Months, both required | the `/new` page with the same two fields                                       |
| Edit (`add_depreciations` with the id): the values prefilled                                | the `/:id` page, prefilled                                                     |
| Delete (`delete_depreciations/<id>`)                                                        | Delete with a confirm dialog                                                   |
| access: `fixed_equipment_setting_depreciation` view, view own, create, edit, delete         | the same permissions, `fixedEquipment.settingDepreciation.*`                   |

## Dropped on purpose

- **Perfex's modal:** add and edit open their own pages, as every migrated screen does.
- **The other Fixed Equipment permissions:** Perfex also lets the assets, licenses, accessories and
  consumables permissions use this tab; the screen is gated by `fixedEquipment.settingDepreciation.*` only.
- **"No data changes":** saving unchanged values saves and returns to the list.

## Routes

- `/setup/fixed-equipment-depreciations`: the list
- `/setup/fixed-equipment-depreciations/new`: the add form
- `/setup/fixed-equipment-depreciations/:id`: the edit form

No menu item of its own: the tab has none in Perfex, and the old tab URL redirects to the list.

## Data

The calls erp-api's `v1/fixed-equipment-depreciations` will serve: the list, the export, one
record, create, update and delete under `/api/v1/fixed-equipment-depreciations`.

## Messages

`messages/en.json` and `messages/ar.json`, using Perfex's own wording from the Fixed Equipment
language file (`fe_depreciations`, `fe_months`, the form labels).

## How to run its tests

```bash
corepack yarn test src/features/fixed-equipment-depreciations
```
