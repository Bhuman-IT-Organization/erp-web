# mail

## Purpose

Setup > Email of the modernised ERP (W2C-02, W2C-04): the emails that modules running on Node send
through the shared mail sender (erp-api `src/v1/mail`, ADR-0049): the Email Templates list at
`/setup/email-templates` (plan 04.3-08) and the template editor at `/setup/email-templates/:id`
with its live preview and "Send a test to me" (plan 04.3-09); the sent-emails log at
`/setup/sent-emails` with its entry at `/setup/sent-emails/:id` and Resend, and the read-only email
status at `/setup/email-status` with its own "Send a test to me" (`TestSend`) (plan 04.3-10). The
menu holds them in the Setup > Email container, beside Perfex's own Email Templates list.

**Gated on Perfex's own codes** (D-09, O-1): the list and the editor need
`settings.emailTemplates.view` in `ROUTE_GATES`; the Active switch and Enable All or Disable All
render only with `settings.emailTemplates.edit` (the api refuses without it regardless). The
sent-emails log, its entries and the email status are administrator-only (D-05, D-02), so the
row's "Sent emails" link is shown to administrators only. The status page never shows an SMTP user
name or password (the wire has none, T-4.3-06); the mail server's reply on an entry is text in
`<bdi>` inside a collapsed disclosure (choice 10).

**Keys, modules, locales and wording are text** (T-4.3-16, T-4.3-02): React text only, raw values
in `<bdi>`, never injected as markup. The only HTML is the api's rendered preview, inside an
`<iframe srcDoc sandbox="">` that can run no script, submit no form, navigate nowhere and reach
nothing of the app (T-4.3-14). The Perfex link is the fixed `/admin/emails` (T-4.3-32).

## Legacy screen

`application/views/admin/emails/email_templates.php` (with `application/views/admin/emails/template.php`,
`modules/timesheets/views/email_templates.php` and `application/controllers/admin/Emails.php`), and
`application/views/admin/settings/includes/email.php` for the status page's SMTP facts and its test.
The sent-emails log: None: Perfex keeps no sent-mail log; D-05 adds one. Only
the keys and the flow were read; the legacy texts come from the legacy language packs, and no
template body, subject or address was read.

## Legacy parity

| Perfex step                                                                                                                                              | Node step                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup > Email Templates: one page, a table per group (Tickets, Estimates, ..., Timesheets)                                                               | `/setup/email-templates`: one paginated list of Node's templates, sorted by module, with a Module column and filter; Perfex's list stays reachable from the notice for Perfex's own emails (D-03)                                                         |
| Each group's "Disable All" and "Enable All" links                                                                                                        | the same two buttons, shown when exactly one module is filtered; Disable All asks first, naming the count and the module                                                                                                                                  |
| Row: the name (struck through when disabled) and an Enable or Disable link                                                                               | Row: the name link and an Active switch, immediate both ways, with a toast; a member without the edit code sees an Active or Inactive badge                                                                                                               |
| Name: the template page                                                                                                                                  | the name, the row or Edit opens `/setup/email-templates/:id`, seeded from the row                                                                                                                                                                         |
| Template page: Template Title (read-only), Subject, From Name, Send as Plaintext, Disabled, the English message, each other language a collapsible block | Details (Template Title, Module and Sent to as text, an Active checkbox applied on Save), then one section per supported language, English required, the others optional, each always shown with its own subject and message in that language's direction |
| The "Available merge fields" column: every field of the template's type; a click inserts the key into the active editor                                  | "Insert merge field" beside each subject and message: this template's fields only, searchable; Enter or a click inserts at the caret of that field                                                                                                        |
| Submit: the "updated" alert, the page reloads                                                                                                            | "Save email template": the save summary, the toast, back to the exact list URL; a colleague's newer save is never overwritten (If-Match, "Reload email template")                                                                                         |
| (none)                                                                                                                                                   | the live preview, rendered by the api with sample values and the brand, and "Send a test to me" with the draft as previewed                                                                                                                               |
| (none)                                                                                                                                                   | Translation and Status filters, Languages with a "{language} missing" badge, search, the pager, every view a permalink                                                                                                                                    |
| Setup > Email Templates (one menu row)                                                                                                                   | Setup > Email: a container in the same place holding Email Templates (Node), Email Templates in Perfex, Sent emails and Email status                                                                                                                      |
| Settings > Email: the SMTP settings (editable) and "Send Test Email" to any typed address                                                                | `/setup/email-status`: the same SMTP facts read only (deployment configuration, D-02), whether the mail server answers, the last send, and "Send a test to me"; Perfex's SMTP Settings one link away for Perfex's own emails                              |
| (none)                                                                                                                                                   | `/setup/sent-emails`: the log with recipient search and the Template, Status, From date and To date filters; an entry with its reason and the mail server's reply; Resend, confirmed (D-05)                                                               |

## Dropped on purpose

