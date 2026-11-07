'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { InlineError } from '@/components/molecules/InlineError';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { PageSkeleton } from '@/components/organisms/PageSkeleton';
import { Button } from '@/components/ui/button';
import { TODOS_ERRORS, TODOS_PATH, type TodoStatus } from '@/features/todo/api/todo.endpoints';
import { useDeleteTodo, useFinishTodo } from '@/features/todo/hooks/use-save-todo';
import { useTodosPage } from '@/features/todo/hooks/use-todo';
import type { Todo } from '@/features/todo/schemas/todo.schema';
import { withAuth } from '@/hocs/withAuth';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists } from '@/lib/api/row-seed';
import { useErrorText } from '@/lib/errors/use-error-text';
import { useFormat } from '@/lib/i18n/format';

const LIST_BASE = '/setup/todo';

/** One row: the checkbox, the description as TEXT only (never markup), its date, Edit and Delete. */
function TodoRow({ todo }: { readonly todo: Todo }): ReactElement {
  const t = useTranslations('todo');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();
  const finish = useFinishTodo(todo.id);
  const remove = useDeleteTodo(todo.id);
  const [deleting, setDeleting] = useState(false);
  const noun = t('noun_todo');
  const stamp = todo.finished ? todo.dateFinished : todo.dateAdded;

  async function toggle(): Promise<void> {
    const outcome = await finish.trigger({ finished: !todo.finished });
    if (outcome.ok) await revalidateLists(TODOS_PATH);
  }

  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);
    if (outcome.ok) {
      toast.success(t('deleted_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
      await revalidateLists(TODOS_PATH);
    }
    return outcome;
  }

  return (
    <li className="flex items-start gap-3 border-b px-4 py-3" data-testid="todo-row">
      <input
        type="checkbox"
        className="mt-1 size-4"
        checked={todo.finished}
        disabled={finish.isMutating}
        aria-label={todo.finished ? t('mark_unfinished') : t('mark_finished')}
        onChange={() => {
          void toggle();
        }}
      />
      <div className="min-w-0 flex-1">
        <p className={todo.finished ? 'line-through' : undefined}>{todo.description}</p>
        {stamp === null ? null : (
          <time className="text-sm text-muted-foreground" dateTime={stamp}>
            {t(todo.finished ? 'finished_on' : 'added_on', { date: f.dateTime(stamp) })}
          </time>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        aria-label={t('edit_action_named', { name: todo.description })}
        onClick={() => {
          router.push(`${LIST_BASE}/${encodeURIComponent(todo.id)}`);
        }}
      >
        {tc('edit')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="text-destructive"
        aria-label={t('delete_action_named', { name: todo.description })}
        onClick={() => {
          setDeleting(true);
        }}
      >
        {tc('delete')}
      </Button>
      <ConfirmDialog
        kind="destructive"
        open={deleting}
        onOpenChange={setDeleting}
        title={t('delete_title')}
        body={t('delete_body')}
        dismissLabel={tc('keep_noun', { noun })}
        confirmLabel={tc('delete_noun', { noun })}
        pendingLabel={tc('deleting_noun', { noun })}
        featureErrors={TODOS_ERRORS}
        onConfirm={confirmDelete}
      />
    </li>
  );
}

/** One page of one panel; the LAST chunk offers "Load more" with its own `nextCursor`. */
function TodoChunk({
  status,
  cursor,
  isLast,
  onMore,
}: {
  readonly status: TodoStatus;
  readonly cursor: string | null;
  readonly isLast: boolean;
  readonly onMore: (next: string) => void;
}): ReactElement {
  const t = useTranslations('todo');
  const errorText = useErrorText(TODOS_ERRORS);
  const page = useTodosPage(status, cursor);

  if (page.data === undefined) {
    if (page.error === undefined) return <PageSkeleton variant="list" />;
    return (
      <InlineError
        message={errorText(page.error)}
        busy={page.isValidating}
        {...(page.error.retryable
          ? {
              onRetry: () => {
                void page.mutate();
              },
            }
          : {})}
      />
    );
  }

  const next = page.data.meta.nextCursor;
  return (
    <>
      {cursor === null && page.data.data.length === 0 ? (
        <p className="px-4 py-3" data-testid={`todos-empty-${status}`}>
          {status === 'unfinished' ? t('empty_unfinished') : t('empty_finished')}
        </p>
      ) : (
        <ul>
          {page.data.data.map((todo) => (
            <TodoRow key={todo.id} todo={todo} />
          ))}
        </ul>
      )}
      {isLast && next !== null ? (
        <div className="flex justify-center py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onMore(next);
            }}
          >
            {t('load_more')}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** One panel (Unfinished or Latest finished): a coloured header, then its pages. */
function TodoPanel({
  status,
  headerClass,
}: {
  readonly status: TodoStatus;
  readonly headerClass: string;
}): ReactElement {
  const t = useTranslations('todo');
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null]);
  return (
    <section className="overflow-hidden rounded-lg bg-background" data-testid={`todos-${status}`}>
      <h2 className={`px-4 py-3 font-semibold text-white ${headerClass}`}>{t(status)}</h2>
      {cursors.map((cursor, index) => (
        <TodoChunk
          key={cursor ?? 'first'}
          status={status}
          cursor={cursor}
          isLast={index === cursors.length - 1}
          onMore={(next) => {
            setCursors((current) => [...current, next]);
          }}
        />
      ))}
    </section>
  );
}

/**
 * Perfex's To Do screen (`/admin/todo`): two panels side by side, the unfinished to do's and the
 * latest finished ones, each paged by "Load more". Every visible string is a key (FE-19), classes
 * are logical (FE-20), and a description renders as React text only (never markup).
 */
export function TodosList(): ReactElement {
  const t = useTranslations('todo');
  const router = useRouter();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t('todos')}</h1>
        <Button
          type="button"
          onClick={() => {
            router.push(`${LIST_BASE}/new`);
          }}
        >
          {t('new_todo')}
        </Button>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <TodoPanel status="unfinished" headerClass="bg-amber-500" />
        <TodoPanel status="finished" headerClass="bg-sky-600" />
      </div>
    </div>
  );
}

/** Any signed-in member sees their own to do's: the auth guard only, no admin gate. */
export const GuardedTodosList = withAuth(TodosList, { skeleton: 'list' });
