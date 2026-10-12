/**
 * The message keys of the templates' and merge fields' names (04.3 UI-SPEC § Template names and
 * merge fields): names only, from Perfex's mail class slugs and merge-field classes, never a body
 * or a subject. Every key is written out so FE-19's "every `en` key referenced" sees it; a module
 * that later moves adds its rows here and in `messages/*.json`.
 */
export const TEMPLATE_NAME_KEYS = {
  attendance_notice: 'template_names.attendance_notice',
  send_request_approval: 'template_names.send_request_approval',
  remind_user_check_in: 'template_names.remind_user_check_in',
  new_leave_application_send_to_notification_recipient:
    'template_names.new_leave_application_send_to_notification_recipient',
} as const;

export const MERGE_FIELD_NAME_KEYS = {
  staff_name: 'merge_fields.staff_name',
  type_check: 'merge_fields.type_check',
  date_time: 'merge_fields.date_time',
  approver: 'merge_fields.approver',
  link: 'merge_fields.link',
  staff_id: 'merge_fields.staff_id',
} as const;

/** An own key of `table`, never an inherited one (`toString`, `__proto__`). */
function ownValue(table: Readonly<Record<string, string>>, key: string): string | null {
  return Object.hasOwn(table, key) ? (table[key] ?? null) : null;
}

/** The name key of a template, or null: the caller then shows the raw key in `<bdi>`. */
export function templateNameKey(key: string): string | null {
  return ownValue(TEMPLATE_NAME_KEYS, key);
}

/** The name key of a merge field, by its token with or without the braces (`{staff_name}`). */
export function mergeFieldNameKey(token: string): string | null {
  return ownValue(MERGE_FIELD_NAME_KEYS, token.replace(/^\{|\}$/g, ''));
}
