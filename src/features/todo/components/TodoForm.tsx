'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { InlineError } from '@/components/molecules/InlineError';
import { PageSkeleton } from '@/components/organisms/PageSkeleton';
import { SchemaForm } from '@/components/organisms/SchemaForm';
import { TODOS_ERRORS, TODOS_PATH, VALIDATION_CODE } from '@/features/todo/api/todo.endpoints';
import { useSaveTodos } from '@/features/todo/hooks/use-save-todo';
import { useTodo } from '@/features/todo/hooks/use-todo';
import {
  EMPTY_TODOS_FORM,
  TODOS_MESSAGE_KEYS,
  isTodosField,
  toTodosForm,
  todosFormSchema,
  validationIssuesSchema,
  type TodosFormValues,
} from '@/features/todo/schemas/todo.schema';
import { withAuth } from '@/hocs/withAuth';
import type { ApiResult } from '@/lib/api/call-api';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists } from '@/lib/api/row-seed';
import { useErrorText } from '@/lib/errors/use-error-text';

const LIST_BASE = '/setup/todo';
const FORM_ID = 'todos';

interface TodosFormProps {
  /** The to do's id from `[id]/page.tsx`; `null` on `/todos/new`. */
  readonly id: string | null;
}

type SaveFailure = Extract<ApiResult<unknown>, { ok: false }>;

function applyValidationIssues(
  issues: unknown,
  setError: UseFormReturn<TodosFormValues>['setError'],
): void {
  const parsed = validationIssuesSchema.safeParse(issues);
  if (!parsed.success) return;

  for (const issue of parsed.data) {
    const field = issue.path[0];
    if (isTodosField(field)) {
      setError(field, { message: TODOS_MESSAGE_KEYS[field] });
    }
  }
}

function renderItemState(
  id: string | null,
  item: ReturnType<typeof useTodo>,
  errorText: ReturnType<typeof useErrorText>,
  backLabel: string,
): ReactElement | null {
  if (id === null || item.data !== undefined) return null;
  if (item.error === undefined) return <PageSkeleton variant="form" />;

  return (
    <InlineError
      message={errorText(item.error)}
      busy={item.isValidating}
      {...(item.error.retryable
        ? {
            onRetry: () => {
              void item.mutate();
            },
          }
        : {})}
      back={{ href: LIST_BASE, label: backLabel }}
    />
  );
}
const REQUIRED_MARK = '*';
/** The To Do create and edit page (Perfex's modal, a page here): one required field. */
export function TodosForm({ id }: TodosFormProps): ReactElement {
  const t = useTranslations('todo');
  const tc = useTranslations('common');
  const router = useRouter();
  const errorText = useErrorText(TODOS_ERRORS);
  const item = useTodo(id);

  const form = useForm<TodosFormValues>({
    resolver: zodResolver(todosFormSchema),
    defaultValues: EMPTY_TODOS_FORM,
    ...(item.data === undefined ? {} : { values: toTodosForm(item.data) }),
    resetOptions: { keepDirtyValues: true },
  });

  const { create, update } = useSaveTodos(id);
  const mutation = id === null ? create : update;
  const [failure, setFailure] = useState<SaveFailure | null>(null);

  async function send(values: TodosFormValues): Promise<void> {
    setFailure(null);
    const outcome = await mutation.trigger(values);

    if (outcome.ok) {
      await revalidateLists(TODOS_PATH);
      toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
      router.push(LIST_BASE);
      return;
    }

    if (outcome.code === VALIDATION_CODE) {
      applyValidationIssues(outcome.issues, form.setError);
      return;
    }

    setFailure(outcome);
  }

  const itemState = renderItemState(id, item, errorText, tc('back_to_list'));
  if (itemState !== null) return itemState;

  const noun = t('noun_todo');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t(id === null ? 'new_todo' : 'edit_todo')}</h1>

      <SchemaForm
        id={FORM_ID}
        form={form}
        sections={[
          {
            id: 'details',
            title: t('section_details'),
            fields: [
              {
                name: 'description',
                label: t('description'),
                kind: 'custom',
                required: true,
                render: (field, state) => (
                  <>
                    <label htmlFor={state.id} className="text-sm font-medium">
                      {t('description')}
                      <span className="text-destructive" aria-hidden="true">
                        {REQUIRED_MARK}
                      </span>
                    </label>

                    <textarea
                      id={state.id}
                      name={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      disabled={state.disabled}
                      aria-invalid={state.invalid}
                      aria-required="true"
                      aria-describedby={state.describedBy || undefined}
                      className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </>
                ),
              },
            ],
          },
        ]}
        onValid={(values) => {
          void send(values);
        }}
        translateError={(key) => t(key)}
        submitLabel={tc(id === null ? 'create_noun' : 'save_noun', { noun })}
        pendingLabel={tc(id === null ? 'creating_noun' : 'saving_noun', { noun })}
        isPending={mutation.isMutating}
        onBack={() => {
          router.push(LIST_BASE);
        }}
        serverError={
          failure === null
            ? null
            : {
                message: errorText(failure),
                onRetry: () => {
                  void send(form.getValues());
                },
              }
        }
      />
    </div>
  );
}

export const GuardedTodosForm = withAuth(TodosForm, { skeleton: 'form' });