- **One table per group**: one list sorted by module with a Module filter (choice 5); group heading
  rows would need a new `ListPageTemplate` mode for a list that holds four templates.
- **The struck-through name of a disabled template**: the Active column says it in words.
- **Perfex's own templates** (tickets, invoices, ...): they stay in Perfex's Email Templates until
  their module moves (D-03); the notice links there.
- **From Name per template** (`template_fromname`): the sender name is deployment configuration,
  one per deployment (D-02, O-2).
- **From Email** (`template_fromemail`): hidden in Perfex already (a deprecated field).
- **Send as Plaintext**: every Node email carries an HTML part and a plain text part from the same
  wording, so the choice has nothing to switch.
- **Rich text (TinyMCE)**: the body is plain text with merge-field insertion (UI-SPEC choice 1: no
  markup to sanitise, a labelled native textarea, correct RTL at once, no new library); a blank line
  starts a paragraph, a URL merge field becomes a link. A seeded wording that had formatting says so
  on the editor. Overrule path: TipTap (MIT) in the kit plus a server allow-list sanitiser
  (sanitize-html, MIT), approved under ADR-0017.
- **Merge fields of the whole template type**: only the template's own fields are offered.
- **Collapsible other languages**: every supported language is always shown, so a missing
  translation is visible.
- **The ticket, contact and discussion warnings**: about Perfex templates Node does not own.
- **Perfex's success alert** (`updated_successfully`): the toast.
- **Editing the SMTP settings here**: the mail setup is deployment configuration (D-02); the status
  page shows it read only and links to Perfex's SMTP Settings, which govern Perfex's own emails.
- **The test to any typed address** (`settings_send_test_email_string`): a test goes only to the
  signed-in member (choice 4), so the system cannot be used to mail arbitrary addresses.
- **Perfex's Email Queue settings** (`email_queue_enabled`, skip attachments): Perfex's own sending;
  Node always sends through its queue with retries (D-01).
- **An export of the log** (choice 13): it holds recipients' addresses, and Perfex has no such list.
- **The email's content on the log** (D-05): only who it was sent to, when and the result are
  kept; Resend renders the template's current wording with the record's current values (O-6).
- **Below `xl` the save bar ends the form column** and the preview card follows it (the kit's save
  bar is sticky inside its form); from `xl` the preview sits beside the form.

## Routes

