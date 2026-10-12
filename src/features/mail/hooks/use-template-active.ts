import { MAIL_TEMPLATES_PATH, mailPaths } from '@/features/mail/api/mail.endpoints';
import {
  moduleActiveResponseSchema,
  templateListItemSchema,
  type TemplateListItem,
} from '@/features/mail/schemas/mail.schema';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';

/**
 * `PUT :id/active`, the list's immediate switch (UI-SPEC § Email Templates list, PATTERNS M11): its
 * own mutation, never retried (ADR-0031 §5). It answers the saved list row, which the screen swaps
 * into every cached list page (`replaceRowInLists`), so nothing is invalidated.
 */
export function useTemplateActive(
  id: string,
): CommonMutation<{ active: boolean }, TemplateListItem> {
  return useCommonMutation(mailPaths.templateActive(id), {
    method: 'PUT',
    schema: templateListItemSchema,
    invalidate: [],
  });
}

/**
 * `POST templates/active`, Enable All or Disable All of one module (choice 5): answers how many
 * templates changed; every cached list page and count asks again.
 */
export function useModuleActive(): CommonMutation<
  { module: string; active: boolean },
  { readonly changed: number }
> {
  return useCommonMutation(mailPaths.templatesActive, {
    method: 'POST',
    schema: moduleActiveResponseSchema,
    invalidate: [MAIL_TEMPLATES_PATH],
  });
}
