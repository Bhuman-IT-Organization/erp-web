# Lead Sources (`tblleads_sources`)

## Purpose

The feature provides the administrator setup list at `/setup/lead-sources`, the create form at
`/setup/lead-sources/new` and the record form at `/setup/lead-sources/:id`. Writes go through the
erp-api `src/v1/lead-sources` module.

Perfex's quick-add on the lead form remains in Perfex. The modernized setup pages do not replace or
block that workflow.

**Names are text.** The form trims the name, requires 1–150 characters and accepts any text,
including `<` and `>`. Duplicate names are allowed. Names are rendered as text, never raw HTML.

## Legacy screen

`application/views/admin/leads/manage_sources.php` is the Perfex list and form. The related actions
are in `application/controllers/admin/Leads.php`; source persistence is in
`application/models/Leads_model.php`.

Perfex's list columns are ID, Source Name and Options. The form has one field, Source Name. The table
is `tblleads_sources`; this feature uses its `id` and `name`.

## Legacy parity

The Node list shows ID and Source Name, with the template's Edit and Delete actions and the
lead count beneath each name. It sorts by name ascending by default, searches the name or an exact
ID, and supports paging.

The create and edit forms each have one field, Source Name. Create opens a confirmation summary
before saving; edit shows the name change in its summary. On success, the user returns to the list
and sees a toast.

Only administrators can use the routes. The list refuses deletion up front and shows one line for
each non-zero usage group; Delete is disabled while any group is in use. The API checks again when
deleting to cover changes made after the list was loaded. The groups are leads assigned to the
source, email integrations and web-to-lead forms:

```ts
{
  leads: number;
  emailIntegrations: number;
  webToLeadForms: number;
}
```

`ERP-LEADSOURCES-0001` is the in-use refusal and uses Perfex's `is_referenced` wording.
`ERP-LEADSOURCES-0002` refuses deletion of the configured default source
(`leads_default_source`). The setting is handled by the API through `SettingsFacade`.

## Dropped on purpose

- **Perfex's quick-add remains on Perfex.** This setup feature does not replace or block the lead
  form's inline source workflow.
- **The legacy delete link and browser confirmation** are replaced by the named `ConfirmDialog`.
  The in-use reasons appear before a delete is attempted; a live API refusal covers a race.
- **The legacy alert wording and submit/cancel controls** are replaced by the save summary, toast
  and verb-plus-noun buttons.
- **Perfex's activity log is not written by Node.** Domain events and service logging record writes.
- **Arabic PDF export is not offered** because the PDF font does not support Arabic. Print remains
  available in Arabic.

## Routes

All three pages are administrator-only and live in the shell route group.

- `/setup/lead-sources`: list page; search, sort and pagination state are in the URL.
- `/setup/lead-sources/new`: create form.
- `/setup/lead-sources/:id`: edit form; the ID must be a positive integer.

The pages use the shell navigation and breadcrumb. Anonymous visitors are sent to `/login`; a
non-administrator is refused before the list or record API is requested.

## Data

`api/lead-sources.endpoints.ts` describes the routes served by erp-api:

| Call                                                          | Used by                       | Behavior                                                                                                            |
| :------------------------------------------------------------ | :---------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/lead-sources?q&sort&limit&cursor`                | `ListPageTemplate`            | Paginated list; rows contain `{ id, name, usage }`. Name sorts ascending by default; `id` and `name` can be sorted. |
| `GET /api/v1/lead-sources/export?format&q&sort&column&header` | Export menu                   | Exports ID, Source Name and Total Leads for CSV, Excel, PDF where supported, or Print.                              |
| `GET /api/v1/lead-sources/:id`                                | `useLeadSources`              | Reads the record; a row opened from the list seeds the form.                                                        |
| `POST /api/v1/lead-sources`                                   | `useSaveLeadSources().create` | Creates a source from `{ name }`; never retried.                                                                    |
| `PATCH /api/v1/lead-sources/:id`                              | `useSaveLeadSources().update` | Renames a source from `{ name }`; never retried.                                                                    |
| `DELETE /api/v1/lead-sources/:id`                             | `useDeleteLeadSource`         | Deletes the source; may refuse with 409 when it is in use or is the default. Never retried.                         |

The usage object is neither a list column nor a separate export column. The list's name subtext
shows `usage.leads`; the delete dialog shows all non-zero usage groups. `totalLeads` in the export
counts leads only (`usage.leads`), matching the count shown in the list and Perfex.

After an edit opened from the list, the saved record replaces that row in cached list pages. After
a create or an edit opened from a permalink, the list pages are revalidated. Validation issues are
parsed before being mapped to the name field; API error text is not rendered directly.

## Messages

`messages/en.json` and `messages/ar.json` provide the `lead-sources` namespace. Perfex keys include
`lead_sources`, `lead_new_source`, `edit_source`, `leads_sources_table_name`,
`leads_table_total` and `leads_sources_not_found`. The namespace also contains the form, list and
dialog copy and translated errors for `ERP-CORE-0004`, `ERP-LEADSOURCES-0001` and
`ERP-LEADSOURCES-0002`.

## How to run its tests

```bash
corepack yarn test src/features/lead-sources
```
