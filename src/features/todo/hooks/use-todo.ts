import { todosListPath, todosPath, type TodoStatus } from '@/features/todo/api/todo.endpoints';
import {
  todoSchema,
  todosPageSchema,
  type Todo,
  type TodosPage,
} from '@/features/todo/schemas/todo.schema';
import { useCommonApi, type CommonApiResult } from '@/lib/api/use-common-api';

/** One page of one panel (SWR, retried per the global policy for a 5xx or a network failure). */
export function useTodosPage(
  status: TodoStatus,
  cursor: string | null,
): CommonApiResult<TodosPage> {
  return useCommonApi(todosListPath(status, cursor), todosPageSchema);
}

/** One to do for the edit form; a `null` id (the create screen) is no request. */
export function useTodo(id: string | null): CommonApiResult<Todo> {
  return useCommonApi(id === null ? null : todosPath(id), todoSchema);
}
