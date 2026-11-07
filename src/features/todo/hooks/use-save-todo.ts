import { z } from 'zod';
import {
  TODOS_ENDPOINTS,
  TODOS_PATH,
  todoFinishedPath,
  todosPath,
} from '@/features/todo/api/todo.endpoints';
import {
  todoSchema,
  type FinishBody,
  type Todo,
  type TodosFormValues,
} from '@/features/todo/schemas/todo.schema';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';

export interface TodosSave {
  readonly create: CommonMutation<TodosFormValues, Todo>;
  readonly update: CommonMutation<TodosFormValues, Todo>;
}

/** The form's two writes. NEVER retried automatically; the screen revalidates the lists. */
export function useSaveTodos(id: string | null): TodosSave {
  const create = useCommonMutation<TodosFormValues, Todo>(TODOS_PATH, {
    method: TODOS_ENDPOINTS.create.method,
    schema: todoSchema,
    invalidate: [],
  });
  const update = useCommonMutation<TodosFormValues, Todo>(
    id === null ? TODOS_PATH : todosPath(id),
    { method: TODOS_ENDPOINTS.update.method, schema: todoSchema, invalidate: [] },
  );
  return { create, update };
}

/** `PATCH /todos/:id/finished`: the checkbox of a row. */
export function useFinishTodo(id: string): CommonMutation<FinishBody, Todo> {
  return useCommonMutation<FinishBody, Todo>(todoFinishedPath(id), {
    method: TODOS_ENDPOINTS.finish.method,
    schema: todoSchema,
    invalidate: [],
  });
}

/** `DELETE /todos/:id`: 204 is success, a 404 is a resolved failure the dialog shows. */
export function useDeleteTodo(id: string): CommonMutation<undefined, null> {
  return useCommonMutation<undefined, null>(todosPath(id), {
    method: TODOS_ENDPOINTS.remove.method,
    schema: z.null(),
    invalidate: [],
    expectNoContent: true,
  });
}
