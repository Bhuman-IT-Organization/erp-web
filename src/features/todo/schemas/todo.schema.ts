import { z } from 'zod';

/** Zod messages are message KEYS under the `todos` namespace (FE-12). */
export const TODOS_MESSAGE_KEYS = { description: 'enter_description' } as const;

export const todoSchema = z.object({
  id: z.string(),
  description: z.string(),
  finished: z.boolean(),
  dateAdded: z.iso.datetime().nullable(),
  dateFinished: z.iso.datetime().nullable(),
});
export type Todo = z.infer<typeof todoSchema>;

export const todosPageSchema = z.object({
  data: z.array(todoSchema),
  meta: z.object({ nextCursor: z.string().nullable(), total: z.number().int() }),
});
export type TodosPage = z.infer<typeof todosPageSchema>;

/** The form: one required field, trimmed. */
export const todosFormSchema = z.object({
  description: z.string().trim().min(1, TODOS_MESSAGE_KEYS.description),
});
export type TodosFormValues = z.infer<typeof todosFormSchema>;

export const EMPTY_TODOS_FORM: TodosFormValues = { description: '' };

export function toTodosForm(todo: Todo): TodosFormValues {
  return { description: todo.description };
}

export const finishBodySchema = z.object({ finished: z.boolean() });
export type FinishBody = z.infer<typeof finishBodySchema>;

export const TODOS_FIELDS = ['description'] as const;
export function isTodosField(value: unknown): value is (typeof TODOS_FIELDS)[number] {
  return (TODOS_FIELDS as readonly unknown[]).includes(value);
}

export const validationIssuesSchema = z.array(
  z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }),
);