- `/setup/email-templates` (`app/(shell)/setup/email-templates/page.tsx`): `pages/EmailTemplatesListPage.tsx`, title `mail.email_templates`.
- `error.tsx`: the segment's error boundary (never renders `error.message`).
- `/setup/email-templates/:id` (`app/(shell)/setup/email-templates/[id]/page.tsx`): `pages/EmailTemplatePage.tsx`, title `mail.email_template`; an id that is not a positive integer is `notFound()`. `?preview=<locale>` is the previewed language (replace history, default `en`). Gated on `.view`; saving and testing need `.edit` (a read-only editor without it).
- `/setup/sent-emails` (`app/(shell)/setup/sent-emails/page.tsx`): `pages/SentEmailsListPage.tsx`, title `mail.sent_emails`; administrators only. `?q=` (a recipient prefix), `filter[template][in]` (template keys and `status-test`), `filter[status][in]`, `filter[queuedAt][gte]` and `filter[queuedAt][lte]` (the URL keeps `YYYY-MM-DD`; the api gets the member's local day bounds, `schemas/sent-email-filters.ts`). Its `error.tsx` covers the entry too.
- `/setup/sent-emails/:id` (`app/(shell)/setup/sent-emails/[id]/page.tsx`): `pages/SentEmailPage.tsx`, the static title `mail.sent_email` (no recipient or template name in the history); an id that is not a positive integer is `notFound()`.
- `/setup/email-status` (`app/(shell)/setup/email-status/page.tsx`): `pages/EmailStatusPage.tsx`, title `mail.email_status`; administrators only; with its `error.tsx`.

## Data

`api/mail.endpoints.ts`, `MAIL_ENDPOINTS` (erp-api `MAIL_ROUTES`, thirteen routes), `mailPaths`,
`MAIL_ERRORS` and `STALE_CODE`. Used by this screen:

| call                                                                    | used by                | note                                                                                                                                         |
| ----------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/mail/templates`                                            | `ListPageTemplate`     | `filter[module][in]`, `filter[translation][eq]` (`complete`, `missing`), `filter[active][eq]` (`1`, `0`); sorts `module` (default) and `key` |
| `GET /api/v1/mail/templates?limit=1`                                    | `useEmailTemplates`    | the meta: every module (the Module options) and the supported locales (Languages)                                                            |
| `GET ...?filter[module][in]=<m>&filter[active][eq]=1&limit=1`           | `useEmailTemplates`    | Disable All's count: the module's active templates                                                                                           |
| `PUT /api/v1/mail/templates/:id/active`                                 | `useTemplateActive`    | the switch; answers the list row, swapped into every cached page; never retried                                                              |
| `POST /api/v1/mail/templates/active`                                    | `useModuleActive`      | Enable All or Disable All; answers `{ changed }`; every list page asks again                                                                 |
| `GET /api/v1/mail/templates/:id`                                        | `useEmailTemplate`     | the editor's read: versions, merge fields (`[]`: read-only), the test facts, `etag`                                                          |
| `PATCH /api/v1/mail/templates/:id`                                      | `useSaveEmailTemplate` | `If-Match` is the read's `etag`; a 412 `ERP-CORE-0013` shows `errors.ERP-MAIL-0003` and Reload; never retried                                |
| `POST /api/v1/mail/templates/:id/preview`                               | `useTemplatePreview`   | the settled draft (300 ms), through `usePostRead`                                                                                            |
| `POST /api/v1/mail/templates/:id/test`, `POST /api/v1/mail/status/test` | `useSendTest`          | one `Idempotency-Key` per click, reused by Retry; 202 `{ id }`; 429 `ERP-MAIL-0007` with `Retry-After`                                       |
| `GET /api/v1/mail/tests/:id`                                            | `useTestState`         | the member's own test, re-read every `CLIENT_TIMINGS.mail.pollMs` while queued or retrying                                                   |
| `GET /api/v1/mail/sent-emails`                                          | `ListPageTemplate`     | the log, newest first; its `filterQuery` is `sentEmailApiParams`                                                                             |
| `GET /api/v1/mail/sent-emails?limit=1`                                  | `useSentEmails`        | the meta: every stored template key (the Template options)                                                                                   |
| `GET /api/v1/mail/sent-emails/:id`                                      | `useSentEmail`         | one entry, re-read every `CLIENT_TIMINGS.mail.pollMs` while queued or retrying                                                               |
| `GET /api/v1/mail/templates?q=<key>`                                    | `useEmailTemplates`    | the entry's Template link: the log carries the key, not the template's id                                                                    |
| `POST /api/v1/mail/sent-emails/:id/resend`                              | `useResend`            | one `Idempotency-Key` per dialog opening; 202 `{ id }`; a 409 `ERP-MAIL-0002`, `0004` to `0006` stays in the dialog                          |
| `GET /api/v1/mail/status`                                               | `useEmailStatus`       | the read-only setup; read again when the page's test is sent or failed                                                                       |

`schemas/mail.schema.ts` mirrors every wire schema of plan 07 for plans 09 and 10;
`schemas/mail-names.ts` names each template and merge field's message key
(`TEMPLATE_NAME_KEYS`, `MERGE_FIELD_NAME_KEYS`). The POST read door for the preview is
`src/lib/api/use-post-read.ts`.

## Messages

`messages/en.json`, namespace `mail`, registered in `src/messages/index.ts`.

- **Legacy keys** (core legacy language pack, copied byte-identical): `email_templates`, `module`, `active`,
  `inactive`, `staff`, `contact`, `status`, `enable_all`, `disable_all`, `email_template`,
  `template_name`, `template_subject`, `email_template_email_message`, `available_merge_fields`,
  `language`, `view`, `from_date`, `to_date`, `settings_email_host`, `settings_email_port`,
  `smtp_encryption`, `smtp_encryption_none`, `settings_send_test_email_heading`; in `shell`,
  `settings_group_email` (Setup > Email).
- **Ours**: the nouns, the notice and its link, the column, filter, dialog, toast and empty texts,
  `module_label`, `locale_label`, `template_names.*`, `merge_fields.*` and `errors.*`; the
  editor's helpers, field errors and summary lines, the preview and test-send texts and
  `failure_reason.*` (`failure_reason.record_gone`, `failure_reason.template_off` and
  `template_undefined_notice` are new copy for the lead's review).

`messages/ar.json` holds the same keys with the English text, **unreviewed** placeholders (the core
Arabic pack is not extracted), until the customer's Arabic reviewer signs them off.

## How to run its tests

```bash
corepack yarn test src/features/mail
```

Every story of `EmailTemplatesList` is an `it`: `Loading`, `Empty`, `NoResults`, `Error`, `Loaded`,
`ViewOnly`, `ModuleFiltered`, `DisableAllDialog`, `SwitchPending`, `SwitchFailed`,
`TranslationMissing`, `FiltersMobileSheet`, `Mobile`, `Rtl`, and the in-shell widths 1024, 1280 and 1366.
The editor's components (`EmailTemplateForm`, `InsertMergeField`, `MergeFieldInputs`,
`TemplatePreview`, `TestSend`) have tests named after their stories; `TemplatePreview`'s "B10" case
is the sandbox proof. `SentEmailsList`, `SentEmailDetail`, `EmailStatus` and `ResendDialog` have an
`it` per story, with the in-shell widths 1024, 1280 and 1366 in Storybook.
